import type { Server } from 'socket.io';

// Who is actually here right now.
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

export const GRACE_MS = 90_000;

/** When this process started. Used to forgive the reconnect window after a deploy. */
export const serverStartedAt = Date.now();

/** playerId -> epoch ms of their most recent disconnect. */
export const lastSeenAt = new Map<number, number>();

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
    lastSeenAt.delete(playerId);
}

export function markSeen(playerId: number): void {
    onlineNow.delete(playerId);
    lastSeenAt.set(playerId, Date.now());
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
 * nothing: reconnect before the action completes and it resolves normally, with
 * no timers to manage and nothing to clean up if the process dies.
 *
 * Three ways to be forgiven:
 *   1. Connected right now.
 *   2. Within GRACE_MS of this process starting. After a pm2 restart every room
 *      is empty for a few seconds while clients reconnect, and without this the
 *      first tick after every deploy would cancel every action in the game.
 *   3. Disconnected less than GRACE_MS ago, covering a dropped connection or a
 *      phone that backgrounded for a moment.
 */
export function shouldCancelForAbsence(io: Server, playerId: number): boolean {
    if (isPlayerOnline(io, playerId)) return false;

    const now = Date.now();
    if (now - serverStartedAt < GRACE_MS) return false;

    const seen = lastSeenAt.get(playerId);
    if (seen !== undefined && now - seen < GRACE_MS) return false;

    return true;
}
