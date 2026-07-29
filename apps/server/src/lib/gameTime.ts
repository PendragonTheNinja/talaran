// Server-side counterpart to the client's lib/time.ts.
//
// The whole game displays Eastern time regardless of where a player is, so a
// "day" must mean an Eastern day. Using server-local or viewer-local midnight
// would reset chat at a moment that disagrees with the clock on screen.

export const GAME_TZ = 'America/New_York';

/** The same instant, expressed as a Date carrying Eastern wall-clock fields. */
function asGameWallClock(at: Date): Date {
    return new Date(at.toLocaleString('en-US', { timeZone: GAME_TZ }));
}

/**
 * The instant whose Eastern wall clock equals the given wall-clock fields.
 *
 * Naively adding the offset measured at "now" is wrong on the two DST days a
 * year: the offset at 14:00 EDT is not the offset at the preceding midnight, so
 * the result lands an hour out. Measuring the offset again at the candidate
 * instant corrects it, which converges immediately because the offset is
 * constant either side of a single transition.
 */
function instantForGameWallClock(wallFields: Date, reference: Date): Date {
    const firstOffset = reference.getTime() - asGameWallClock(reference).getTime();
    const candidate = new Date(wallFields.getTime() + firstOffset);

    const trueOffset = candidate.getTime() - asGameWallClock(candidate).getTime();
    return new Date(wallFields.getTime() + trueOffset);
}

/** Midnight of the current Eastern day, as a real instant. */
export function startOfGameDay(now: Date = new Date()): Date {
    const wall = asGameWallClock(now);
    wall.setHours(0, 0, 0, 0);
    return instantForGameWallClock(wall, now);
}

/** The next Eastern midnight, i.e. when the chat box next resets. */
export function nextGameMidnight(now: Date = new Date()): Date {
    const wall = asGameWallClock(now);
    wall.setHours(0, 0, 0, 0);
    wall.setDate(wall.getDate() + 1);
    return instantForGameWallClock(wall, now);
}
