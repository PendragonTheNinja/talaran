// The tier ladder (docs/xp-rebalance.md, CLAUDE.md §8). Pure, so services,
// scripts and lib/combatMath.ts read one copy. Applied migrations carry their
// own frozen copies; leave those alone.

/** The level that opens each tier: tier 1 at index 0. */
export const RUNGS = [1, 13, 25, 37, 50, 62, 75, 87, 100]

/** Tier band of a level. */
export function tierOfLevel(level: number): number {
    let tier = 1
    for (let i = 0; i < RUNGS.length; i++) if (level >= RUNGS[i]) tier = i + 1
    return tier
}

/** The level that opens a tier. */
export function rungOfTier(tier: number): number {
    return RUNGS[Math.min(RUNGS.length, Math.max(1, tier)) - 1]
}

/**
 * The tier a tool works at: `items.works_as_tier` where an item is better
 * than the tier it is had at (an invader's rare gear, docs/invasions-spec.md
 * §6), else its own tier. `items.tier` is derived from where an item is first
 * had and is never raised by hand (CLAUDE.md §8), so speed and what a tool may
 * work read this, never the column alone.
 */
export function workingTier(item: { tier?: unknown; works_as_tier?: unknown } | null | undefined): number {
    return Number(item?.works_as_tier ?? item?.tier) || 1
}
