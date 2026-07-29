import db from '../db';
import { logger } from '../lib/logger';

// Audit finding 7 (docs/AUDIT-2026-07-26.md): nothing ever deleted from
// chat_messages, so the table grew forever while being read on every chat poll.
//
// routes/chat.ts only ever serves messages newer than HISTORY_DAYS, so anything
// older is unreadable by any player and pure cost. Kept deliberately longer than
// the read window: moderation occasionally needs to look back further than
// players can, and a few extra days of a small table is cheap.

const READ_WINDOW_DAYS = 2;    // must match HISTORY_DAYS in routes/chat.ts
const KEEP_EXTRA_DAYS = 12;    // moderation headroom beyond what players see

export const CHAT_RETENTION_DAYS = READ_WINDOW_DAYS + KEEP_EXTRA_DAYS;

/**
 * Deletes chat older than the retention window.
 *
 * Batched rather than one large DELETE: a single statement over a table this
 * hot takes a long-held lock, and the first run after this ships may have a very
 * large backlog to clear.
 */
export async function pruneChatHistory(batchSize = 5000): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CHAT_RETENTION_DAYS);

    let removed = 0;

    try {
        for (;;) {
            const ids = await db('chat_messages')
                .where('sent_at', '<', cutoff)
                .select('id')
                .limit(batchSize);

            if (ids.length === 0) break;

            const deleted = await db('chat_messages')
                .whereIn('id', ids.map((r) => r.id))
                .delete();

            removed += deleted;

            // Yield between batches so the tick and live requests get a look in.
            if (ids.length < batchSize) break;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        if (removed > 0) {
            logger.info(`Chat retention: removed ${removed} messages older than ${CHAT_RETENTION_DAYS} days`);
        }
    } catch (err) {
        // Never throw from a scheduled job; a failed prune must not take the
        // server down or stop the next run.
        logger.error(`Chat retention error: ${err}`);
    }

    return removed;
}
