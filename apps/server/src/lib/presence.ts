import type { Server } from 'socket.io';
import db from '../db';
import { logger } from './logger';

// Who is actually here right now, and how long someone has been gone.
//
// Actions used to keep resolving for players who had logged out: nothing in the
// disconnect handler touched player_actions, and the tick's query filters only
// on completes_at. The 30 minute bot check was the sole thing that eventually
// stopped an absent player, which made it an accidental AFK limiter rather than
// a deliberate one.
//
// Presence is read from the socket.io room rather than from a Set maintained by
// hand. A Set cannot count: with two tabs open, both add the same id and the
// first tab to close deletes it, marking a player offline while they are still
// playing. Room membership is a real count and is always right.
//
// The offline allowance (audit M14): closing the tab lets the current action
// keep running for OFFLINE_GRACE_MS, then it stops. The homepage promises this.
// The clock runs from players.last_seen, which is PERSISTED, so a deploy does
// not reset it. last_seen is "the last moment this server knew the player was
// here", written three ways:
//   - when their socket joins (recordSeen, from index.ts)
//   - when any of their sockets disconnects (recordSeen, from index.ts)
//   - once a minute for everyone connected, in the playtime flush
//     (services/playtime.ts)
// The minute heartbeat is what makes a crash or a pm2 restart safe: a player
// connected when the process died has a last_seen at most a minute before it,
// so their thirty minutes run from roughly when the server lost them, not from
// whenever they last happened to close a tab. The same column drives "Last
// seen" in the guild member list.

/** How long a closed tab keeps the current action running. */
export const OFFLINE_GRACE_MS = 30 * 60_000;

/**
 * Forgive everyone for this long after the process starts. After a pm2 restart
 * every room is empty for a few seconds while clients reconnect. last_seen
 * already covers that in the normal case; this covers the edges, where the
 * outage outlasted OFFLINE_GRACE_MS or a player has no last_seen yet.
 */
export const RESTART_GRACE_MS = 90_000;

/** When this process started. */
export const serverStartedAt = Date.now();

/**
 * Players this process believes are connected, maintained explicitly.
 *
 * Belt and braces alongside the room check below. Room membership is normally
 * authoritative, but it depends on `socket.join` having run, which depends on
 * the client's 'join' emit and on handshake auth having populated
 * socket.data.playerId. If any of that misses, a player who is plainly online
 * looks absent and their actions get cancelled. Two independent signals mean a
 * single point of failure cannot strand someone mid-action.
 */
const onlineNow = new Set<number>();

export function markOnline(playerId: number): void {
    onlineNow.add(playerId);
}

export function markOffline(playerId: number): void {
    onlineNow.delete(playerId);
}

/**
 * Stamp players.last_seen with now. Fire and forget: a failed write costs at
 * most the minute until the next heartbeat, so it is logged, never thrown.
 */
export async function recordSeen(playerId: number): Promise<void> {
    try {
        await db('players').where({ id: playerId }).update({ last_seen: db.fn.now() });
    } catch (err) {
        logger.error(`last_seen write failed for player ${playerId}: ${err}`);
    }
}

export function isPlayerOnline(io: Server, playerId: number): boolean {
    if (onlineNow.has(playerId)) return true;
    const room = io.sockets.adapter.rooms.get(`player_${playerId}`);
    return !!room && room.size > 0;
}

/**
 * Should this player's in-flight action be cancelled instead of resolved?
 *
 * Checked at RESOLUTION time, not on disconnect, which means a blip costs
 * nothing: reconnect before the allowance runs out and the action carries on,
 * with no timers to manage and nothing to clean up if the process dies.
 *
 * `lastSeen` is the player's players.last_seen, which the tick has already read
 * with the rest of the player row, so this stays synchronous.
 *
 * Three ways to be forgiven:
 *   1. Connected right now.
 *   2. Within RESTART_GRACE_MS of this process starting.
 *   3. Last seen less than OFFLINE_GRACE_MS ago.
 * A player with no last_seen at all has never been seen by code that writes
 * it, so only the first two apply.
 */
export function shouldCancelForAbsence(
    io: Server,
    playerId: number,
    lastSeen: Date | string | null | undefined,
): boolean {
    if (isPlayerOnline(io, playerId)) return false;

    const now = Date.now();
    if (now - serverStartedAt < RESTART_GRACE_MS) return false;

    if (lastSeen) {
        const seen = new Date(lastSeen).getTime();
        if (Number.isFinite(seen) && now - seen < OFFLINE_GRACE_MS) return false;
    }

    return true;
}
