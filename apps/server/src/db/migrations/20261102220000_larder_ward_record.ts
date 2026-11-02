import type { Knex } from 'knex';

// Larder Ward touch-ups (forum, 2026-11-02): the spellbook shows a ward that
// holds, with its time left, and it can be ended early for the Talar of the
// hours not used (services/spells.ts endLarderWard).
//
//   larder_wards   one row per player while a ward holds: what was paid for
//                  it, for how many head and hours, and when it ends. The pens'
//                  own warded_from/warded_until stay the ward itself.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('larder_wards'))) {
        await knex.schema.createTable('larder_wards', t => {
            t.integer('player_id').primary().references('id').inTable('players').onDelete('CASCADE');
            t.integer('head').notNullable();
            t.integer('hours').notNullable();
            t.integer('paid_hundredths').notNullable();
            t.timestamp('starts_at', { useTz: true }).notNullable();
            t.timestamp('ends_at', { useTz: true }).notNullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('larder_wards');
}
