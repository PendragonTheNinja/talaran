import db from '../db';
import { notifyInventoryChanged } from './inventory';
import { logger } from '../index';

// Property storage. One SLOT holds one unique item stack of any size, so 50 slots
// means 50 different items, not 50 things. Stores are per-property: what you keep
// at the farmstead stays there. Deposits and withdrawals are instant — this is
// housekeeping, not a skill.

export interface StorageResult {
    success: boolean;
    error?: string;
    message?: string;
}

async function propertyForPlayerHere(playerId: number) {
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player) return null;
    return db('player_properties')
        .where({ player_id: playerId, location_id: player.current_location_id })
        .first();
}

export async function getStorage(playerId: number) {
    const property = await propertyForPlayerHere(playerId);
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

export async function depositItem(playerId: number, itemId: number, qtyRaw: number): Promise<StorageResult> {
    try {
        const property = await propertyForPlayerHere(playerId);
        if (!property) return { success: false, error: 'You have nothing of your own here.' };

        const inv = await db('player_inventory').where({ player_id: playerId, item_id: itemId }).first();
        if (!inv || inv.quantity < 1) return { success: false, error: 'You are not carrying that.' };

        const qty = Math.max(1, Math.min(Number(inv.quantity), Math.floor(qtyRaw)));
        const item = await db('items').where({ id: itemId }).first();
        if (!item) return { success: false, error: 'Unknown item.' };

        const existing = await db('property_storage')
            .where({ property_id: property.id, item_id: itemId }).first();

        // A new stack needs a free slot; topping up an existing one never does.
        if (!existing) {
            const used = await db('property_storage')
                .where({ property_id: property.id })
                .where('quantity', '>', 0)
                .count({ c: '*' }).first();
            const usedCount = Number(used?.c ?? 0);
            if (usedCount >= (property.storage_slots ?? 50)) {
                return { success: false, error: 'There is no room left in store.' };
            }
        }

        if (inv.quantity === qty) await db('player_inventory').where({ id: inv.id }).delete();
        else await db('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - qty });

        if (existing) {
            await db('property_storage').where({ id: existing.id }).increment('quantity', qty);
        } else {
            await db('property_storage').insert({ property_id: property.id, item_id: itemId, quantity: qty });
        }

        return { success: true, message: `Stored ${qty} × ${item.name}.` };
    } catch (err) {
        logger.error(`depositItem error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function withdrawItem(playerId: number, itemId: number, qtyRaw: number): Promise<StorageResult> {
    try {
        const property = await propertyForPlayerHere(playerId);
        if (!property) return { success: false, error: 'You have nothing of your own here.' };

        const stored = await db('property_storage')
            .where({ property_id: property.id, item_id: itemId }).first();
        if (!stored || stored.quantity < 1) return { success: false, error: 'That is not in store.' };

        const qty = Math.max(1, Math.min(Number(stored.quantity), Math.floor(qtyRaw)));
        const item = await db('items').where({ id: itemId }).first();
        if (!item) return { success: false, error: 'Unknown item.' };

        if (Number(stored.quantity) === qty) await db('property_storage').where({ id: stored.id }).delete();
        else await db('property_storage').where({ id: stored.id }).update({ quantity: Number(stored.quantity) - qty });

        const inv = await db('player_inventory').where({ player_id: playerId, item_id: itemId }).first();
        if (inv) await db('player_inventory').where({ id: inv.id }).increment('quantity', qty);
        else await db('player_inventory').insert({ player_id: playerId, item_id: itemId, quantity: qty });
        notifyInventoryChanged(playerId);

        return { success: true, message: `Took ${qty} × ${item.name}.` };
    } catch (err) {
        logger.error(`withdrawItem error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}
