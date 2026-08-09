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

// ---------------------------------------------------------------------------
// Time of day and season.
//
// Both are pure functions of the Eastern clock: no state, no cron, no stored
// row that can drift out of step with the calendar. Fishing is the first
// consumer (windows re-weight the catch pool, seasons gate a few species), but
// these are deliberately general. Foraging's drop_table already carries an
// unused `season` field for exactly this, and Farming will want it too.
//
// Seasons follow the meteorological Northern calendar. That is a choice, not an
// oversight: a hemisphere-aware season would need a player setting, and a
// shared world where two players standing on the same shore disagree about
// whether the Frostgill is running is worse than a world that is simply
// northern.
// ---------------------------------------------------------------------------

export type TimeWindow = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Eastern hours at which each window opens. Night runs from 21:00 to 05:00. */
export const WINDOW_START_HOURS: Record<TimeWindow, number> = {
    dawn: 5,
    day: 9,
    dusk: 17,
    night: 21,
};

export function getTimeWindow(now: Date = new Date()): TimeWindow {
    const hour = asGameWallClock(now).getHours();
    if (hour >= WINDOW_START_HOURS.night || hour < WINDOW_START_HOURS.dawn) return 'night';
    if (hour < WINDOW_START_HOURS.day) return 'dawn';
    if (hour < WINDOW_START_HOURS.dusk) return 'day';
    return 'dusk';
}

export function getSeason(now: Date = new Date()): Season {
    const month = asGameWallClock(now).getMonth();   // 0 = January
    if (month === 11 || month <= 1) return 'winter';  // Dec, Jan, Feb
    if (month <= 4) return 'spring';                  // Mar, Apr, May
    if (month <= 7) return 'summer';                  // Jun, Jul, Aug
    return 'autumn';                                  // Sep, Oct, Nov
}

/**
 * The instant the current window ends, so the client can count down to it.
 * Goes through instantForGameWallClock rather than adding hours to `now`, so it
 * stays correct across the two DST days a year.
 */
export function nextWindowChange(now: Date = new Date()): Date {
    const wall = asGameWallClock(now);
    const hour = wall.getHours();
    const bounds = [
        WINDOW_START_HOURS.dawn,
        WINDOW_START_HOURS.day,
        WINDOW_START_HOURS.dusk,
        WINDOW_START_HOURS.night,
    ];
    const next = bounds.find((b) => b > hour);
    const wallNext = new Date(wall);
    if (next === undefined) {
        wallNext.setDate(wallNext.getDate() + 1);
        wallNext.setHours(WINDOW_START_HOURS.dawn, 0, 0, 0);
    } else {
        wallNext.setHours(next, 0, 0, 0);
    }
    return instantForGameWallClock(wallNext, now);
}
