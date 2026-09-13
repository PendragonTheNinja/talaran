import type { Knex } from 'knex';

/**
 * Bees do not grow up.
 *
 * The beekeeping migration gave them an 8 hour grow_seconds, on the idea that a
 * caught colony "settles in". In practice that made a freshly placed skep read
 * as a juvenile: "Young, growing 8h", with the collect timer paused behind it.
 *
 * There is no such thing as a young bee you wait on. You caught a working hive
 * and hung it on a stand. stageOf already treats a grow_seconds of 0 as adult
 * on arrival, so this is the whole fix.
 */

export async function up(knex: Knex): Promise<void> {
    await knex('animal_species').where({ name: 'Bees' }).update({ grow_seconds: 0 });

    // Anything already placed is a working hive too, not a juvenile waiting out
    // a clock that should never have been started.
    const bees = await knex('animal_species').where({ name: 'Bees' }).first();
    if (bees) {
        await knex('player_animals')
            .where({ species_id: bees.id })
            .update({ grow_seconds_accrued: 0 });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('animal_species').where({ name: 'Bees' }).update({ grow_seconds: 8 * 60 * 60 });
}
