// How an action's timer responds to the player's level (CLAUDE.md §8). Pure,
// so the start route and the tick's repeat derive the same number: if they
// ever disagree, a repeating action silently changes speed on its second lap.

/** Every level above the action's own takes this much off its timer. */
export const LEVEL_TIMER_REDUCTION = 0.005

/** The most levels can take off: half the timer, at 100 levels over. */
export const MAX_LEVEL_REDUCTION = 0.5

/**
 * No action runs faster than this (Nathan, 2026-10-27). An action whose own
 * timer is already shorter keeps it: the floor stops things speeding up past
 * it, it never slows anything down.
 */
export const MIN_ACTION_SECONDS = 20

/** The factor levels apply to a timer: 1 at the action's level, 0.5 at most. */
export function levelTimerFactor(playerLevel: number, requiredLevel: number): number {
    const levelsOver = Math.max(0, playerLevel - requiredLevel)
    return 1 - Math.min(MAX_LEVEL_REDUCTION, levelsOver * LEVEL_TIMER_REDUCTION)
}

/** A finished timer held to the floor, unless the action started under it. */
export function floorTimer(seconds: number, baseSeconds: number): number {
    return Math.max(Math.min(MIN_ACTION_SECONDS, baseSeconds), Math.round(seconds))
}

/**
 * A processing timer (smelting, sawing, every bench recipe): the base, sped up
 * by levels over the recipe, then the station's multiplier (a public bench is
 * 2, a better tool under 1), held to the floor. Gathering has the same level
 * rule in calculateTimer (services/woodcutting.ts) with each node's own floor.
 */
export function processingTimer(
    baseSeconds: number,
    playerLevel: number,
    requiredLevel: number,
    multiplier = 1,
): number {
    return floorTimer(baseSeconds * levelTimerFactor(playerLevel, requiredLevel) * multiplier, baseSeconds)
}
