import type { Knex } from 'knex';

/**
 * Rare buffs are proportional now, so their magnitudes change units.
 *
 * They shipped as percentage POINTS added to a drop roll, which warps rare
 * drops out of all recognition: +1.5 points takes a 1-in-650 wild hive from
 * 0.15% to 1.65%, eleven times as likely, while doing almost nothing to a
 * 1-in-4 common. The buff was meant to be a nudge.
 *
 * services/drops.ts now applies it as a PERCENT INCREASE to the chance, so a
 * 10% buff is 10% better whether the drop is common or the rarest thing in the
 * game. These two rows are restated in the new units:
 *
 *   Dandelion Cordial  1.5 points -> 10%   (1 in 650 becomes 1 in 591)
 *   Hedgerow Basket    2 points   -> 15%   (1 in 650 becomes 1 in 565)
 */

export async function up(knex: Knex): Promise<void> {
    await knex('items').where({ name: 'Dandelion Cordial' }).update({ buff_magnitude: 10 });
    await knex('items').where({ name: 'Hedgerow Basket' }).update({ buff_magnitude: 15 });
}

export async function down(knex: Knex): Promise<void> {
    await knex('items').where({ name: 'Dandelion Cordial' }).update({ buff_magnitude: 1.5 });
    await knex('items').where({ name: 'Hedgerow Basket' }).update({ buff_magnitude: 2 });
}
