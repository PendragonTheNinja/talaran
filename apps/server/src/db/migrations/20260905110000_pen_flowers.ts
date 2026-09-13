import type { Knex } from 'knex';

/**
 * Flowers in the apiary.
 *
 * Bees take no feed, so an apiary would otherwise be a pen with no upkeep at
 * all. Flowers are that upkeep, and they are the right one: a hive with nothing
 * flowering within reach makes very little honey, which is true of real bees and
 * gives the flower items something to do.
 *
 * A pen row rather than a workstation row. An earlier plan had flowers sharing
 * the workstation slot system, and an apiary/flower definition was seeded into
 * workstation_slot_types on that basis. Then the apiary became a pen type, and
 * workstation_slots keys off workstation_id, which is per player per LOCATION
 * rather than per pen. That row is removed here: nothing will ever read it.
 *
 * Any flower counts. Every island gets its own and there is no tier list for
 * them, so a Daisy is worth the same as a Faelight Bloom. That also finally
 * gives Taiaria, Tal's Hope and Daisy a use, having been found while walking
 * without a horse and been good for nothing since.
 */

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('pen_flowers'))) {
        await knex.schema.createTable('pen_flowers', (t) => {
            t.increments('id').primary();
            t.integer('pen_id').unsigned().notNullable()
                .references('id').inTable('player_pens').onDelete('CASCADE');
            // 0..9. Ten per apiary, so a full stand is a real investment without
            // being an endless sink.
            t.integer('slot_index').unsigned().notNullable();
            t.string('item_name', 100).notNullable();
            t.timestamp('planted_at').notNullable().defaultTo(knex.fn.now());
            t.unique(['pen_id', 'slot_index']);
            t.index(['pen_id']);
        });
    }

    // The orphan. Removing the definition also removes any slots socketed
    // against it, since workstation_slots cascades from the workstation row and
    // no apiary workstation was ever created.
    await knex('workstation_slot_types').where({ station_type: 'apiary' }).delete();
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('pen_flowers');

    const existing = await knex('workstation_slot_types')
        .where({ station_type: 'apiary', slot: 'flower' }).first();
    if (!existing) {
        await knex('workstation_slot_types').insert({
            station_type: 'apiary',
            slot: 'flower',
            label: 'Flowers',
            capacity: 10,
            accepts_subtype: 'flower',
            accepts_names: null,
            is_required: false,
            display_order: 1,
        });
    }
}
