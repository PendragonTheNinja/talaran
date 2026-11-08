// Tool wear numbers (Nathan, 2026-11-07; migration 20261108100000_tool_wear).
// Pure, so the live wear and any sim use one formula.
//
// Every tool of a tier is safe for the same number of uses, whatever the
// skill. Past that, each use rolls to break, and the chance comes from the
// action's own timer: the tool should last `lifeHours` of work on average, so
// a 20 s mining swing gets a smaller chance per use than a 90 s chop, and both
// wear a tool out in the same hours. A tool used rarely (a hoe, a mallet)
// lasts a long while on its guarantee alone.

export interface ToolTierRule {
    guaranteedUses: number
    lifeHours: number
}

/** The tail after the guarantee is never shorter than this share of it, so a slow skill still has some spread. */
export const MIN_TAIL_SHARE = 0.25

/**
 * Break chance per use, in percent, for one use of a tool past its guarantee.
 * `timerSeconds` is how long the action that used it took.
 */
export function toolBreakChancePct(rule: ToolTierRule, timerSeconds: number): number {
    const seconds = Math.max(1, Number(timerSeconds) || 1)
    const usesInLife = (rule.lifeHours * 3600) / seconds
    const tail = Math.max(usesInLife - rule.guaranteedUses, rule.guaranteedUses * MIN_TAIL_SHARE, 1)
    return Math.min(100, 100 / tail)
}

/** The tier rule for a tool, its own tier's, else tier 1's, else the starting numbers. */
export function toolTierRule(tiers: Map<number, ToolTierRule>, tier: number | null | undefined): ToolTierRule {
    return tiers.get(Number(tier) || 1) ?? tiers.get(1) ?? { guaranteedUses: 300, lifeHours: 12 }
}
