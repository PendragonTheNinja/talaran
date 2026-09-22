import db from '../db';
import { notifyInventoryChanged } from './inventory';
import { logger } from '../lib/logger';

// Property storage. One SLOT holds one unique item stack of any size, so 50 slots
// means 50 different items, not 50 things. Stores are per-property: what you keep
// at the farmstead stays there. Deposits and withdrawals are instant — this is
// housekeeping, not a skill.

export interface StorageResult {
    success: boolean;
    error?: string;
    message?: string;
}

/**
 * The player's property at their current location.
 *
 * Shops are EXCLUDED unless asked for by name. This lookup used to match on
 * player and location alone, which was fine while a farmstead was the only
 * thing anyone could own. Now that a shop is also a player_properties row, a
 * bare .first() at a town holding both would return whichever Postgres felt
 * like, and the homestead panel would quietly show the shop's back room.
 *
 * Pass a type to address one deliberately.
 */
async function propertyForPlayerHere(playerId: number, type?: string) {
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player) return null;

    const q = db('player_properties')
        .where({ player_id: playerId, location_id: player.current_location_id });

    if (type) q.where({ type });
    else q.whereNot({ type: 'shop' });

    return q.first();
}

export async function getStorage(playerId: number, type?: string) {
    const property = await propertyForPlayerHere(playerId, type);
    if (!property) return { hasProperty: false, slots: 0, used: 0, items: [] as any[] };

    const rows = await db('property_storage')
        .join('items', 'property_storage.item_id', 'items.id')
        .where('property_storage.property_id', property.id)
        .where('property_storage.quantity', '>', 0)
        .select(
            'property_storage.item_id as itemId',
            'property_storage.quantity as quantity',
            'items.name as name',
            'items.type as type',
            'items.subtype as subtype',
        )
        .orderBy('items.name', 'asc');

    return {
        hasProperty: true,
        propertyId: property.id,
        propertyType: property.type,
        slots: property.storage_slots ?? 50,
        used: rows.length,
        items: rows,
    };
}

// What the player is carrying, for the deposit side of the UI.
export async function getCarried(playerId: number) {
    return db('player_inventory')
        .join('items', 'player_inventory.item_id', 'items.id')
        .where('player_inventory.player_id', playerId)
        .where('player_inventory.quantity', '>', 0)
        .select(
            'player_inventory.item_id as itemId',
            'player_inventory.quantity as quantity',
            'items.name as name',
            'items.type as type',
        )
        .orderBy('items.name', 'asc');
}

export async function depositItem(playerId: number, itemId: number, qtyRaw: number, type?: string): Promise<StorageResult> {
    try {
        const property = await propertyForPlayerHere(playerId, type);
        if (!property) return { success: false, error: 'You have nothing of your own here.' };

        const item = await db('items').where({ id: itemId }).first();
        if (!item) return { success: false, error: 'Unknown item.' };

        // One transaction with the inventory row locked, for the same reason as
        // dropping an item: this read the stack, then wrote an ABSOLUTE
        // quantity back. Two deposits landing together both read 5, both write
        // 5 - qty, and the second silently undoes the first; two deposits of a
        // whole stack both delete the row and both add to store, so five items
        // in the pack become ten in the chest. The slot check has the same
        // hole: two new stacks can both see the last free slot.
        return db.transaction(async (trx) => {
            const inv = await trx('player_inventory')
                .where({ player_id: playerId, item_id: itemId })
                .forUpdate()
                .first();
            if (!inv || inv.quantity < 1) return { success: false, error: 'You are not carrying that.' };

            const qty = Math.max(1, Math.min(Number(inv.quantity), Math.floor(qtyRaw)));

            const existing = await trx('property_storage')
                .where({ property_id: property.id, item_id: itemId })
                .forUpdate()
                .first();

            // A new stack needs a free slot; topping up an existing one never does.
            if (!existing) {
                const used = await trx('property_storage')
                    .where({ property_id: property.id })
                    .where('quantity', '>', 0)
                    .count({ c: '*' }).first();
                const usedCount = Number(used?.c ?? 0);
                if (usedCount >= (property.storage_slots ?? 50)) {
                    return { success: false, error: 'There is no room left in store.' };
                }
            }

            if (Number(inv.quantity) === qty) {
                await trx('player_inventory').where({ id: inv.id }).delete();
            } else {
                await trx('player_inventory').where({ id: inv.id }).decrement('quantity', qty);
            }

            if (existing) {
                await trx('property_storage').where({ id: existing.id }).increment('quantity', qty);
            } else {
                await trx('property_storage').insert({ property_id: property.id, item_id: itemId, quantity: qty });
            }

            return { success: true, message: `Stored ${qty} × ${item.name}.` };
        }).then((result) => {
            // The pack changed, so every panel showing it needs to know.
            // Withdraw has always said so; deposit never did, which is why the
            // inventory panel kept showing items that were already in store
            // until something else refreshed it.
            if (result.success) notifyInventoryChanged(playerId);
            return result;
        });
    } catch (err) {
        logger.error(`depositItem error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function withdrawItem(playerId: number, itemId: number, qtyRaw: number, type?: string): Promise<StorageResult> {
    try {
        const property = await propertyForPlayerHere(playerId, type);
        if (!property) return { success: false, error: 'You have nothing of your own here.' };

        const item = await db('items').where({ id: itemId }).first();
        if (!item) return { success: false, error: 'Unknown item.' };

        // Same shape as depositItem above, and the same dupe without the lock:
        // two withdrawals of a full stack both read it, both delete the row
        // (the second matching nothing), and both add to the pack.
        const result = await db.transaction(async (trx) => {
            const stored = await trx('property_storage')
                .where({ property_id: property.id, item_id: itemId })
                .forUpdate()
                .first();
            if (!stored || stored.quantity < 1) return { success: false, error: 'That is not in store.' };

            const qty = Math.max(1, Math.min(Number(stored.quantity), Math.floor(qtyRaw)));

            if (Number(stored.quantity) === qty) {
                await trx('property_storage').where({ id: stored.id }).delete();
            } else {
                await trx('property_storage').where({ id: stored.id }).decrement('quantity', qty);
            }

            const inv = await trx('player_inventory')
                .where({ player_id: playerId, item_id: itemId })
                .forUpdate()
                .first();
            if (inv) await trx('player_inventory').where({ id: inv.id }).increment('quantity', qty);
            else await trx('player_inventory').insert({ player_id: playerId, item_id: itemId, quantity: qty });

            return { success: true, message: `Took ${qty} × ${item.name}.` };
        });

        // Outside the transaction: a socket push must not fire for work that
        // then rolls back.
        if (result.success) notifyInventoryChanged(playerId);

        return result;
    } catch (err) {
        logger.error(`withdrawItem error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}
