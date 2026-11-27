import type { Knex } from 'knex';

// Three supporter pieces (docs/taler-perks-ideas.md; Nathan, 2026-11-27):
//
//   players.name_color              a curated color for one's name in chat and
//                                   Players Here (perk:name_color; the keys are
//                                   NAME_COLORS in services/store.ts).
//   store_gifts                     every store item bought for someone else:
//                                   who gave, who got it, what, and when.
//   player_settings.hide_from_patrons  leave oneself off the museums' Patrons
//                                   plaque, the ten who have given most.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('players', 'name_color'))) {
        await knex.schema.alterTable('players', (t) => { t.string('name_color', 20).nullable(); });
    }
    if (!(await knex.schema.hasTable('store_gifts'))) {
        await knex.schema.createTable('store_gifts', (t) => {
            t.increments('id').primary();
            t.integer('from_player_id').notNullable().references('id').inTable('players').onDelete('RESTRICT');
            t.integer('to_player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('item_key', 64).notNullable();
            t.integer('talers').notNullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['to_player_id']);
        });
    }
    if (!(await knex.schema.hasColumn('player_settings', 'hide_from_patrons'))) {
        await knex.schema.alterTable('player_settings', (t) => { t.boolean('hide_from_patrons').notNullable().defaultTo(false); });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_settings', 'hide_from_patrons')) {
        await knex.schema.alterTable('player_settings', (t) => { t.dropColumn('hide_from_patrons'); });
    }
    await knex.schema.dropTableIfExists('store_gifts');
    if (await knex.schema.hasColumn('players', 'name_color')) {
        await knex.schema.alterTable('players', (t) => { t.dropColumn('name_color'); });
    }
}
