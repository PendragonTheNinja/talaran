import db from '../db';

// The tool requirement for Carpentry construction, in ONE place.
//
// This exists because it was got wrong three times in three skills. Farming and
// shops both checked the mallet as EQUIPPED and the saw as merely CARRIED, so a
// saw sitting in the pack satisfied a requirement that was meant to occupy a
// hand. Husbandry got it right independently, which meant two behaviours for
// one rule and no obvious way to tell which was correct.
//
// Anything raised with Carpentry imports from here. Do not write a local copy.
//
// The slot map is the load-bearing part: a mallet is mainhand and a saw is
// offhand, so both fit at once, and checking the wrong column silently fails
// for one of them.

export const BUILD_MALLET = { subtype: 'mallet', itemName: 'Lanai Mallet' };
export const BUILD_SAW = { subtype: 'saw', itemName: 'Ambren Saw' };

/** Which equipment column each build tool must occupy. */
export const TOOL_SLOT_COLUMN: Record<string, string> = {
    mallet: 'mainhand_item_id',
    saw: 'offhand_item_id',
};

type Ex = any;   // knex instance or transaction

/** The equipped item of a given subtype, or null. Slot-aware. */
export async function equippedBuildTool(playerId: number, subtype: string, x: Ex = db) {
    const column = TOOL_SLOT_COLUMN[subtype];
    if (!column) return null;
    const equipment = await x('player_equipment').where({ player_id: playerId }).first();
    const id = equipment?.[column];
    if (!id) return null;
    return x('items').where({ id, subtype }).first();
}

/**
 * The first unmet build-tool requirement, or null when properly kitted.
 *
 * `itemName` is kept alongside `message` because some panels show only the item
 * and others show the sentence.
 */
export async function missingBuildTool(
    playerId: number,
    x: Ex = db,
): Promise<{ itemName: string; message: string } | null> {
    if (!(await equippedBuildTool(playerId, BUILD_MALLET.subtype, x))) {
        return {
            itemName: BUILD_MALLET.itemName,
            message: `You need a ${BUILD_MALLET.itemName} equipped to build.`,
        };
    }
    if (!(await equippedBuildTool(playerId, BUILD_SAW.subtype, x))) {
        return {
            itemName: BUILD_SAW.itemName,
            message: `You need a ${BUILD_SAW.itemName} equipped to build.`,
        };
    }
    return null;
}
