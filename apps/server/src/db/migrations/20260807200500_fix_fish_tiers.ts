import type { Knex } from 'knex';

// Every fish on Taiar is tier 1, and ten of them were not.
//
// THE RULE (recorded in CLAUDE.md §4): an item's tier is the band of the LOWEST
// LEVEL AT WHICH IT CAN BE OBTAINED, not a judgement about how impressive it is.
//   tier 1 = obtainable below level 13
//   tier 2 = 13-24
//   tier 3 = 25-36, and so on in twelves
//
// Taiar hosts nothing above tier 2, and its fish span levels 1 to 9, so the lot
// of them are tier 1. Conger Eel being a 133 pound monster does not make it
// tier 2; it is catchable at Fishing 6.
//
// I set these by eye, copying the pattern of existing items that were themselves
// mis-tiered. Tier is derived, never chosen.

const FISH = [
    'Tiddle', 'Brook Dace', 'Perch', 'Burbot', 'Chalkarp', 'Pike', 'Frostgill',
    'Whiting', 'Black Bream', 'Dawn Sprat', 'Garfish', 'John Dory', 'Gurnard',
    'Conger Eel', 'Duskfin', 'Wolffish', 'Stormer', 'Sabreling',
];

export async function up(knex: Knex): Promise<void> {
    const updated = await knex('items').whereIn('name', FISH).update({ tier: 1 });
    if (updated !== FISH.length) {
        // Loud rather than silent: a rename upstream would leave fish behind at
        // the wrong tier with nothing to show it.
        throw new Error(
            `fix_fish_tiers: expected to update ${FISH.length} fish, updated ${updated}`,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    // The values as originally shipped, wrong though they were.
    await knex('items').whereIn('name', ['Chalkarp', 'Pike', 'Frostgill', 'John Dory', 'Gurnard', 'Conger Eel', 'Duskfin']).update({ tier: 2 });
    await knex('items').whereIn('name', ['Wolffish', 'Stormer', 'Sabreling']).update({ tier: 3 });
}
