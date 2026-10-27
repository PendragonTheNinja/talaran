import db from '../db';
import { notifyInventoryChanged } from './inventory';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { settleWards } from './husbandry';

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

/** A storage move, inside the caller's transaction. Refusals come back before anything is written. */
export type StorageMove = { ok: true; quantity: number; name: string } | { ok: false; error: string }

/**
 * Pack to store, locked and relative (CLAUDE.md §4). `qtyRaw` is clamped to
 * what is carried. Shared by the storage route and Sending (services/spells.ts),
 * which runs it inside a cast; a refusal here leaves nothing changed, so the
 * caller decides whether to throw.
 */
export async function moveIntoStorageWithin(trx: any, playerId: number, property: { id: number; storage_slots?: number | null }, itemId: number, qtyRaw: number): Promise<StorageMove> {
    const item = await trx('items').where({ id: itemId }).first()
    if (!item) return { ok: false, error: 'Unknown item.' }

    // The inventory row locked: this used to read the stack, then write an
    // ABSOLUTE quantity back. Two deposits landing together both read 5, both
    // write 5 - qty, and the second silently undoes the first; two deposits of
    // a whole stack both delete the row and both add to store, so five items
    // in the pack become ten in the chest. The slot check has the same hole:
    // two new stacks can both see the last free slot.
    const inv = await trx('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .forUpdate()
        .first()
    if (!inv || inv.quantity < 1) return { ok: false, error: 'You are not carrying that.' }

    const qty = Math.max(1, Math.min(Number(inv.quantity), Math.floor(qtyRaw)))

    const existing = await trx('property_storage')
        .where({ property_id: property.id, item_id: itemId })
        .forUpdate()
        .first()

    // A new stack needs a free slot; topping up an existing one never does.
    if (!existing) {
        const used = await trx('property_storage')
            .where({ property_id: property.id })
            .where('quantity', '>', 0)
            .count({ c: '*' }).first()
        if (Number(used?.c ?? 0) >= (property.storage_slots ?? 50)) {
            return { ok: false, error: 'There is no room left in store.' }
        }
    }

    if (Number(inv.quantity) === qty) {
        await trx('player_inventory').where({ id: inv.id }).delete()
    } else {
        await trx('player_inventory').where({ id: inv.id }).decrement('quantity', qty)
    }

    if (existing) {
        await trx('property_storage').where({ id: existing.id }).increment('quantity', qty)
    } else {
        await trx('property_storage').insert({ property_id: property.id, item_id: itemId, quantity: qty })
    }
    return { ok: true, quantity: qty, name: item.name }
}

/** Store to pack, locked and relative. Same contract as moveIntoStorageWithin. */
export async function moveOutOfStorageWithin(trx: any, playerId: number, property: { id: number }, itemId: number, qtyRaw: number): Promise<StorageMove> {
    const item = await trx('items').where({ id: itemId }).first()
    if (!item) return { ok: false, error: 'Unknown item.' }

    // The same dupe without the lock: two withdrawals of a full stack both
    // read it, both delete the row (the second matching nothing), and both add
    // to the pack.
    const stored = await trx('property_storage')
        .where({ property_id: property.id, item_id: itemId })
        .forUpdate()
        .first()
    if (!stored || stored.quantity < 1) return { ok: false, error: 'That is not in store.' }

    const qty = Math.max(1, Math.min(Number(stored.quantity), Math.floor(qtyRaw)))

    if (Number(stored.quantity) === qty) {
        await trx('property_storage').where({ id: stored.id }).delete()
    } else {
        await trx('property_storage').where({ id: stored.id }).decrement('quantity', qty)
    }

    const inv = await trx('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .forUpdate()
        .first()
    if (inv) await trx('player_inventory').where({ id: inv.id }).increment('quantity', qty)
    else await trx('player_inventory').insert({ player_id: playerId, item_id: itemId, quantity: qty })
    return { ok: true, quantity: qty, name: item.name }
}

export async function depositItem(playerId: number, itemId: number, qtyRaw: number, type?: string): Promise<StorageResult> {
    try {
        const property = await propertyForPlayerHere(playerId, type);
        if (!property) return { success: false, error: 'You have nothing of your own here.' };

        // A Larder Ward feeds pens from this store (services/husbandry.ts).
        // Settle it first, so a trough that ran dry earlier eats from what was
        // in store then, not from what is in store after this.
        if (property.type === 'farmstead') await settleWards(playerId);

        // `return await`, not `return`: without the await this hands back the
        // promise before it settles, so a failure inside the transaction
        // skipped this function's catch and escaped to Express as an HTML 500.
        const moved = await db.transaction((trx) => moveIntoStorageWithin(trx, playerId, property, itemId, qtyRaw));
        if (!moved.ok) return { success: false, error: moved.error };
        // The pack changed, so every panel showing it needs to know. Withdraw
        // has always said so; deposit never did, which is why the inventory
        // panel kept showing items that were already in store until something
        // else refreshed it.
        notifyInventoryChanged(playerId);
        return { success: true, message: `Stored ${moved.quantity} × ${moved.name}.` };
    } catch (err) {
        logger.error(`depositItem error: ${err}`);
        return { success: false, error: SERVER_ERROR };
    }
}

export async function withdrawItem(playerId: number, itemId: number, qtyRaw: number, type?: string): Promise<StorageResult> {
    try {
        const property = await propertyForPlayerHere(playerId, type);
        if (!property) return { success: false, error: 'You have nothing of your own here.' };

        // See depositItem: a warded trough eats before the store changes.
        if (property.type === 'farmstead') await settleWards(playerId);

        const moved = await db.transaction((trx) => moveOutOfStorageWithin(trx, playerId, property, itemId, qtyRaw));
        if (!moved.ok) return { success: false, error: moved.error };
        // Outside the transaction: a socket push must not fire for work that
        // then rolls back.
        notifyInventoryChanged(playerId);
        return { success: true, message: `Took ${moved.quantity} × ${moved.name}.` };
    } catch (err) {
        logger.error(`withdrawItem error: ${err}`);
        return { success: false, error: SERVER_ERROR };
    }
}
