// Diminishing XP by field and pen (Nathan, 2026-11-13; audit 2026-11-09).
//
// Fields go by their number on the farmstead. Pens go by what their grown
// animals produce, best first (penRanks in services/husbandry.ts), since pens
// hold different kinds and cannot be laid out like fields (Nathan, 2026-11-13).
//
// Fields and pens multiply twenty- and twelve-fold with level while the XP
// band grows about four-fold, and every one paid alike, so a full farmstead
// earned more than a whole active day besides whatever its owner did (about
// 166% of eight hours of band at Farming 15, 175% at 25; Husbandry about the
// same). Each field and each pen now teaches a share of its crop's or
// animal's XP by its place on the farmstead: the first in full, the Nth at
// 1 / N ^ EXPONENT. The shares are fixed per place, so:
//   - building another field or pen never lowers anything already there, and
//     whatever is in it adds XP, the lowest crop included;
//   - nothing turns on order, timing or what else is growing, so there is
//     nothing to game (a share by how many are planted could be raised by
//     harvesting in a chosen order, or sowing one at a time);
//   - the farm screen can say what each place teaches.
// Only the XP for the seed or the produce is shared. The work itself (digging,
// sowing, harvesting, collecting) pays the normal rate on every field and pen.
// The yield is never touched: more fields are always more crops.

/** How steeply later places fall off: field 2 at 71%, 6 at 41%, 20 at 22%. */
export const HOLDING_SHARE_EXPONENT = 0.5;

/** The share of its XP the place at 0-based `rank` teaches. */
export function holdingShare(rank: number): number {
    const place = Math.max(1, Math.floor(Number(rank) || 0) + 1);
    return 1 / Math.pow(place, HOLDING_SHARE_EXPONENT);
}

/**
 * A field's or pen's place: how many of its kind stand before it on the same
 * farmstead. Not slot_index itself, which keeps its gap when a pen is
 * demolished, or every pen after it would teach as if the gap were standing.
 */
export async function holdingRank(x: any, table: 'farm_plots' | 'player_pens', row: { property_id: number; slot_index: number }): Promise<number> {
    const [{ n }] = await x(table).where({ property_id: row.property_id }).where('slot_index', '<', row.slot_index).count('* as n');
    return Number(n) || 0;
}
