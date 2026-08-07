import type { Knex } from 'knex';
import db from '../db';
import { notifyInventoryChanged } from './inventory';

// Liquid containers (docs — see migration 20260731230000_liquid_containers).
//
// A liquid exists in exactly three places, and the sum of them is what a player
// "has":
//
//   sealed   — `Bucket of Milk` items in the inventory, `per` units each
//   open     — one player_liquids row, 1..per-1 units, follows the player
//   nowhere  — the rest is empty `Lanai Bucket` items
//
// A bucket is never created or destroyed by these functions. Opening a sealed
// bucket moves it to `open`; emptying an open bucket returns the empty item;
// filling an open bucket to `per` seals it into an item. Buckets recycle as the
// liquid is spent, which is why a dairy needs two or three buckets rather than
// one per collection.
//
// Nothing here knows about Husbandry. services/recipes.ts routes any recipe input
// naming a liquid through consumeLiquid, so Cooking (and anything after it) gets
// partial-bucket handling for free.

export interface LiquidDef {
    /** The unit name, as recipes write it: { itemName: 'Milk', qty: 3 }. */
    liquid: string;
    /** The sealed, full item that lives in the inventory. */
    sealed: string;
    /** The empty container item. */
    empty: string;
    /** Units per container. */
    per: number;
}

export const LIQUIDS: Record<string, LiquidDef> = {
    Milk: { liquid: 'Milk', sealed: 'Bucket of Milk', empty: 'Lanai Bucket', per: 10 },
};

export function isLiquid(itemName: string): boolean {
    return Object.prototype.hasOwnProperty.call(LIQUIDS, itemName);
}

type Ex = Knex | Knex.Transaction;

async function itemId(name: string, x: Ex): Promise<number | null> {
    const item = await x('items').where({ name }).first();
    return item?.id ?? null;
}

async function qtyOf(playerId: number, name: string, x: Ex): Promise<number> {
    const id = await itemId(name, x);
    if (!id) return 0;
    const row = await x('player_inventory').where({ player_id: playerId, item_id: id }).first();
    return row?.quantity ?? 0;
}

async function give(playerId: number, name: string, qty: number, x: Ex): Promise<void> {
    if (qty < 1) return;
    const id = await itemId(name, x);
    if (!id) throw new Error(`liquids: missing item ${name}`);
    const row = await x('player_inventory')
        .where({ player_id: playerId, item_id: id }).forUpdate().first();
    if (row) await x('player_inventory').where({ id: row.id }).increment('quantity', qty);
    else await x('player_inventory').insert({ player_id: playerId, item_id: id, quantity: qty });
    notifyInventoryChanged(playerId);
}

async function take(playerId: number, name: string, qty: number, x: Ex): Promise<boolean> {
    if (qty < 1) return true;
    const id = await itemId(name, x);
    if (!id) return false;
    const row = await x('player_inventory')
        .where({ player_id: playerId, item_id: id }).forUpdate().first();
    if (!row || row.quantity < qty) return false;
    if (row.quantity === qty) await x('player_inventory').where({ id: row.id }).delete();
    else await x('player_inventory').where({ id: row.id }).update({ quantity: row.quantity - qty });
    notifyInventoryChanged(playerId);
    return true;
}

/** Units in the open container, 0 if none is open. */
export async function openUnits(playerId: number, liquid: string, x: Ex = db): Promise<number> {
    const row = await x('player_liquids').where({ player_id: playerId, liquid }).first();
    return row?.units ?? 0;
}

async function setOpen(playerId: number, liquid: string, units: number, x: Ex): Promise<void> {
    const row = await x('player_liquids').where({ player_id: playerId, liquid }).first();
    if (units <= 0) {
        if (row) await x('player_liquids').where({ id: row.id }).delete();
        return;
    }
    if (row) await x('player_liquids').where({ id: row.id }).update({ units });
    else await x('player_liquids').insert({ player_id: playerId, liquid, units });
}

/** Everything the player holds of this liquid: sealed buckets plus the open one. */
export async function liquidTotal(playerId: number, liquid: string, x: Ex = db): Promise<number> {
    const def = LIQUIDS[liquid];
    if (!def) return 0;
    const sealed = await qtyOf(playerId, def.sealed, x);
    return sealed * def.per + (await openUnits(playerId, liquid, x));
}

/** For the UI: sealed count, open units, capacity, and empties to hand. */
export async function liquidState(playerId: number, liquid: string, x: Ex = db) {
    const def = LIQUIDS[liquid];
    if (!def) return null;
    const sealed = await qtyOf(playerId, def.sealed, x);
    const open = await openUnits(playerId, liquid, x);
    return {
        liquid, per: def.per,
        sealedItem: def.sealed, emptyItem: def.empty,
        sealed, open,
        total: sealed * def.per + open,
        empties: await qtyOf(playerId, def.empty, x),
    };
}

/**
 * Whether the player could take on `qty` more units right now. Filling needs
 * either room in the open container or an empty bucket to start a new one.
 */
export async function canFill(playerId: number, liquid: string, qty: number, x: Ex = db): Promise<boolean> {
    const def = LIQUIDS[liquid];
    if (!def) return true;
    const open = await openUnits(playerId, liquid, x);
    const room = open > 0 ? def.per - open : 0;
    if (qty <= room) return true;
    const needed = Math.ceil((qty - room) / def.per);
    return (await qtyOf(playerId, def.empty, x)) >= needed;
}

/**
 * Pours `qty` units in, opening empty buckets as needed and sealing each one the
 * moment it is full. Returns how much was actually poured — short only when the
 * player ran out of empty buckets.
 */
export async function addLiquid(playerId: number, liquid: string, qty: number, x: Ex = db): Promise<number> {
    const def = LIQUIDS[liquid];
    if (!def) throw new Error(`addLiquid: ${liquid} is not a liquid`);

    let remaining = qty;
    let poured = 0;
    let open = await openUnits(playerId, liquid, x);

    while (remaining > 0) {
        if (open === 0) {
            // Need a fresh container. The empty bucket leaves the inventory and
            // becomes the open one.
            if (!(await take(playerId, def.empty, 1, x))) break;
        }
        const room = def.per - open;
        const put = Math.min(room, remaining);
        open += put;
        remaining -= put;
        poured += put;

        if (open >= def.per) {
            // Full: seal it into an item and start again from empty.
            await give(playerId, def.sealed, 1, x);
            open = 0;
        }
    }

    await setOpen(playerId, liquid, open, x);
    return poured;
}

/**
 * Draws `qty` units out: the open container first, then breaking the seal on
 * stored buckets as needed. An open container that empties exactly returns its
 * bucket to the inventory. Returns false and changes nothing if there is not
 * enough — callers should check first, but this stays safe either way.
 */
export async function consumeLiquid(playerId: number, liquid: string, qty: number, x: Ex = db): Promise<boolean> {
    const def = LIQUIDS[liquid];
    if (!def) throw new Error(`consumeLiquid: ${liquid} is not a liquid`);
    if (qty < 1) return true;
    if ((await liquidTotal(playerId, liquid, x)) < qty) return false;

    let remaining = qty;
    let open = await openUnits(playerId, liquid, x);

    while (remaining > 0) {
        if (open === 0) {
            // Crack a sealed bucket. It becomes the open container, so the bucket
            // itself is in use rather than in the pack.
            if (!(await take(playerId, def.sealed, 1, x))) return false;
            open = def.per;
        }
        const drawn = Math.min(open, remaining);
        open -= drawn;
        remaining -= drawn;

        if (open === 0) {
            // Emptied: the container is free again.
            await give(playerId, def.empty, 1, x);
        }
    }

    await setOpen(playerId, liquid, open, x);
    return true;
}
