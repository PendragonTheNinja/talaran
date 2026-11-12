import { gameMinuteOfDay, instantAtGameMinute } from './gameTime';

// Geomima's mealtime fires (forum "Hearth Upgrade for Homestead", 2026-11-07;
// Nathan, 2026-11-12). Three times a game day she cooks for Phoenwick, and for
// the hour her fire burns, her hearth runs at full speed for anyone she has
// given the run of it: the public bench's half speed (checkStation in
// services/workstations.ts) is lifted. A reason to cook in Phoenwick, together,
// at set times, rather than a hearth at every homestead.
//
// On the game clock (Eastern), as every other clock in the game is.

/** When each fire is lit, in minutes after game midnight: breakfast, noon, supper. */
export const KEEPER_FIRE_STARTS = [7 * 60, 12 * 60, 18 * 60];
/** How long each burns. */
export const KEEPER_FIRE_MINUTES = 60;

/** The fire burning now, if one is. */
export function keeperFireNow(now: Date = new Date()): { endsAt: Date } | null {
    const minute = gameMinuteOfDay(now);
    const start = KEEPER_FIRE_STARTS.find((s) => minute >= s && minute < s + KEEPER_FIRE_MINUTES);
    return start === undefined ? null : { endsAt: instantAtGameMinute(now, start + KEEPER_FIRE_MINUTES) };
}

/** When the next fire is lit (after any burning now). */
export function nextKeeperFire(now: Date = new Date()): Date {
    const minute = gameMinuteOfDay(now);
    const later = KEEPER_FIRE_STARTS.find((s) => s > minute);
    return later === undefined
        ? instantAtGameMinute(now, KEEPER_FIRE_STARTS[0], 1)
        : instantAtGameMinute(now, later);
}
