import type { Knex } from 'knex';

/**
 * Honey pays less.
 *
 * Bees shipped at 260 XP a comb, which works out at 65 xp/hr and put them above
 * Chicken at 40 and Pig at 47. That is backwards: a hive is the only animal in
 * the game with no feeding, no mucking and no growing to wait through, so it
 * should not out-earn the ones that ask for daily work.
 *
 * 90 a comb is 22 xp/hr, comfortably under everything else. The reason to keep
 * bees is honey and wax, not experience.
 */

export async function up(knex: Knex): Promise<void> {
    await knex('animal_species').where({ name: 'Bees' }).update({ xp_product: 90 });
}

export async function down(knex: Knex): Promise<void> {
    await knex('animal_species').where({ name: 'Bees' }).update({ xp_product: 260 });
}
