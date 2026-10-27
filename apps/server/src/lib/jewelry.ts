// Jewelry (docs/talar-spec.md §8), the pure half: what each kind of piece
// helps with and how much, by tier. Which piece a player wears, and the draw
// on their reservoir, are services/jewelry.ts.
//
// The kind of help is a row (items.jewelry_aid); its size is here, because it
// is math: a tier-1 piece at the strength below, each tier after it half as
// much again (T2 is 1.5x, the meals' precedent).

export type JewelryAid = 'wear' | 'vein' | 'harvest' | 'fight_food' | 'road' | 'bait'

/** Tier 1 strength: a chance, or a fraction added (all knobs). */
export const AID_STRENGTH: Record<JewelryAid, number> = {
    wear: 0.03,         // a use of worn gear does not count toward its wear
    vein: 0.05,         // a vein found runs this much larger
    harvest: 0.03,      // a harvest also returns a seed
    fight_food: 0.05,   // food eaten in a fight mends this much more
    road: 0.10,         // the road-find chance is raised by this much of itself
    bait: 0.05,         // bait is not used
}

const TIER_STEP = 0.5

/** Talar drawn for each action a piece helps with, in hundredths: 1 Talar per 20 (knob). */
export const DRAW_HUNDREDTHS = 5

export function isJewelryAid(value: unknown): value is JewelryAid {
    return typeof value === 'string' && value in AID_STRENGTH
}

/** How much a piece of this tier helps. */
export function aidStrength(aid: JewelryAid, tier: number): number {
    return AID_STRENGTH[aid] * (1 + TIER_STEP * Math.max(0, (Number(tier) || 1) - 1))
}

/** What a piece does, in a line for its item page: "3% chance a use of your gear does not wear it". */
export function aidWords(aid: JewelryAid, tier: number): string {
    const pct = `${Math.round(aidStrength(aid, tier) * 1000) / 10}%`
    switch (aid) {
        case 'wear': return `${pct} chance a use of your worn gear does not wear it`
        case 'vein': return `veins you find run ${pct} larger`
        case 'harvest': return `${pct} chance a harvest gives back a seed`
        case 'fight_food': return `food eaten in a fight mends ${pct} more`
        case 'road': return `${pct} better chance of a find on the road, on foot`
        case 'bait': return `${pct} chance your bait is not used`
    }
}
