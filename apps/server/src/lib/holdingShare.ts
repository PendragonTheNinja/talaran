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
 * Every field a player owns, on every homestead on every island, in the order
 * the share counts them (CLAUDE.md §8, Nathan 2026-11-15): the highest-tier
 * island's first, each homestead's fields in their number order. Counted
 * across all of them, never per homestead, or each new island would start
 * again at 100% and undo the share. A field's island never changes, so the
 * order cannot be gamed. Not slot_index itself, which keeps a gap when a
 * field goes. Returns plot id to 0-based place.
 */
export async function fieldRanks(x: any, playerId: number): Promise<Map<number, number>> {
    const plots = await x('farm_plots as f')
        .join('player_properties as p', 'p.id', 'f.property_id')
        .join('locations as l', 'l.id', 'p.location_id')
        .leftJoin('islands as i', 'i.name', 'l.region')
        .where('p.player_id', playerId)
        .orderByRaw('coalesce(i.tier, 1) desc, p.id asc, f.slot_index asc')
        .select('f.id');
    return new Map(plots.map((r: any, i: number) => [Number(r.id), i]));
}

/** One field's place among all of its owner's (fieldRanks). */
export async function holdingRank(x: any, plot: { id: number; property_id: number }): Promise<number> {
    const owner = await x('player_properties').where({ id: plot.property_id }).first('player_id');
    if (!owner) return 0;
    return (await fieldRanks(x, Number(owner.player_id))).get(Number(plot.id)) ?? 0;
}

/**
 * The player's fields on their OTHER homesteads, split by whether they count
 * ahead of this one's or behind (fieldRanks' order), so the farm screen can
 * say when one island's fields push another's down (CLAUDE.md §8). `tier` is
 * this homestead's island's; `propertyId` is null for one not yet raised,
 * which would count after any other homestead of the same tier.
 */
export async function fieldsElsewhere(x: any, playerId: number, tier: number, propertyId: number | null): Promise<{
    ahead: { island: string; fields: number }[]
    behind: { island: string; fields: number }[]
}> {
    const rows = await x('farm_plots as f')
        .join('player_properties as p', 'p.id', 'f.property_id')
        .join('locations as l', 'l.id', 'p.location_id')
        .leftJoin('islands as i', 'i.name', 'l.region')
        .where('p.player_id', playerId)
        .groupBy('p.id', 'l.region', 'i.tier')
        .orderByRaw('coalesce(i.tier, 1) desc, p.id asc')
        .select('p.id as property_id', 'l.region as island', x.raw('coalesce(i.tier, 1) as tier'), x.raw('count(*) as fields'));
    const ahead: { island: string; fields: number }[] = [];
    const behind: { island: string; fields: number }[] = [];
    for (const r of rows) {
        if (propertyId !== null && Number(r.property_id) === propertyId) continue;
        const t = Number(r.tier);
        const first = t > tier || (t === tier && (propertyId === null || Number(r.property_id) < propertyId));
        (first ? ahead : behind).push({ island: r.island ?? 'another island', fields: Number(r.fields) });
    }
    return { ahead, behind };
}
