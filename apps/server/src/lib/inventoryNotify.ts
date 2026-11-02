import { Client } from 'pg';
import { logger } from './logger';
import { pushToPlayer } from './realtime';

/**
 * Forwards the database's inventory notices to players' sockets.
 *
 * Migration 20261102130000 puts a trigger on every table the pack is drawn
 * from (player_inventory, player_liquids, player_talar_open_gem). Each change
 * NOTIFYs 'inventory_changed' with the player's id, and Postgres delivers it
 * only once its transaction commits. This holds ONE connection outside the
 * Knex pool (LISTEN needs a connection of its own for as long as it listens)
 * and pushes `inventory_changed` to that player, which every pack and the buff
 * panel already reload on (App.tsx, BuffPanel.tsx; coalesced client side).
 *
 * So any write at all refreshes the pack: a quest reward, the admin Give Item
 * tool, a script, a row typed into psql. The hand-sent notifyInventoryChanged
 * calls still work and are now only belt and braces.
 *
 * Notices are gathered for FLUSH_MS and sent once per player, so a tick that
 * changes two hundred packs sends two hundred pushes, not one per row.
 * If the connection drops it reconnects with backoff; packs refresh again on
 * the player's next change, so a gap costs nothing but that one refresh.
 */

const CHANNEL = 'inventory_changed';
const FLUSH_MS = 100;
const MAX_BACKOFF_MS = 30_000;

let started = false;
let pending = new Set<number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
    flushTimer = null;
    const ids = pending;
    pending = new Set();
    for (const id of ids) pushToPlayer(id, CHANNEL);
}

function queue(playerId: number) {
    if (!Number.isInteger(playerId) || playerId <= 0) return;
    pending.add(playerId);
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

async function connect(attempt: number): Promise<void> {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    let retried = false;
    const retry = (why: string) => {
        if (retried) return;
        retried = true;
        client.removeAllListeners();
        client.end().catch(() => { });
        const wait = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
        logger.warn(`inventory notices: ${why}; reconnecting in ${Math.round(wait / 1000)}s`);
        setTimeout(() => { void connect(attempt + 1); }, wait);
    };

    client.on('notification', (msg) => {
        if (msg.channel === CHANNEL) queue(Number(msg.payload));
    });
    client.on('error', (err) => retry(`connection error (${err.message})`));
    client.on('end', () => retry('connection closed'));

    try {
        await client.connect();
        await client.query(`LISTEN ${CHANNEL}`);
        if (attempt > 0) logger.info('inventory notices: listening again');
        // A stable connection resets the backoff for the next drop.
        attempt = 0;
    } catch (err) {
        retry(`could not listen (${(err as Error).message})`);
    }
}

/** Start forwarding. Called once at boot from index.ts; a second call does nothing. */
export function startInventoryNotices(): void {
    if (started) return;
    started = true;
    void connect(0);
}
