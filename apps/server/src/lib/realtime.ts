import type { Server } from 'socket.io';
import { logger } from './logger';

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
 * Who is currently connected.
 *
 * The set lives here rather than in index.ts for the same reason the server
 * does: five routes and a service want to know who is online, and reaching
 * into index.ts for it drags the whole server into anything that imports them.
 * index.ts maintains it from the socket handlers.
 */
const connected = new Set<number>();

export function markConnected(playerId: number): void {
    connected.add(playerId);
}

export function markDisconnected(playerId: number): void {
    connected.delete(playerId);
}

export function isOnline(playerId: number): boolean {
    return connected.has(playerId);
}

export function onlinePlayers(): ReadonlySet<number> {
    return connected;
}

/**
 * The raw server, for the handful of cases that need more than an emit:
 * fetchSockets, joining a room on someone's behalf, disconnecting a socket.
 * Prefer the push helpers, which cannot be called before the server exists.
 */
export function realtimeServer(): Server | null {
    return io;
}
