import type { Knex } from 'knex';

// Loadouts (Nathan, 2026-11-07): a few named snapshots of what a player wears,
// put back on in one tap from the pack (services/loadouts.ts). `slots` maps a
// slot name to an item id; a slot that was empty when saved is left out, and
// wearing the loadout leaves that slot as it is.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_loadouts'))) {
        await knex.schema.createTable('player_loadouts', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('name', 30).notNullable();
            t.jsonb('slots').notNullable().defaultTo('{}');
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.unique(['player_id', 'name']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_loadouts');
}
