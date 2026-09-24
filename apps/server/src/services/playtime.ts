import db from '../db';
import { logger } from '../lib/logger';
import { onlinePlayers } from '../lib/realtime';

const FLUSH_INTERVAL_MS = 60_000; // credit playtime once a minute

/**
 * Once a minute, credit playtime to everyone connected and stamp their
 * last_seen. The stamp is the presence heartbeat (lib/presence.ts): it keeps a
 * connected player's last_seen within a minute of the truth, so if the process
 * dies their offline allowance runs from about when it died.
 */
export function startPlaytimeTracking() {
    setInterval(async () => {
        const ids = Array.from(onlinePlayers());
        if (ids.length === 0) return;
        const seconds = Math.round(FLUSH_INTERVAL_MS / 1000);
        try {
            await db('players')
                .whereIn('id', ids)
                .update({
                    total_seconds_played: db.raw('total_seconds_played + ?', [seconds]),
                    last_seen: db.fn.now(),
                });
        } catch (err) {
            logger.error(`Playtime flush error: ${err}`);
        }
    }, FLUSH_INTERVAL_MS);
    logger.info('Playtime tracking started');
}