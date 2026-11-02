import type { Knex } from 'knex';

// Who took part in each world event, and how much (Nathan, 2026-11-02): a
// place shows its last event's ten busiest players and the guilds that took
// part most, until the next event there (services/worldEvents.ts
// eventStandingsAt). Invasions, when they come, record into the same table.
//
//   world_event_participation   one row per event per player. actions counts
//                               the event's units the player's work took from
//                               its pool (applyEventBonus), so an action that
//                               paid for twenty plots counts twenty. guild_id
//                               is the player's guild when they last took part,
//                               kept as it was so a later move does not
//                               rewrite who an event's work was done for.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('world_event_participation'))) {
        await knex.schema.createTable('world_event_participation', t => {
            t.integer('event_id').notNullable().references('id').inTable('world_events').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('guild_id').nullable().references('id').inTable('guilds').onDelete('SET NULL');
            t.integer('actions').notNullable().defaultTo(0);
            t.primary(['event_id', 'player_id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('world_event_participation');
}
