import db from '../db';
import { logger } from '../lib/logger';
import { pushToPlayer } from '../lib/realtime';

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
        pushToPlayer(playerId, 'inventory_changed');
    } catch {
        // Socket may not be up (scripts, migrations); a missed refresh is harmless.
    }
}

export async function addItemToInventory(playerId: number, itemId: number, quantity: number): Promise<void> {
    await upsertStack(db, playerId, itemId, quantity);
    notifyInventoryChanged(playerId);
}

/**
 * Add to a stack, creating it if needed, as ONE statement. It was read, then
 * increment or insert: two first-time adds of the same item both saw no stack,
 * both inserted, and the second failed on the one-stack-per-item rule
 * (player_inventory_player_id_item_id_unique). The upsert cannot race.
 */
async function upsertStack(q: any, playerId: number, itemId: number, quantity: number): Promise<void> {
    await q('player_inventory')
        .insert({ player_id: playerId, item_id: itemId, quantity })
        .onConflict(['player_id', 'item_id'])
        .merge({ quantity: q.raw('?? + ??', ['player_inventory.quantity', 'excluded.quantity']) });
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
    await upsertStack(trx, playerId, itemId, quantity);
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

/** A named quantity of an item: a recipe input, a build cost. */
export interface ItemCost {
    name: string;
    quantity: number;
}

/**
 * Take several named items from a player's pack inside the caller's
 * transaction: all of them, or none (audit §5.1).
 *
 * Every crafting path used to check the pack, then delete or decrement each
 * input without a lock, then add the output the same way. Two crafts at once
 * both passed the check, and the second then failed partway (since the
 * non-negative CHECKs) with some inputs already gone, or (before them) drove a
 * stack below zero. This:
 *   - resolves every item name first, so a missing item never costs anything;
 *   - locks each stack in item-id order, so two takes cannot deadlock;
 *   - checks every stack under those locks, and only then writes.
 * On a shortfall it returns { ok: false } having written nothing.
 */
export async function takeItemsWithin(
    trx: any,
    playerId: number,
    costs: ItemCost[],
): Promise<{ ok: true } | { ok: false; error: string }> {
    // One entry per item, even if a recipe names it twice.
    const need = new Map<string, number>();
    for (const c of costs) need.set(c.name, (need.get(c.name) ?? 0) + c.quantity);

    const items = await trx('items').whereIn('name', [...need.keys()]).select('id', 'name');
    const byName = new Map<string, { id: number; name: string }>(items.map((i: any) => [i.name, i]));
    for (const name of need.keys()) {
        if (!byName.has(name)) return { ok: false, error: `Required item not found: ${name}` };
    }

    const ordered = [...byName.values()].sort((a, b) => a.id - b.id);
    const stacks = new Map<number, any>();
    for (const item of ordered) {
        const row = await trx('player_inventory')
            .where({ player_id: playerId, item_id: item.id })
            .forUpdate()
            .first();
        const qty = need.get(item.name)!;
        if (!row || Number(row.quantity) < qty) return { ok: false, error: `You need ${qty}x ${item.name}.` };
        stacks.set(item.id, row);
    }

    for (const item of ordered) {
        const row = stacks.get(item.id);
        const qty = need.get(item.name)!;
        if (Number(row.quantity) === qty) {
            await trx('player_inventory').where({ id: row.id }).delete();
        } else {
            await trx('player_inventory').where({ id: row.id }).decrement('quantity', qty);
        }
    }
    return { ok: true };
}

/**
 * Turn inputs into an output as one unit: the output item is resolved before
 * anything is taken, then the inputs are taken and the output given in a single
 * transaction. Either the craft happens whole or nothing changes. Does not
 * emit; callers report the result themselves.
 */
export async function craftItems(
    playerId: number,
    inputs: ItemCost[],
    output: ItemCost,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const outputItem = await db('items').where({ name: output.name }).first();
    if (!outputItem) return { ok: false, error: `Output item not found: ${output.name}` };

    return db.transaction(async (trx) => {
        const took = await takeItemsWithin(trx, playerId, inputs);
        if (!took.ok) return took;   // nothing was written
        await upsertStack(trx, playerId, outputItem.id, output.quantity);
        return { ok: true as const };
    });
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

        // The first anyone has found it: it takes its place in the museum of
        // the island it was found on. Imported here, not at the top:
        // services/museum.ts imports this file.
        if (firstInWorld) {
            const { placeNewItem } = await import('./museum');
            await placeNewItem(itemId, playerId, source);
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
