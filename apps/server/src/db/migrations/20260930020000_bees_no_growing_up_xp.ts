import type { Knex } from 'knex';

/**
 * Bees are not paid for growing up.
 *
 * `20260905170000_bees_no_growth` made a caught hive adult on arrival, but left
 * its xp_mature at 200. The juvenile guard in payMaturityXp could not catch an
 * animal that is never young, so every new hive paid 200 Husbandry XP the next
 * time its owner's pens were read, with nothing on screen to say why.
 *
 * The code now refuses growing-up XP to anything with no grow time. This sets
 * the row to match, so the data says what the game does. Hives already placed
 * are marked paid for the same reason.
 */

export async function up(knex: Knex): Promise<void> {
    const bees = await knex('animal_species').where({ name: 'Bees' }).first();
    if (!bees) {
        // A fresh database migrates before its content is imported, and the
        // import brings the row as it is now. Anywhere else, a missing hive is
        // a mistake worth stopping for.
        const [{ n }] = await knex('animal_species').count('* as n');
        if (Number(n) === 0) return;
        throw new Error('bees_no_growing_up_xp: no animal_species row named "Bees"');
    }
    await knex('animal_species').where({ id: bees.id }).update({ xp_mature: 0 });
    await knex('player_animals').where({ species_id: bees.id }).update({ mature_xp_paid: true });
}

export async function down(knex: Knex): Promise<void> {
    await knex('animal_species').where({ name: 'Bees' }).update({ xp_mature: 200 });
}
