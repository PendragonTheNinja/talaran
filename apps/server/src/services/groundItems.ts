import db from '../db';
import { logger } from '../lib/logger';
import { pushToRoom } from '../lib/realtime';

// Ground items: who can see them, how long they last, and telling a location
// when its ground changes (audit L-7).
//
// A drop is private to the dropper for GROUND_ITEM_PRIVATE_SECONDS, then public
// (ground_items.visible_to_all_at, which the listing already respects), and is
// removed GROUND_ITEM_LIFETIME_MINUTES after it was dropped. Items used to stay
// forever: a slow leak, and anyone could litter a busy square. What expires is
// added up per item in ground_item_despawns, to show what players leave lying.
//
// Everything here is driven by the database, so a restart loses nothing. The
// "now public" moment used to be a bare setTimeout per drop, lost on restart
// (and, as it turned out, sent to an event no client listened for).

/** How long a drop is visible only to the player who dropped it. */
export const GROUND_ITEM_PRIVATE_SECONDS = 15;

/** How long a drop stays on the ground before it is gone. */
export const GROUND_ITEM_LIFETIME_MINUTES = 7 * 24 * 60;   // one week

/** How often the sweep runs; also the most a "now public" refresh can lag. */
const SWEEP_SECONDS = 5;

/**
 * The event a location's players refresh their ground list on. Sent when items
 * there turn public, expire, or are picked up.
 */
export const GROUND_ITEMS_CHANGED = 'ground_items_changed';

export function announceGroundChange(locationId: number): void {
    pushToRoom(`location_${locationId}`, GROUND_ITEMS_CHANGED, { locationId });
}

// Starts a private window back, so after a restart anything that turned public
// while the process was down is still announced.
let lastSweep = Date.now() - GROUND_ITEM_PRIVATE_SECONDS * 1000;

async function sweep(): Promise<void> {
    const now = new Date();
    const from = new Date(lastSweep);

    const turnedPublic: { location_id: number }[] = await db('ground_items')
        .where('visible_to_all_at', '>', from)
        .andWhere('visible_to_all_at', '<=', now)
        .distinct('location_id');

    // Remove what has lasted its week, and add it to the per-item totals of
    // what nobody picked up, in one transaction so the totals always match
    // what was actually removed.
    const expired: { location_id: number; item_id: number; quantity: number }[] = await db.transaction(async (trx) => {
        const gone = await trx('ground_items')
            .where('dropped_at', '<', new Date(now.getTime() - GROUND_ITEM_LIFETIME_MINUTES * 60_000))
            .delete()
            .returning(['location_id', 'item_id', 'quantity']);
        const byItem = new Map<number, { stacks: number; quantity: number }>();
        for (const g of gone) {
            const t = byItem.get(g.item_id) ?? { stacks: 0, quantity: 0 };
            t.stacks += 1; t.quantity += Number(g.quantity);
            byItem.set(g.item_id, t);
        }
        for (const [itemId, t] of byItem) {
            await trx('ground_item_despawns')
                .insert({ item_id: itemId, stacks: t.stacks, quantity: t.quantity, first_despawned_at: now, last_despawned_at: now })
                .onConflict('item_id')
                .merge({
                    stacks: trx.raw('ground_item_despawns.stacks + excluded.stacks'),
                    quantity: trx.raw('ground_item_despawns.quantity + excluded.quantity'),
                    last_despawned_at: now,
                });
        }
        return gone;
    });

    lastSweep = now.getTime();
    if (expired.length) logger.info(`[ground] ${expired.length} dropped stack(s) expired unclaimed`);
    for (const id of new Set([...turnedPublic, ...expired].map((r) => r.location_id))) announceGroundChange(id);
}

export function startGroundItemSweep(): void {
    setInterval(() => {
        sweep().catch((err) => logger.error(`[ground] sweep failed: ${err}`));
    }, SWEEP_SECONDS * 1000);
}
