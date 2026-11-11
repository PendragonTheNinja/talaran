import type { Knex } from 'knex';
import db from '../db';

// Where a player stands, for the service layer's presence rule (CLAUDE.md §2:
// presence is enforced in the service, not the route, so it holds however a
// call arrives).
//
// Woodcutting, mining, foraging and hunting took the node, habitat or animal id
// from the client and never asked where the player was, so a character in
// Talador could work any node on the island and mine another player's
// unannounced vein in Origrund (audit 2026-11-09, A1). Every gathering check
// now asks here.

/** The location the player stands at, or null when the row is missing. */
export async function locationOf(playerId: number, x: Knex | Knex.Transaction = db): Promise<number | null> {
    const row = await x('players').where({ id: playerId }).first('current_location_id');
    const id = Number(row?.current_location_id);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/** True only when the player stands at this location. */
export async function standsAt(playerId: number, locationId: unknown, x: Knex | Knex.Transaction = db): Promise<boolean> {
    const want = Number(locationId);
    if (!Number.isFinite(want) || want <= 0) return false;
    return (await locationOf(playerId, x)) === want;
}
