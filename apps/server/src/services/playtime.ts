import db from '../db';
import { connectedPlayers, logger } from '../index';

const FLUSH_INTERVAL_MS = 60_000; // credit playtime once a minute

export function startPlaytimeTracking() {
    setInterval(async () => {
        const ids = Array.from(connectedPlayers);
        if (ids.length === 0) return;
        const seconds = Math.round(FLUSH_INTERVAL_MS / 1000);
        try {
            await db('players')
                .whereIn('id', ids)
                .increment('total_seconds_played', seconds);
        } catch (err) {
            logger.error(`Playtime flush error: ${err}`);
        }
    }, FLUSH_INTERVAL_MS);
    logger.info('Playtime tracking started');
}