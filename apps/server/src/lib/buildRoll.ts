// How many materials one build action sets in (docs/antura-plan.md §6a;
// Nathan, 2026-11-16). Pure, so the guild hall, the boats, and any sim read one
// copy.
//
// One, plus a number of coin flips: two for a guild hall (1 to 3), four for a
// boat (1 to 5). Each flip lands at a chance that runs from 25% at the build's
// own level to 75% at 24 levels over it, so a better carpenter rolls the
// higher counts more often. On average that is 1.5 to 2.5 a hall action and
// 2 to 4 a boat action. XP stays per action (the caller pays the action's 20
// seconds at the build's band), so a skilled hand finishes sooner, never
// faster than band.

export const HALL_FLIPS = 2;
export const BOAT_FLIPS = 4;

const LOW = 0.25;
const HIGH = 0.75;
const SPREAD_LEVELS = 24;

/** The chance each flip lands, for a carpenter `levelsOver` the build's own level. */
export function flipChance(levelsOver: number): number {
    const t = Math.min(1, Math.max(0, levelsOver) / SPREAD_LEVELS);
    return LOW + (HIGH - LOW) * t;
}

/** Pieces this action sets in: 1 + flips that land. `rng` returns [0, 1). */
export function piecesRolled(flips: number, carpentryLevel: number, buildLevel: number, rng: () => number = Math.random): number {
    const p = flipChance(carpentryLevel - buildLevel);
    let n = 1;
    for (let i = 0; i < flips; i++) if (rng() < p) n++;
    return n;
}

/** The average an action sets in at that gap, for the build screen. */
export function piecesAverage(flips: number, carpentryLevel: number, buildLevel: number): number {
    return 1 + flips * flipChance(carpentryLevel - buildLevel);
}
