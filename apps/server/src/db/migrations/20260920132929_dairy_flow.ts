import type { Knex } from 'knex';

/**
 * Cows milk twice as fast, bank twice as much, and pay the same per hour.
 *
 * Milk is the neck of the longest chain in the game. Butter and cheese come off
 * it, every meal provision needs one or the other, and the cow behind it was
 * gated on a 1.5% calf roll (raised to 3% and Husbandry-scaled in
 * 20260919142039) followed by 3 hours per milk with a backlog of 4. A full
 * paddock of three therefore produced one milk an hour, and a butter is one
 * milk, so the dairy line metered the whole top of the cooking tree.
 *
 * 90 minutes per milk with a backlog of 6 doubles the flow and doubles what a
 * cow holds while its keeper is away. Three cows now yield six milk in the time
 * they used to yield three, and a paddock left overnight has banked eighteen
 * rather than twelve.
 *
 * xp_product HALVES to keep the hourly rate exactly where the husbandry sim put
 * it. Twice the collections at the same XP each would have doubled Husbandry's
 * XP per hour and broken its parity with Farming, which is the one thing the
 * backlog migration was careful to preserve. The player gets twice the milk and
 * the same experience, which is the trade being made on purpose: this is a
 * materials fix, not a levelling one.
 *
 * Note on the fill window: the backlog convention is that an animal fills in
 * about half a feeding window, so 12 hours. At 90 minutes a cap of 8 would hit
 * that exactly; 6 fills in 9 hours, which is deliberately a little tighter, so
 * a farm visited twice a day still collects everything and one left for days
 * has plainly wasted something.
 */

const COW = 'Cow';

const FROM = { product_seconds: 3 * 60 * 60, product_max_stored: 4, xp_product: 310 };
const TO = { product_seconds: 90 * 60, product_max_stored: 6, xp_product: 155 };

export async function up(knex: Knex): Promise<void> {
    const cow = await knex('animal_species').where({ name: COW }).first();
    if (!cow) {
        throw new Error('dairy_flow: no animal species named "Cow". The husbandry content migration must run first.');
    }

    // Only move values that are still where the seed left them: anything tuned
    // in the admin panel since is somebody's decision, not drift to correct.
    if (Number(cow.product_seconds) !== FROM.product_seconds) {
        throw new Error(
            `dairy_flow: Cow product_seconds is ${cow.product_seconds}, expected ${FROM.product_seconds}. `
            + 'It has been tuned since — check the intended numbers before forcing this through.',
        );
    }

    await knex('animal_species').where({ id: cow.id }).update(TO);
}

export async function down(knex: Knex): Promise<void> {
    await knex('animal_species').where({ name: COW }).update(FROM);
}
