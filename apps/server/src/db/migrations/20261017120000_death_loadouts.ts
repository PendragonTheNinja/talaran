import type { Knex } from 'knex';

// What a player had on when they died, slot by slot (Nathan, 2026-10-17, from
// a forum post). Death puts worn gear and the pack into one pile, one stack per
// item (services/groundItems.ts dropEverythingWithin), which loses which piece
// was worn. This keeps it, so taking the pile back while it is still private
// puts the gear back on (restoreDeathLoadoutWithin in services/equipment.ts).
//
// died_at is the pile's own dropped_at, so only stacks from that death match;
// a later death replaces the rows. Player data, not content: nothing to import.

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('death_loadouts')) return;
    await knex.schema.createTable('death_loadouts', (t) => {
        t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
        // The player_equipment column's slot name: 'mainhand', 'head', ...
        t.string('slot', 20).notNullable();
        t.integer('item_id').notNullable().references('id').inTable('items').onDelete('CASCADE');
        t.integer('location_id').notNullable();
        t.timestamp('died_at', { useTz: true }).notNullable();
        t.primary(['player_id', 'slot']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('death_loadouts');
}
