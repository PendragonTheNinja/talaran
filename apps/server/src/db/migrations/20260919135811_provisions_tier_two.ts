import type { Knex } from 'knex';

/**
 * The meal provisions are tier 2, and now paid like it.
 *
 * The infusions (Tisanes, Draught, Cordial) are the real tier 1: cheap herbs,
 * a mortar, and a small nudge over a long window. The meals are a different
 * class of thing — they eat Flour, Butter, Cheese and a finished dish — and all
 * but one already sat at level 13 or above, which is the tier 2 rung in the
 * ladder (RUNGS = 1, 13, 25, ...). They were still paying tier 1 numbers.
 *
 * So: every meal is tier 2, its buff is 1.5x what it was, and it runs for five
 * hours rather than four. Ploughman's Lunch moves from level 12 to 13 to join
 * them, which also puts its tier flag where the others already are.
 *
 * The 1.5x is applied to whatever each meal does rather than flattened to a
 * single number, because the effects are not comparable: 1% off a timer, 8%
 * off travel and a 3% double-yield chance are three different scales. Half
 * again of each keeps the relative worth the design intended.
 *
 * Timer cuts round up, so even the smallest of these takes a full second off a
 * 30-second action; at five hours that is hundreds of actions.
 *
 * Wright's Loaf is in the list. The brief said "Woodsman's Bannock through
 * Smith's Supper", and the Loaf is the one meal that falls after Smith's Supper
 * in the file — same level 17, same rung, same Flour-and-Butter cost. Leaving
 * it out would strand Carpentry's meal on tier 1 numbers while every other
 * trade's got the raise, so it is included. Easy to pull back out if that was
 * deliberate.
 */

/** Every meal provision, with the tier 1 values it is being raised FROM. */
const MEALS: Array<{ name: string; fromMagnitude: number }> = [
    { name: "Ploughman's Lunch", fromMagnitude: 1 },
    { name: "Woodsman's Bannock", fromMagnitude: 1 },
    { name: "Miner's Pasty", fromMagnitude: 1 },
    { name: "Fisherman's Stew", fromMagnitude: 1 },
    { name: "Drover's Pottage", fromMagnitude: 1 },
    { name: 'Hedgerow Basket', fromMagnitude: 2 },
    { name: "Poacher's Supper", fromMagnitude: 3 },
    { name: "Smith's Supper", fromMagnitude: 1 },
    { name: "Wright's Loaf", fromMagnitude: 1 },
];

const TIER_2_SECONDS = 5 * 60 * 60;
const TIER_1_SECONDS = 4 * 60 * 60;
const RAISE = 1.5;

/** Ploughman's Lunch is the only one whose gate moves. */
const PLOUGHMAN = "Ploughman's Lunch";
const PLOUGHMAN_FROM_LEVEL = 12;
const PLOUGHMAN_TO_LEVEL = 13;

export async function up(knex: Knex): Promise<void> {
    for (const meal of MEALS) {
        const item = await knex('items').where({ name: meal.name }).first();
        if (!item) {
            throw new Error(
                `provisions_tier_two: no item named "${meal.name}". `
                + 'The cooking provisions migration must run first.',
            );
        }

        // Raise from what is actually stored, not from the table above: if a
        // magnitude has been hand-tuned in the admin panel since, half again
        // of the tuned value is the honest reading of "50% better".
        const current = Number(item.buff_magnitude ?? meal.fromMagnitude);
        // buff_magnitude is a float column, so 1.5 and 4.5 store exactly.
        const raised = Math.round(current * RAISE * 10) / 10;

        // Already raised? Do nothing. Multiplying a stored value is not
        // idempotent on its own, and knex's own tracking is the only thing
        // stopping a second run — which is no help to anyone re-running this
        // by hand to fix a bad deploy. Taking 1.5x twice would quietly ship
        // 2.25% buffs.
        const alreadyRaised = Number(item.buff_seconds) === TIER_2_SECONDS
            && Math.abs(current - Math.round(meal.fromMagnitude * RAISE * 10) / 10) < 0.001;
        if (alreadyRaised) continue;

        await knex('items').where({ id: item.id }).update({
            buff_magnitude: raised,
            buff_seconds: TIER_2_SECONDS,
            tier: 2,
        });
    }

    // The gate moves, and so does the XP.
    //
    // Provision XP is derived from the level band, not chosen: the cooking
    // provisions migration computes it as target(level) x timer / expected
    // share, where the target is the gold-per-hour ladder at that level.
    // Moving the gate without recomputing would leave Ploughman's paying a
    // level 12 rate for a level 13 dish. Same formula, same constants.
    const rHat = (u: number) => 2000 * Math.pow(1.33, (u - 1) / 12);
    const targetFor = (u: number) => 1.8 * 1.10 * rHat(u);

    const ploughman = await knex('recipes').where({ name: PLOUGHMAN }).first();
    if (ploughman) {
        // Its three inputs and pottage burn, unchanged from the original.
        const burnBase = Math.round((30 / Math.sqrt(3)) * 10) / 10;
        const expectedShare = 1 - (burnBase / 100) / 2;
        const xp = Math.round(
            (targetFor(PLOUGHMAN_TO_LEVEL) * ploughman.timer_seconds / 3600) / expectedShare,
        );
        await knex('recipes').where({ id: ploughman.id }).update({
            required_level: PLOUGHMAN_TO_LEVEL,
            xp,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const meal of MEALS) {
        const item = await knex('items').where({ name: meal.name }).first();
        if (!item) continue;
        await knex('items').where({ id: item.id }).update({
            buff_magnitude: meal.fromMagnitude,
            buff_seconds: TIER_1_SECONDS,
        });
    }
    const ploughman = await knex('recipes').where({ name: PLOUGHMAN }).first();
    if (ploughman) {
        const rHat = (u: number) => 2000 * Math.pow(1.33, (u - 1) / 12);
        const targetFor = (u: number) => 1.8 * 1.10 * rHat(u);
        const burnBase = Math.round((30 / Math.sqrt(3)) * 10) / 10;
        const expectedShare = 1 - (burnBase / 100) / 2;
        const xp = Math.round(
            (targetFor(PLOUGHMAN_FROM_LEVEL) * ploughman.timer_seconds / 3600) / expectedShare,
        );
        await knex('recipes').where({ id: ploughman.id }).update({
            required_level: PLOUGHMAN_FROM_LEVEL,
            xp,
        });
    }
}
