import type { Server } from 'socket.io';
import { logger } from './logger';
import { afterCommit } from './afterCommit';

/**
 * One place to reach the socket server from anywhere.
 *
 * Services that need to push used to `import { io } from '../index'`, which is
 * a cycle: index builds the routes, the routes build the services, and the
 * services reach back for index. Node tolerates it because `io` is only read
 * inside a function, by which time the module has finished.
 *
 * It stops being tolerable for services on the hot path. services/xp.ts and
 * services/stats.ts are imported by CLI scripts (the value derivation reaches
 * them through smithing and carpentry), and importing index.ts anywhere in that
 * chain boots a SECOND game server: another socket listener, another game tick.
 * A registry has no cycle and nothing to boot. index.ts hands the server over
 * once it exists; before that, and in every script, pushes are simply dropped.
 */
let io: Server | null = null;

export function setRealtimeServer(server: Server): void {
    io = server;
}

/**
 * Send one event to one player's open tabs.
 *
 * Never throws. Whatever is being pushed, the database write that prompted it
 * has already committed, and the client re-reads on its next request anyway, so
 * a socket problem must not take down the action that caused it.
 */
export function pushToPlayer(playerId: number, event: string, payload?: unknown): void {
    pushToRoom(`player_${playerId}`, event, payload);
    for (const fn of playerPushListeners) {
        try {
            fn(playerId, event, payload);
        } catch (err) {
            logger.warn(`player push listener failed on ${event}: ${err}`);
        }
    }
}

/**
 * Hear every push to a player, after it is sent. Push notifications
 * (services/pushNotify.ts) listen here so that any moment the game already
 * tells a player about (a bot check, an action stopping) can also reach their
 * phone, without each sender knowing notifications exist. A listener must be
 * quick and must not throw; anything slow it starts on its own.
 */
export type PlayerPushListener = (playerId: number, event: string, payload: unknown) => void;
const playerPushListeners = new Set<PlayerPushListener>();

export function onPlayerPush(fn: PlayerPushListener): () => void {
    playerPushListeners.add(fn);
    return () => { playerPushListeners.delete(fn); };
}

/**
 * Send one event to a room: a location, a region, a guild.
 *
 * Callers name the room, because the room names are the game's, not this
 * module's: `location_12`, `region_Eld_Grove`. Same no-throw contract as above.
 */
export function pushToRoom(room: string, event: string, payload?: unknown): void {
    if (!io) return;
    try {
        io.to(room).emit(event, payload);
    } catch (err) {
        logger.warn(`pushToRoom(${event}) failed for ${room}: ${err}`);
    }
}

/**
 * Push to a player once the work that caused it has COMMITTED. A rolled-back
 * award is never announced (audit N-1). See lib/afterCommit.ts.
 */
export function pushToPlayerAfterCommit(
    x: unknown,
    playerId: number,
    event: string,
    payload?: unknown,
): void {
    afterCommit(x, () => pushToPlayer(playerId, event, payload));
}

/** Send one event to everyone connected. Region events, world announcements. */
export function pushToAll(event: string, payload?: unknown): void {
    if (!io) return;
    try {
        io.emit(event, payload);
    } catch (err) {
        logger.warn(`pushToAll(${event}) failed: ${err}`);
    }
}

/**
 * Who is connected, read from socket.io room membership (audit M10).
 *
 * This used to be a Set, added to on join and deleted from on disconnect. A Set
 * cannot count: with two tabs open both add the same id, and the first tab to
 * close deletes it, so a player still playing in the other tab read as
 * offline. Playtime stopped accruing, the admin online list and guild dots lost
 * them, and "Players here" dropped them. The player's own room is a real count
 * of their sockets and is always right, which is why lib/presence.ts already
 * used it.
 */
export function isOnline(playerId: number): boolean {
    const room = io?.sockets.adapter.rooms.get(`player_${playerId}`);
    return !!room && room.size > 0;
}

/** Every player with at least one connected socket. */
export function onlinePlayers(): ReadonlySet<number> {
    const out = new Set<number>();
    if (!io) return out;
    for (const [name, sockets] of io.sockets.adapter.rooms) {
        if (!name.startsWith('player_') || sockets.size === 0) continue;
        const id = Number(name.slice('player_'.length));
        if (Number.isInteger(id)) out.add(id);
    }
    return out;
}

/**
 * The raw server, for the handful of cases that need more than an emit:
 * fetchSockets, joining a room on someone's behalf, disconnecting a socket.
 * Prefer the push helpers, which cannot be called before the server exists.
 */
export function realtimeServer(): Server | null {
    return io;
}

/**
 * Move a player's open tabs between guild chat rooms (`guild_<id>`), and tell
 * the client its guild changed. A socket joins its guild's room when it
 * connects (index.ts), so without this a player who joined a guild saw no
 * guild chat until they refreshed, and one who left or was removed kept
 * hearing it (forum, 2026-11-03). Never throws.
 */
export function moveGuildRoom(playerId: number, fromGuildId: number | null, toGuildId: number | null): void {
    try {
        if (!io) return;
        const tabs = io.in(`player_${playerId}`);
        if (fromGuildId) tabs.socketsLeave(`guild_${fromGuildId}`);
        if (toGuildId) tabs.socketsJoin(`guild_${toGuildId}`);
        pushToPlayer(playerId, 'guild_changed', { guildId: toGuildId });
    } catch {
        // A socket problem must not undo the membership change that caused it.
    }
}
