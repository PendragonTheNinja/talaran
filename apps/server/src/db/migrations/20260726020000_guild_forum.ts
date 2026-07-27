import type { Knex } from 'knex';

// Per-guild forums: each guild gets its own forum inside its own page, with
// categories the guild creates and permissions the guild sets.
//
// Deliberately SEPARATE tables rather than a guild_id bolted onto the public
// forum. Two reasons:
//
//   1. A guild forum is guild-scoped by definition, so membership can be checked
//      once in a single router-level middleware. Sharing the public forum's
//      tables meant guarding thirteen endpoints individually, where missing one
//      would leak a guild's private threads.
//   2. Guilds set their own categories and their own view/post permissions.
//      The public forum's category flags (staff_only, admin_post_only) model a
//      different thing entirely.
//
// guild_id is denormalised onto threads and posts on purpose: every query can
// scope by it directly, so a mistake in a join cannot leak across guilds.
//
// Role ranks, matching guild_members.role: member 1, leader 2, founder 3.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('guild_forum_categories', (table) => {
        table.increments('id').primary();
        table.integer('guild_id').unsigned().notNullable()
            .references('id').inTable('guilds').onDelete('CASCADE');

        table.string('name', 100).notNullable();
        table.string('description', 300).nullable();
        table.integer('sort_order').notNullable().defaultTo(0);

        // Minimum role rank required. 1 = every member, 2 = leaders, 3 = founder.
        table.integer('min_role_view').notNullable().defaultTo(1);
        table.integer('min_role_post').notNullable().defaultTo(1);

        table.integer('created_by').unsigned().nullable()
            .references('id').inTable('players').onDelete('SET NULL');
        table.timestamps(true, true);

        table.index(['guild_id', 'sort_order']);
    });

    await knex.schema.createTable('guild_forum_threads', (table) => {
        table.increments('id').primary();
        table.integer('guild_id').unsigned().notNullable()
            .references('id').inTable('guilds').onDelete('CASCADE');
        table.integer('category_id').unsigned().notNullable()
            .references('id').inTable('guild_forum_categories').onDelete('CASCADE');
        table.integer('author_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');

        table.string('title', 200).notNullable();
        table.boolean('is_pinned').notNullable().defaultTo(false);
        table.boolean('is_locked').notNullable().defaultTo(false);
        table.boolean('is_deleted').notNullable().defaultTo(false);

        table.integer('reply_count').notNullable().defaultTo(0);
        table.timestamp('last_post_at').nullable();
        table.integer('last_post_by').unsigned().nullable()
            .references('id').inTable('players').onDelete('SET NULL');

        table.timestamps(true, true);

        table.index(['guild_id']);
        table.index(['category_id', 'is_pinned', 'last_post_at']);
    });

    await knex.schema.createTable('guild_forum_posts', (table) => {
        table.increments('id').primary();
        table.integer('guild_id').unsigned().notNullable()
            .references('id').inTable('guilds').onDelete('CASCADE');
        table.integer('thread_id').unsigned().notNullable()
            .references('id').inTable('guild_forum_threads').onDelete('CASCADE');
        table.integer('author_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');

        table.text('content').notNullable();
        table.boolean('is_deleted').notNullable().defaultTo(false);
        table.timestamp('edited_at').nullable();
        table.timestamps(true, true);

        table.index(['thread_id', 'created_at']);
        table.index(['guild_id']);
    });

    // Every existing guild gets a starter category, so no guild opens its forum
    // to an empty screen with no way to create one if its leader is inactive.
    const guilds = await knex('guilds').select('id');

    for (const guild of guilds) {
        await knex('guild_forum_categories').insert({
            guild_id: guild.id,
            name: 'General',
            description: 'Anything and everything.',
            sort_order: 0,
            min_role_view: 1,
            min_role_post: 1,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('guild_forum_posts');
    await knex.schema.dropTableIfExists('guild_forum_threads');
    await knex.schema.dropTableIfExists('guild_forum_categories');
}
