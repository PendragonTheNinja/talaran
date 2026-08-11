import db from '../db';
import { logger, io } from '../index';

// The one place items are EARNED.
//
// Every skill that hands a player something they worked for should come through
// here, so that "first time you ever got this" has a single source of truth. That
// answer feeds three things: the pickup flourish in the client, a future Exploration
// skill awarding experience on a first find, and the server-wide firsts feed in
// docs/IDEAS.md.
//
// Moves are NOT earnings. Trading, unequipping, lifting an item off the ground, and
// withdrawing from your own store all use a plain inventory add instead, because
// none of them are a discovery.

export interface GrantResult {
    itemId: number;
    quantity: number;
    /** first time this player has ever earned this item */
    firstEver: boolean;
    /** first time anyone in Talaran has earned it */
    firstInWorld: boolean;
}

/** Plain inventory add. Use for moving items about, not for earning them. */
/**
 * Tells the player's client its pack has changed, so it can refetch.
 * Every path that grants items — quest rewards, NPC gifts, storage withdrawals,
 * ground pickups — flows through addItemToInventory, so announcing it here covers
 * all of them at once instead of each caller remembering to.
 */
export function notifyInventoryChanged(playerId: number): void {
    try {
        io.to(`player_${playerId}`).emit('inventory_changed');
    } catch {
        // Socket may not be up (scripts, migrations); a missed refresh is harmless.
    }
}

export async function addItemToInventory(playerId: number, itemId: number, quantity: number): Promise<void> {
    const existing = await db('player_inventory').where({ player_id: playerId, item_id: itemId }).first();
    if (existing) {
        await db('player_inventory').where({ id: existing.id }).increment('quantity', quantity);
    } else {
        await db('player_inventory').insert({ player_id: playerId, item_id: itemId, quantity });
    }
    notifyInventoryChanged(playerId);
}

/**
 * Transaction-aware plain add. Same semantics as addItemToInventory, but joins
 * the caller's transaction and does NOT emit, because a socket message sent
 * from inside a transaction announces a change that a later rollback undoes.
 * Call notifyInventoryChanged(playerId) after the commit.
 */
export async function addItemToInventoryWithin(
    trx: any,
    playerId: number,
    itemId: number,
    quantity: number,
): Promise<void> {
    const existing = await trx('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .forUpdate()
        .first();

    if (existing) {
        await trx('player_inventory').where({ id: existing.id }).increment('quantity', quantity);
    } else {
        await trx('player_inventory').insert({ player_id: playerId, item_id: itemId, quantity });
    }
}

/**
 * Transaction-aware plain remove. Returns false without side effects when the
 * player does not hold enough, which is an expected race (another tab spent
 * them) rather than an error.
 */
export async function removeItemFromInventoryWithin(
    trx: any,
    playerId: number,
    itemId: number,
    quantity: number,
): Promise<boolean> {
    const row = await trx('player_inventory')
        .where({ player_id: playerId, item_id: itemId })
        .forUpdate()
        .first();

    if (!row || Number(row.quantity) < quantity) return false;

    if (Number(row.quantity) === quantity) {
        await trx('player_inventory').where({ id: row.id }).delete();
    } else {
        await trx('player_inventory').where({ id: row.id }).decrement('quantity', quantity);
    }
    return true;
}

/**
 * Record that a player earned an item, without touching inventory. Lets existing
 * services keep their own inventory writes and add first-tracking in one line.
 */
export async function recordItemFirst(
    playerId: number,
    itemId: number,
    source?: string,
): Promise<{ firstEver: boolean; firstInWorld: boolean }> {
    try {
        let firstEver = false;
        let firstInWorld = false;

        const seen = await db('player_item_firsts')
            .where({ player_id: playerId, item_id: itemId }).first();
        if (!seen) {
            await db('player_item_firsts')
                .insert({ player_id: playerId, item_id: itemId, source: source ?? null })
                .onConflict(['player_id', 'item_id']).ignore();
            firstEver = true;
        }

        if (firstEver) {
            const worldSeen = await db('item_firsts').where({ item_id: itemId }).first();
            if (!worldSeen) {
                const inserted = await db('item_firsts')
                    .insert({ item_id: itemId, player_id: playerId, source: source ?? null })
                    .onConflict('item_id').ignore()
                    .returning('id');
                firstInWorld = Array.isArray(inserted) ? inserted.length > 0 : !!inserted;
            }
        }

        return { firstEver, firstInWorld };
    } catch (err) {
        // Never let bookkeeping break an award.
        logger.error(`recordItemFirst failed (player ${playerId}, item ${itemId}): ${err}`);
        return { firstEver: false, firstInWorld: false };
    }
}

/** Same, by item name. */
export async function recordItemFirstByName(
    playerId: number,
    itemName: string,
    source?: string,
): Promise<{ firstEver: boolean; firstInWorld: boolean }> {
    const item = await db('items').where({ name: itemName }).first();
    if (!item) return { firstEver: false, firstInWorld: false };
    return recordItemFirst(playerId, item.id, source);
}

/** Earn an item: adds it to the pack and records the firsts. */
export async function grantItem(
    playerId: number,
    itemName: string,
    quantity: number,
    source?: string,
): Promise<GrantResult | null> {
    const item = await db('items').where({ name: itemName }).first();
    if (!item) {
        logger.error(`grantItem: no such item "${itemName}"`);
        return null;
    }
    await addItemToInventory(playerId, item.id, quantity);
    const firsts = await recordItemFirst(playerId, item.id, source);
    return { itemId: item.id, quantity, ...firsts };
}
