import type { Knex } from 'knex';

// Private guild forums.
//
// Implemented as a nullable guild_id on forum_categories rather than a parallel
// set of tables. A category with guild_id set is visible only to members of that
// guild; everything downstream (threads, posts, polls, voting, pinning, locking,
// moderation) hangs off category_id and therefore works unchanged.
//
// The cost of that decision is that every forum read must filter by category
// visibility, which routes/forum.ts now does through a single shared helper
// rather than per-endpoint checks. Thirteen endpoints touch forum data and
// missing one would expose a guild's private threads.
//
// Every existing guild gets a category here, and guild creation makes one from
// now on, so the feature is never in a half-provisioned state.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('forum_categories', (table) => {
        table.integer('guild_id').unsigned().nullable()
            .references('id').inTable('guilds').onDelete('CASCADE');
        table.index(['guild_id']);
    });

    // Sort guild boards after the public ones.
    const maxRow = await knex('forum_categories').max('sort_order as m').first();
    let sort = Number(maxRow?.m ?? 0) + 100;

    const guilds = await knex('guilds').select('id', 'name');

    for (const guild of guilds) {
        const existing = await knex('forum_categories').where({ guild_id: guild.id }).first();
        if (existing) continue;

        await knex('forum_categories').insert({
            name: `${guild.name} Hall`,
            description: `Private discussion for ${guild.name}. Only members can see this board.`,
            sort_order: sort++,
            staff_only: false,
            admin_post_only: false,
            has_voting: false,
            guild_id: guild.id,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    // Guild boards exist only because of this column, so they go with it.
    await knex('forum_categories').whereNotNull('guild_id').delete();

    await knex.schema.alterTable('forum_categories', (table) => {
        table.dropColumn('guild_id');
    });
}
