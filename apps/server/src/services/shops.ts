import db from '../db';
import { logger } from '../index';
import { levelFromXp } from './xp';
import { incrementStats } from './stats';
import { activeXpForSeconds } from './farming';
import { missingBuildTool } from './construction';
import { creditGoldWithin, debitGoldWithin, lockPlayersInOrder } from './gold';
import { addItemToInventoryWithin, removeItemFromInventoryWithin } from './inventory';

// Player Shops (docs/marketplace-spec.md §4).
//
// A shop is a player_properties row with type='shop', so storage comes free
// from property_storage. This module owns everything above that: raising the
// building, and later the commerce layer.
//
// NOTE ON THE HELPERS BELOW: the TOOL check is shared, in
// services/construction.ts, because getting it wrong locally is exactly what
// happened three times. The material and XP helpers still mirror ones in
// services/farming.ts and are worth folding into construction.ts on the next
// pass through this area.

// ── Where and what it costs ─────────────────────────────────────────────────

/** Shops are raised in the market town only. Poll pending on one-per-island. */
export const SHOP_TOWN = 'Talador';

export const CARPENTRY_REQ = 1;


// A little less than a farmstead (500/500/1000, 600s): a shopfront is one
// building, not a homestead with fields.
export const ESTABLISH_COST = [
    { itemName: 'Lanai Planks', qty: 350 },
    { itemName: 'Granite Block', qty: 350 },
    { itemName: 'Ambren Nails', qty: 700 },
];

export const ESTABLISH_SECONDS = 480;
const ESTABLISH_XP_BONUS = 1.25;   // matches the farmstead: building pays a little over

// Per-tier numbers. Tier 1 is all that exists; the table is here so adding a
// tier is data plus one row, never a schema change.
export const SHOP_TIERS: Record<number, { storageSlots: number; sellSlots: number; buySlots: number }> = {
    1: { storageSlots: 75, sellSlots: 12, buySlots: 6 },
};

export const DEFAULT_SHOP_NAME = (username: string) => `${username}'s Shop`;

export interface ShopActionResult {
    success: boolean;
    error?: string;
    message?: string;
    xp?: number;
    skillName?: string;
    itemName?: string;
}

// ── Local helpers ───────────────────────────────────────────────────────────

async function skillLevel(playerId: number, skillName: string): Promise<number> {
    const skill = await db('skills').where({ name: skillName }).first();
    if (!skill) return 1;
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    return ps ? levelFromXp(ps.xp) : 1;
}

async function inventoryQty(playerId: number, itemName: string): Promise<number> {
    const row = await db('player_inventory')
        .join('items', 'player_inventory.item_id', 'items.id')
        .where('player_inventory.player_id', playerId)
        .where('items.name', itemName)
        .select('player_inventory.quantity')
        .first();
    return row ? Number(row.quantity) : 0;
}

async function hasMaterials(playerId: number, cost: { itemName: string; qty: number }[]) {
    const missing: { itemName: string; need: number; have: number }[] = [];
    for (const c of cost) {
        const have = await inventoryQty(playerId, c.itemName);
        if (have < c.qty) missing.push({ itemName: c.itemName, need: c.qty, have });
    }
    return { ok: missing.length === 0, missing };
}

async function consumeMaterials(playerId: number, cost: { itemName: string; qty: number }[]) {
    for (const c of cost) {
        const item = await db('items').where({ name: c.itemName }).first();
        if (!item) continue;
        const row = await db('player_inventory')
            .where({ player_id: playerId, item_id: item.id }).first();
        if (!row) continue;
        if (Number(row.quantity) <= c.qty) {
            await db('player_inventory').where({ id: row.id }).delete();
        } else {
            await db('player_inventory').where({ id: row.id }).decrement('quantity', c.qty);
        }
    }
}

async function awardXp(playerId: number, skillName: string, xp: number): Promise<void> {
    const skill = await db('skills').where({ name: skillName }).first();
    if (!skill) return;
    const existing = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first();
    if (existing) await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).increment('xp', xp);
    else await db('player_skills').insert({ player_id: playerId, skill_id: skill.id, xp });
}

async function busy(playerId: number): Promise<boolean> {
    const a = await db('player_actions').where({ player_id: playerId }).first();
    return !!a;
}

async function startAction(playerId: number, type: string, seconds: number, locationId: number | null) {
    const now = new Date();
    await db('player_actions').insert({
        player_id: playerId,
        action_type: type,
        action_data: null,
        location_id: locationId,
        started_at: now,
        completes_at: new Date(now.getTime() + seconds * 1000),
        auto_restart: false,
        last_bot_check: now,
    });
}

// ── Lookup ──────────────────────────────────────────────────────────────────

/** The shop property row for a player, wherever it is. One per player for now. */
export async function shopPropertyFor(playerId: number) {
    return db('player_properties').where({ player_id: playerId, type: 'shop' }).first();
}

/** The shopfront row plus its property, or null. */
export async function shopFor(playerId: number) {
    const property = await shopPropertyFor(playerId);
    if (!property) return null;
    const shop = await db('player_shops').where({ property_id: property.id }).first();
    return shop ? { shop, property } : null;
}

/** Is the player standing at their own shop? Presence is required to manage it. */
export async function isAtOwnShop(playerId: number): Promise<boolean> {
    const found = await shopFor(playerId);
    if (!found) return false;
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    return !!player && player.current_location_id === found.property.location_id;
}

// ── Building ────────────────────────────────────────────────────────────────

/** What the build panel needs to render before anything is started. */
export async function getBuildInfo(playerId: number) {
    const town = await db('locations').where({ name: SHOP_TOWN }).first();
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    const existing = await shopFor(playerId);

    const cost = await Promise.all(ESTABLISH_COST.map(async (c) => ({
        itemName: c.itemName,
        need: c.qty,
        have: await inventoryQty(playerId, c.itemName),
    })));

    return {
        town: SHOP_TOWN,
        hasShop: !!existing,
        atTown: !!town && !!player && player.current_location_id === town.id,
        carpentryLevel: await skillLevel(playerId, 'Carpentry'),
        carpentryRequired: CARPENTRY_REQ,
        seconds: ESTABLISH_SECONDS,
        cost,
        canAfford: cost.every((c) => c.have >= c.need),
        missingTool: (await missingBuildTool(playerId))?.message ?? null,
        tier1: SHOP_TIERS[1],
    };
}

export async function startEstablishShop(playerId: number): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    const town = await db('locations').where({ name: SHOP_TOWN }).first();
    if (!town) return { ok: false, error: `${SHOP_TOWN} not found.` };

    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player || player.current_location_id !== town.id) {
        return { ok: false, error: `You must be in ${SHOP_TOWN} to raise a shop.` };
    }
    // shopFor, not shopPropertyFor. The build panel already asked shopFor, so
    // guarding on the property alone meant the two disagreed: a property row
    // with no shopfront behind it showed the build UI and then refused to
    // build, with no way for the player to reconcile the two.
    if (await shopFor(playerId)) return { ok: false, error: 'You already have a shop.' };
    if (await busy(playerId)) return { ok: false, error: 'You are already performing an action.' };

    const carp = await skillLevel(playerId, 'Carpentry');
    if (carp < CARPENTRY_REQ) return { ok: false, error: `Requires Carpentry level ${CARPENTRY_REQ}.` };

    const missingTool = await missingBuildTool(playerId);
    if (missingTool) return { ok: false, error: missingTool.message };

    const matCheck = await hasMaterials(playerId, ESTABLISH_COST);
    if (!matCheck.ok) {
        const m = matCheck.missing.map((x) => `${x.need}x ${x.itemName} (have ${x.have})`).join(', ');
        return { ok: false, error: `You need: ${m}.` };
    }

    await startAction(playerId, 'shop_establish', ESTABLISH_SECONDS, town.id);
    return { ok: true, timerSeconds: ESTABLISH_SECONDS };
}

export async function resolveEstablishShop(playerId: number): Promise<ShopActionResult> {
    try {
        const town = await db('locations').where({ name: SHOP_TOWN }).first();
        if (!town) return { success: false, error: `${SHOP_TOWN} not found.` };
        if (await shopFor(playerId)) return { success: false, error: 'You already have a shop.' };

        const missingTool = await missingBuildTool(playerId);
        if (missingTool) return { success: false, error: missingTool.message };

        // Re-checked at resolve, not just at start: the timer runs for eight
        // minutes and the materials can be traded away in that window.
        const matCheck = await hasMaterials(playerId, ESTABLISH_COST);
        if (!matCheck.ok) return { success: false, error: 'You no longer have the materials.' };

        const player = await db('players').where({ id: playerId }).select('username').first();
        const tier = SHOP_TIERS[1];

        await db.transaction(async (trx) => {
            // A property with no shopfront is a half-built shop. Reuse it
            // rather than inserting a second: this establish is transactional
            // so it cannot create that state itself, but anything that removed
            // a shopfront row leaves one behind, and the player is then stuck
            // between a panel offering to build and a guard refusing to. Repair
            // is the only outcome that gets them moving again.
            const dangling = await trx('player_properties')
                .where({ player_id: playerId, type: 'shop' })
                .first();

            let propertyId: number;
            if (dangling) {
                propertyId = dangling.id;
                logger.warn(`Player ${playerId} had a shop property with no shopfront; completing it`);
            } else {
                const [row] = await trx('player_properties').insert({
                    player_id: playerId,
                    location_id: town.id,
                    type: 'shop',
                    tier: 1,
                    plot_slots: 0,
                    storage_slots: tier.storageSlots,
                }).returning('id');
                propertyId = typeof row === 'object' ? row.id : row;
            }

            await trx('player_shops').insert({
                property_id: propertyId,
                name: DEFAULT_SHOP_NAME(player?.username ?? 'A Trader'),
                description: null,
                sell_slots: tier.sellSlots,
                buy_slots: tier.buySlots,
            });
        });

        await consumeMaterials(playerId, ESTABLISH_COST);

        const carpLvl = await skillLevel(playerId, 'Carpentry');
        const xp = Math.round(activeXpForSeconds(carpLvl, ESTABLISH_SECONDS) * ESTABLISH_XP_BONUS);
        await awardXp(playerId, 'Carpentry', xp);
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: xp });

        logger.info(`Player ${playerId} raised a shop at ${SHOP_TOWN}`);
        return {
            success: true,
            xp,
            skillName: 'Carpentry',
            message: 'Your shopfront is finished. Name it, stock it, and see who wanders in.',
        };
    } catch (err) {
        logger.error(`resolveEstablishShop error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Commerce (docs/marketplace-spec.md §4.3, §4.4)
// ═══════════════════════════════════════════════════════════════════════════

/** Cut taken from a completed player sale. The economy's main gold sink. */
export const SALE_TAX_RATE = 0.03;

export function taxOn(gross: number): number {
    return Math.floor(gross * SALE_TAX_RATE);
}

export interface ShopResult {
    success: boolean;
    error?: string;
    message?: string;
}

/**
 * Gold in the buy fund that is not already promised to a standing order.
 *
 * Without this, five 500g orders could sit on a 500g fund and four sellers
 * would hit an error at the moment of sale, which is the worst possible time
 * to find out.
 */
export async function buyFundAvailable(trxOrDb: any, shopId: number): Promise<{ fund: number; reserved: number; available: number }> {
    const shop = await trxOrDb('player_shops').where({ id: shopId }).first();
    const fund = Number(shop?.buy_fund_gold ?? 0);

    const orders = await trxOrDb('shop_buy_orders').where({ shop_id: shopId })
        .select('quantity_wanted', 'quantity_filled', 'unit_price');

    const reserved = orders.reduce((sum: number, o: any) => {
        const outstanding = Math.max(0, Number(o.quantity_wanted) - Number(o.quantity_filled));
        return sum + outstanding * Number(o.unit_price);
    }, 0);

    return { fund, reserved, available: fund - reserved };
}

// ── Listings ────────────────────────────────────────────────────────────────

/**
 * Move a stack out of storage and onto the shelf. Goods for sale are not also
 * in the back room, so a listing can never promise more than exists.
 */
/**
 * Puts stock on the shelf, and tops up what is already there.
 *
 * The price is optional when a listing exists. Restocking used to demand one,
 * which meant the only way to add to a shelf was to withdraw the listing and
 * build it again from scratch, re-typing a price that had not changed. Omitting
 * it now keeps whatever the shelf was already priced at, so restocking is
 * moving goods rather than re-doing the decision.
 *
 * A price is still required to open a NEW listing, because there is nothing to
 * inherit and a shelf without one cannot be sold from.
 */
export async function createListing(
    playerId: number, itemId: number, quantity: number, unitPrice?: number | null,
): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return { success: false, error: 'Invalid quantity.' };

    const priceGiven = unitPrice !== undefined && unitPrice !== null && String(unitPrice) !== '';
    const price = priceGiven ? Math.floor(Number(unitPrice)) : null;
    if (priceGiven && (!Number.isFinite(price!) || price! <= 0)) {
        return { success: false, error: 'Set a price of at least 1g.' };
    }

    try {
        return await db.transaction(async (trx) => {
            const stored = await trx('property_storage')
                .where({ property_id: found.property.id, item_id: itemId })
                .forUpdate().first();
            if (!stored || Number(stored.quantity) < qty) {
                return { success: false, error: 'You do not have that many in storage.' };
            }

            const existing = await trx('shop_listings')
                .where({ shop_id: found.shop.id, item_id: itemId }).forUpdate().first();

            // Opening a shelf needs a price; topping one up inherits it.
            if (!existing && price === null) {
                return { success: false, error: 'Set a price for this shelf.' };
            }

            if (!existing) {
                const count = await trx('shop_listings').where({ shop_id: found.shop.id }).count('* as c').first();
                if (Number(count?.c ?? 0) >= Number(found.shop.sell_slots)) {
                    return { success: false, error: `Your shop only has ${found.shop.sell_slots} selling slots.` };
                }
            }

            if (Number(stored.quantity) === qty) {
                await trx('property_storage').where({ id: stored.id }).delete();
            } else {
                await trx('property_storage').where({ id: stored.id }).decrement('quantity', qty);
            }

            if (existing) {
                // Naming a price re-prices the whole stack. Two prices for one
                // item would just be an order book where nobody ever buys the
                // dearer row. Naming none leaves the shelf as it was.
                await trx('shop_listings').where({ id: existing.id }).update({
                    quantity: Number(existing.quantity) + qty,
                    unit_price: price ?? existing.unit_price,
                    updated_at: new Date(),
                });
            } else {
                await trx('shop_listings').insert({
                    shop_id: found.shop.id, item_id: itemId, quantity: qty, unit_price: price!,
                });
            }

            return {
                success: true,
                message: existing
                    ? `Restocked. ${Number(existing.quantity) + qty} on the shelf at ${price ?? existing.unit_price}g.`
                    : 'Listed for sale.',
            };
        });
    } catch (err) {
        logger.error(`createListing error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function setListingPrice(playerId: number, listingId: number, unitPrice: number): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    const price = Math.floor(Number(unitPrice));
    if (!Number.isFinite(price) || price <= 0) return { success: false, error: 'Set a price of at least 1g.' };

    const updated = await db('shop_listings')
        .where({ id: listingId, shop_id: found.shop.id })
        .update({ unit_price: price, updated_at: new Date() });

    return updated ? { success: true, message: 'Price updated.' } : { success: false, error: 'No such listing.' };
}

/** Pull a listing off the shelf and back into storage. */
export async function cancelListing(playerId: number, listingId: number, quantity?: number): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    try {
        return await db.transaction(async (trx) => {
            const listing = await trx('shop_listings')
                .where({ id: listingId, shop_id: found.shop.id }).forUpdate().first();
            if (!listing) return { success: false, error: 'No such listing.' };

            const take = quantity === undefined
                ? Number(listing.quantity)
                : Math.min(Number(listing.quantity), Math.max(1, Math.floor(Number(quantity))));

            const stored = await trx('property_storage')
                .where({ property_id: found.property.id, item_id: listing.item_id }).forUpdate().first();

            // Refuse rather than destroy. Goods coming off the shelf with
            // nowhere to go must stay on the shelf.
            if (!stored) {
                const used = await trx('property_storage')
                    .where({ property_id: found.property.id }).count('* as c').first();
                if (Number(used?.c ?? 0) >= Number(found.property.storage_slots ?? 0)) {
                    return { success: false, error: 'Your storage is full. Make room before unlisting this.' };
                }
                await trx('property_storage').insert({
                    property_id: found.property.id, item_id: listing.item_id, quantity: take,
                });
            } else {
                await trx('property_storage').where({ id: stored.id }).increment('quantity', take);
            }

            if (take >= Number(listing.quantity)) {
                await trx('shop_listings').where({ id: listing.id }).delete();
            } else {
                await trx('shop_listings').where({ id: listing.id }).decrement('quantity', take);
            }

            return { success: true, message: 'Returned to storage.' };
        });
    } catch (err) {
        logger.error(`cancelListing error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── Buy orders ──────────────────────────────────────────────────────────────

export async function depositBuyFund(playerId: number, amount: number): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value <= 0) return { success: false, error: 'Invalid amount.' };

    try {
        return await db.transaction(async (trx) => {
            const taken = await debitGoldWithin(trx, {
                playerId, amount: value, reason: 'shop_fund_deposit',
                refType: 'shop', refId: found.shop.id,
            });
            if (!taken.ok) return { success: false, error: 'You do not have that much gold.' };

            await trx('player_shops').where({ id: found.shop.id }).increment('buy_fund_gold', value);
            return { success: true, message: `Put ${value.toLocaleString()}g into the buying fund.` };
        });
    } catch (err) {
        logger.error(`depositBuyFund error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function withdrawBuyFund(playerId: number, amount: number): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value <= 0) return { success: false, error: 'Invalid amount.' };

    try {
        return await db.transaction(async (trx) => {
            await trx('player_shops').where({ id: found.shop.id }).forUpdate().first();
            const { available } = await buyFundAvailable(trx, found.shop.id);

            // Only unreserved gold can leave. Reserved gold is already promised
            // to a seller who has not walked in yet.
            if (value > available) {
                return { success: false, error: `Only ${available.toLocaleString()}g is free. The rest backs your buy orders.` };
            }

            await trx('player_shops').where({ id: found.shop.id }).decrement('buy_fund_gold', value);
            await creditGoldWithin(trx, {
                playerId, amount: value, reason: 'shop_fund_withdraw',
                refType: 'shop', refId: found.shop.id,
            });
            return { success: true, message: `Took ${value.toLocaleString()}g back out.` };
        });
    } catch (err) {
        logger.error(`withdrawBuyFund error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function collectTill(playerId: number): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    try {
        return await db.transaction(async (trx) => {
            const shop = await trx('player_shops').where({ id: found.shop.id }).forUpdate().first();
            const amount = Number(shop?.till_gold ?? 0);
            if (amount <= 0) return { success: false, error: 'The till is empty.' };

            await trx('player_shops').where({ id: found.shop.id }).update({ till_gold: 0 });
            await creditGoldWithin(trx, {
                playerId, amount, reason: 'shop_till_withdraw',
                refType: 'shop', refId: found.shop.id,
            });
            return { success: true, message: `Collected ${amount.toLocaleString()}g from the till.` };
        });
    } catch (err) {
        logger.error(`collectTill error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

export async function createBuyOrder(
    playerId: number, itemId: number, quantity: number, unitPrice: number,
): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    const qty = Math.floor(Number(quantity));
    const price = Math.floor(Number(unitPrice));
    if (!Number.isFinite(qty) || qty <= 0) return { success: false, error: 'Invalid quantity.' };
    if (!Number.isFinite(price) || price <= 0) return { success: false, error: 'Offer at least 1g.' };

    try {
        return await db.transaction(async (trx) => {
            await trx('player_shops').where({ id: found.shop.id }).forUpdate().first();

            const existing = await trx('shop_buy_orders')
                .where({ shop_id: found.shop.id, item_id: itemId }).forUpdate().first();

            if (!existing) {
                const count = await trx('shop_buy_orders').where({ shop_id: found.shop.id }).count('* as c').first();
                if (Number(count?.c ?? 0) >= Number(found.shop.buy_slots)) {
                    return { success: false, error: `Your shop only has ${found.shop.buy_slots} buying slots.` };
                }
            }

            // Cost of the NEW commitment, netting off whatever the existing
            // order already had reserved.
            const previouslyReserved = existing
                ? Math.max(0, Number(existing.quantity_wanted) - Number(existing.quantity_filled)) * Number(existing.unit_price)
                : 0;
            const wantedCost = qty * price;

            const { available } = await buyFundAvailable(trx, found.shop.id);
            if (wantedCost - previouslyReserved > available) {
                return {
                    success: false,
                    error: `That needs ${wantedCost.toLocaleString()}g reserved and only ${(available + previouslyReserved).toLocaleString()}g is free. Add to the buying fund first.`,
                };
            }

            if (existing) {
                await trx('shop_buy_orders').where({ id: existing.id }).update({
                    quantity_wanted: qty, quantity_filled: 0, unit_price: price, updated_at: new Date(),
                });
            } else {
                await trx('shop_buy_orders').insert({
                    shop_id: found.shop.id, item_id: itemId,
                    quantity_wanted: qty, quantity_filled: 0, unit_price: price,
                });
            }

            return { success: true, message: 'Buy order posted.' };
        });
    } catch (err) {
        logger.error(`createBuyOrder error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

/** Cancelling releases the reservation. The gold stays in the fund. */
export async function cancelBuyOrder(playerId: number, orderId: number): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    const deleted = await db('shop_buy_orders').where({ id: orderId, shop_id: found.shop.id }).delete();
    return deleted
        ? { success: true, message: 'Buy order withdrawn. The gold is back in your fund.' }
        : { success: false, error: 'No such buy order.' };
}

// ── The transactions ────────────────────────────────────────────────────────
//
// Both of these touch TWO players' gold, so both lock the player rows up front
// in ascending id order. Two transactions grabbing the same pair in opposite
// orders deadlock under load, and the trade window shares these same rows. See
// services/gold.ts.

/** A visitor buys from a shop listing. */
export async function buyFromShop(
    buyerId: number, listingId: number, quantity: number,
): Promise<ShopResult & { spent?: number; itemName?: string; shopId?: number }> {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return { success: false, error: 'Invalid quantity.' };

    try {
        return await db.transaction(async (trx) => {
            const listing = await trx('shop_listings')
                .join('player_shops', 'player_shops.id', 'shop_listings.shop_id')
                .join('player_properties', 'player_properties.id', 'player_shops.property_id')
                .join('items', 'items.id', 'shop_listings.item_id')
                .where('shop_listings.id', listingId)
                .select(
                    'shop_listings.*',
                    'player_shops.id as shopId',
                    'player_shops.is_open as isOpen',
                    'player_properties.player_id as ownerId',
                    'player_properties.location_id as locationId',
                    'items.name as itemName',
                )
                .first();

            if (!listing) return { success: false, error: 'That is no longer for sale.' };
            if (!listing.isOpen) return { success: false, error: 'That shop is closed.' };
            if (listing.ownerId === buyerId) return { success: false, error: 'You cannot buy from yourself.' };

            const buyer = await trx('players').where({ id: buyerId }).select('current_location_id').first();
            if (!buyer || buyer.current_location_id !== listing.locationId) {
                return { success: false, error: 'You are not at that shop.' };
            }

            // Re-read under lock. Quantity and price can both have moved since
            // the page rendered, so the numbers on screen are never trusted.
            const locked = await trx('shop_listings').where({ id: listingId }).forUpdate().first();
            if (!locked || Number(locked.quantity) < qty) {
                return { success: false, error: 'There are not that many left.' };
            }

            await lockPlayersInOrder(trx, [buyerId, listing.ownerId]);

            const unitPrice = Number(locked.unit_price);
            const gross = unitPrice * qty;
            const tax = taxOn(gross);

            const paid = await debitGoldWithin(trx, {
                playerId: buyerId, amount: gross, reason: 'shop_purchase',
                refType: 'shop', refId: listing.shopId,
            });
            if (!paid.ok) return { success: false, error: 'You cannot afford that.' };

            await addItemToInventoryWithin(trx, buyerId, locked.item_id, qty);

            if (Number(locked.quantity) === qty) {
                await trx('shop_listings').where({ id: listingId }).delete();
            } else {
                await trx('shop_listings').where({ id: listingId }).decrement('quantity', qty);
            }

            // Takings go to the TILL, not the owner's purse. Deliberately no
            // gold_ledger row here: the ledger's invariant is that its deltas
            // sum to players.gold, and till money is not in that balance yet.
            // Writing one would put reconcileGold() permanently out by the value
            // of every uncollected sale. The owner gets their ledger entry when
            // they collect, as shop_till_withdraw; the sale itself is history in
            // shop_transactions.
            await trx('player_shops').where({ id: listing.shopId }).increment('till_gold', gross - tax);

            await trx('shop_transactions').insert({
                shop_id: listing.shopId, item_id: locked.item_id, direction: 'sale',
                quantity: qty, unit_price: unitPrice, gross, tax, counterparty_player_id: buyerId,
            });

            return {
                success: true, spent: gross, itemName: listing.itemName,
                shopId: listing.shopId as number,
                message: `Bought ${qty.toLocaleString()} ${listing.itemName} for ${gross.toLocaleString()}g.`,
            };
        });
    } catch (err) {
        logger.error(`buyFromShop error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

/** A visitor sells into a shop's standing buy order. Partial fills are normal. */
export async function sellToShop(
    sellerId: number, orderId: number, quantity: number,
): Promise<ShopResult & { earned?: number; itemName?: string; shopId?: number }> {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return { success: false, error: 'Invalid quantity.' };

    try {
        return await db.transaction(async (trx) => {
            const order = await trx('shop_buy_orders')
                .join('player_shops', 'player_shops.id', 'shop_buy_orders.shop_id')
                .join('player_properties', 'player_properties.id', 'player_shops.property_id')
                .join('items', 'items.id', 'shop_buy_orders.item_id')
                .where('shop_buy_orders.id', orderId)
                .select(
                    'shop_buy_orders.*',
                    'player_shops.id as shopId',
                    'player_shops.is_open as isOpen',
                    'player_properties.player_id as ownerId',
                    'player_properties.location_id as locationId',
                    'player_properties.id as propertyId',
                    'player_properties.storage_slots as storageSlots',
                    'items.name as itemName',
                )
                .first();

            if (!order) return { success: false, error: 'That order is gone.' };
            if (!order.isOpen) return { success: false, error: 'That shop is closed.' };
            if (order.ownerId === sellerId) return { success: false, error: 'You cannot sell to yourself.' };

            const seller = await trx('players').where({ id: sellerId }).select('current_location_id').first();
            if (!seller || seller.current_location_id !== order.locationId) {
                return { success: false, error: 'You are not at that shop.' };
            }

            const locked = await trx('shop_buy_orders').where({ id: orderId }).forUpdate().first();
            if (!locked) return { success: false, error: 'That order is gone.' };

            const outstanding = Number(locked.quantity_wanted) - Number(locked.quantity_filled);
            if (outstanding <= 0) return { success: false, error: 'That order is already filled.' };

            // Partial fills: sell what they want, not what you brought.
            const take = Math.min(qty, outstanding);
            const unitPrice = Number(locked.unit_price);
            const gross = unitPrice * take;
            const tax = taxOn(gross);

            await lockPlayersInOrder(trx, [sellerId, order.ownerId]);

            const gave = await removeItemFromInventoryWithin(trx, sellerId, locked.item_id, take);
            if (!gave) return { success: false, error: 'You no longer have that many.' };

            // The fund must still cover it. A withdrawal cannot have taken this
            // gold, but the check is cheap and the alternative is paying from
            // nothing.
            const shop = await trx('player_shops').where({ id: order.shopId }).forUpdate().first();
            if (Number(shop.buy_fund_gold) < gross) {
                return { success: false, error: 'That shop cannot cover the payment right now.' };
            }

            // Goods land in the shop's storage. Full storage stops the sale
            // rather than deleting anything.
            const stored = await trx('property_storage')
                .where({ property_id: order.propertyId, item_id: locked.item_id }).forUpdate().first();
            if (stored) {
                await trx('property_storage').where({ id: stored.id }).increment('quantity', take);
            } else {
                const used = await trx('property_storage').where({ property_id: order.propertyId }).count('* as c').first();
                if (Number(used?.c ?? 0) >= Number(order.storageSlots ?? 0)) {
                    return { success: false, error: 'That shop has no room to store these.' };
                }
                await trx('property_storage').insert({
                    property_id: order.propertyId, item_id: locked.item_id, quantity: take,
                });
            }

            await trx('player_shops').where({ id: order.shopId }).decrement('buy_fund_gold', gross);
            await trx('shop_buy_orders').where({ id: orderId }).increment('quantity_filled', take);

            // The seller is the one being paid, so the seller pays the tithe.
            // Same rule as a shelf sale: the cut comes off takings. This one
            // does go straight to their balance, so it is a real ledger row.
            // The tax itself is recorded on shop_transactions, not as a ledger
            // line, for the same invariant reason as above.
            await creditGoldWithin(trx, {
                playerId: sellerId, amount: gross - tax, reason: 'shop_sale',
                refType: 'shop', refId: order.shopId,
            });

            await trx('shop_transactions').insert({
                shop_id: order.shopId, item_id: locked.item_id, direction: 'purchase',
                quantity: take, unit_price: unitPrice, gross, tax, counterparty_player_id: sellerId,
            });

            const short = take < qty ? ` They only wanted ${outstanding.toLocaleString()}.` : '';
            return {
                success: true, earned: gross - tax, itemName: order.itemName,
                shopId: order.shopId as number,
                message: `Sold ${take.toLocaleString()} ${order.itemName} for ${(gross - tax).toLocaleString()}g.${short}`,
            };
        });
    } catch (err) {
        logger.error(`sellToShop error: ${err}`);
        return { success: false, error: 'Server error' };
    }
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** Every open shopfront at a location. The browse list. */
export async function shopsAtLocation(locationId: number) {
    const rows = await db('player_shops')
        .join('player_properties', 'player_properties.id', 'player_shops.property_id')
        .join('players', 'players.id', 'player_properties.player_id')
        .where('player_properties.location_id', locationId)
        .where('player_properties.type', 'shop')
        .select(
            'player_shops.id as id',
            'player_shops.name as name',
            'player_shops.tagline as tagline',
            'player_shops.is_open as isOpen',
            'players.id as ownerId',
            'players.username as owner',
        )
        .orderBy('player_shops.name');

    // Only whether a shop has ANYTHING, not how much. Exact counts cost a row
    // of space each and tell a browser nothing they will not learn by walking
    // in. Empty is the only state worth flagging.
    const ids = rows.map((r: any) => r.id);
    const stocked = new Set<number>();

    if (ids.length) {
        const l = await db('shop_listings').whereIn('shop_id', ids)
            .where('quantity', '>', 0).distinct('shop_id');
        for (const r of l) stocked.add(Number(r.shop_id));

        const o = await db('shop_buy_orders').whereIn('shop_id', ids)
            .whereRaw('quantity_filled < quantity_wanted').distinct('shop_id');
        for (const r of o) stocked.add(Number(r.shop_id));
    }

    return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        tagline: r.tagline,
        isOpen: Boolean(r.isOpen),
        ownerId: r.ownerId,
        owner: r.owner,
        isEmpty: !stocked.has(r.id),
    }));
}

/**
 * The inside of one shopfront, as a visitor sees it.
 *
 * Buy orders carry how many of that item the visitor is holding, so the
 * "they want 200 Ambren Ore" line can immediately say whether you have any.
 */
export async function shopFront(shopId: number, viewerId: number) {
    const shop = await db('player_shops')
        .join('player_properties', 'player_properties.id', 'player_shops.property_id')
        .join('players', 'players.id', 'player_properties.player_id')
        .where('player_shops.id', shopId)
        .select(
            'player_shops.*',
            'player_properties.location_id as locationId',
            'player_properties.player_id as ownerId',
            'players.username as owner',
        )
        .first();
    if (!shop) return null;

    const listings = await db('shop_listings')
        .join('items', 'items.id', 'shop_listings.item_id')
        .where('shop_listings.shop_id', shopId)
        .where('shop_listings.quantity', '>', 0)
        .select(
            'shop_listings.id as id',
            'shop_listings.item_id as itemId',
            'shop_listings.quantity as quantity',
            'shop_listings.unit_price as unitPrice',
            'items.name as name',
            'items.value as value',
        )
        .orderBy('items.name');

    const orders = await db('shop_buy_orders')
        .join('items', 'items.id', 'shop_buy_orders.item_id')
        .where('shop_buy_orders.shop_id', shopId)
        .whereRaw('shop_buy_orders.quantity_filled < shop_buy_orders.quantity_wanted')
        .select(
            'shop_buy_orders.id as id',
            'shop_buy_orders.item_id as itemId',
            'shop_buy_orders.quantity_wanted as wanted',
            'shop_buy_orders.quantity_filled as filled',
            'shop_buy_orders.unit_price as unitPrice',
            'items.name as name',
            'items.value as value',
        )
        .orderBy('items.name');

    const heldByItem = new Map<number, number>();
    if (orders.length) {
        const held = await db('player_inventory')
            .where({ player_id: viewerId })
            .whereIn('item_id', orders.map((o: any) => o.itemId))
            .select('item_id', 'quantity');
        for (const h of held) heldByItem.set(Number(h.item_id), Number(h.quantity));
    }

    return {
        id: shop.id,
        name: shop.name,
        tagline: shop.tagline,
        description: shop.description,
        isOpen: Boolean(shop.is_open),
        owner: shop.owner,
        ownerId: shop.ownerId,
        locationId: shop.locationId,
        isMine: shop.ownerId === viewerId,
        listings: listings.map((l: any) => ({
            id: l.id, itemId: l.itemId, name: l.name,
            quantity: Number(l.quantity), unitPrice: Number(l.unitPrice),
            value: l.value === null ? null : Number(l.value),
        })),
        buyOrders: orders.map((o: any) => ({
            id: o.id, itemId: o.itemId, name: o.name,
            wanted: Number(o.wanted) - Number(o.filled),
            unitPrice: Number(o.unitPrice),
            value: o.value === null ? null : Number(o.value),
            youHold: heldByItem.get(Number(o.itemId)) ?? 0,
        })),
    };
}

/** The owner's own view: everything above, plus the money and the storage. */
export async function myShop(playerId: number) {
    const found = await shopFor(playerId);
    if (!found) return null;

    const front = await shopFront(found.shop.id, playerId);
    const { fund, reserved, available } = await buyFundAvailable(db, found.shop.id);

    const storedCount = await db('property_storage')
        .where({ property_id: found.property.id }).count('* as c').first();

    return {
        ...front,
        sellSlots: Number(found.shop.sell_slots),
        buySlots: Number(found.shop.buy_slots),
        till: Number(found.shop.till_gold),
        buyFund: fund,
        buyFundReserved: reserved,
        buyFundAvailable: available,
        storageSlots: Number(found.property.storage_slots ?? 0),
        storageUsed: Number(storedCount?.c ?? 0),
        atShop: await isAtOwnShop(playerId),
        taxRate: SALE_TAX_RATE,
    };
}

/** Longest a description may run once tidied. Generous, but finite. */
export const DESCRIPTION_MAX_LINES = 12;

/**
 * Tidy a shop description while KEEPING its line breaks.
 *
 * Line breaks are worth honouring: a price list or a couple of short paragraphs
 * reads far better than one run-on line. But left unbounded, a wall of empty
 * lines is a free way to push everything else off the screen, so runs of blank
 * lines collapse to one and the whole thing is capped.
 */
export function tidyDescription(raw: string | null): string | null {
    if (raw === null || raw === undefined) return null;

    const lines = String(raw)
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd());

    const collapsed: string[] = [];
    for (const line of lines) {
        // At most one blank line in a row.
        if (line.trim() === '' && collapsed[collapsed.length - 1]?.trim() === '') continue;
        collapsed.push(line);
    }

    while (collapsed.length && collapsed[0].trim() === '') collapsed.shift();
    while (collapsed.length && collapsed[collapsed.length - 1].trim() === '') collapsed.pop();

    const text = collapsed.slice(0, DESCRIPTION_MAX_LINES).join('\n').slice(0, 800);
    return text || null;
}

export async function setShopDetails(
    playerId: number, name: string, tagline: string | null, description: string | null,
): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    const clean = String(name ?? '').trim().slice(0, 60);
    if (clean.length < 2) return { success: false, error: 'Give your shop a name.' };

    // The tagline shares a row with the shop name, so it is single-line by
    // force rather than by asking nicely.
    const cleanTagline = tagline === null || tagline === undefined
        ? null
        : String(tagline).replace(/\s+/g, ' ').trim().slice(0, 80) || null;

    await db('player_shops').where({ id: found.shop.id }).update({
        name: clean,
        tagline: cleanTagline,
        description: tidyDescription(description),
        updated_at: new Date(),
    });
    return { success: true, message: 'Shopfront updated.' };
}

export async function setShopOpen(playerId: number, open: boolean): Promise<ShopResult> {
    const found = await shopFor(playerId);
    if (!found) return { success: false, error: 'You have no shop.' };
    if (!(await isAtOwnShop(playerId))) return { success: false, error: 'You must be at your shop.' };

    await db('player_shops').where({ id: found.shop.id }).update({ is_open: open, updated_at: new Date() });
    return { success: true, message: open ? 'Your shop is open.' : 'Your shop is closed.' };
}

/**
 * What has actually happened at a shop, newest first.
 *
 * The whole promise of a shop is that it trades while you are away, which is
 * worth nothing if you come back to a fuller till and no idea what left the
 * shelf. shop_transactions has been recording this since the feature shipped;
 * this is the read.
 */
export async function shopHistory(playerId: number, limit = 50) {
    const found = await shopFor(playerId);
    if (!found) return null;

    const rows = await db('shop_transactions')
        .join('items', 'items.id', 'shop_transactions.item_id')
        .leftJoin('players', 'players.id', 'shop_transactions.counterparty_player_id')
        .where('shop_transactions.shop_id', found.shop.id)
        .orderBy('shop_transactions.created_at', 'desc')
        .limit(Math.min(200, Math.max(1, limit)))
        .select(
            'shop_transactions.id as id',
            'shop_transactions.direction as direction',
            'shop_transactions.quantity as quantity',
            'shop_transactions.unit_price as unitPrice',
            'shop_transactions.gross as gross',
            'shop_transactions.tax as tax',
            'shop_transactions.created_at as at',
            'items.name as name',
            'players.username as counterparty',
        );

    // Lifetime figures, not just the page shown, so the totals mean something
    // once the list is longer than the limit.
    const [sold] = await db('shop_transactions')
        .where({ shop_id: found.shop.id, direction: 'sale' })
        .sum({ gross: 'gross' }).sum({ tax: 'tax' });
    const [bought] = await db('shop_transactions')
        .where({ shop_id: found.shop.id, direction: 'purchase' })
        .sum({ gross: 'gross' });

    return {
        entries: rows.map((r: any) => ({
            id: r.id,
            direction: r.direction as 'sale' | 'purchase',
            name: r.name,
            quantity: Number(r.quantity),
            unitPrice: Number(r.unitPrice),
            gross: Number(r.gross),
            tax: Number(r.tax),
            net: Number(r.gross) - Number(r.tax),
            counterparty: r.counterparty ?? null,
            at: new Date(r.at).toISOString(),
        })),
        totals: {
            earned: Number(sold?.gross ?? 0) - Number(sold?.tax ?? 0),
            tithed: Number(sold?.tax ?? 0),
            spent: Number(bought?.gross ?? 0),
        },
    };
}

// ── Knowing your shop traded ────────────────────────────────────────────────

/** How long a shop stays quiet after telling an online owner it traded. */
export const NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Trades the owner has not looked at yet.
 *
 * Counted against last_seen_at rather than stored as a counter, so it is always
 * correct and there is no state to fall out of step. Opening History is what
 * clears it.
 */
export async function unseenTrades(playerId: number): Promise<{ count: number; gold: number } | null> {
    const found = await shopFor(playerId);
    if (!found) return null;

    const since = found.shop.last_seen_at ?? new Date(0);
    const rows = await db('shop_transactions')
        .where('shop_id', found.shop.id)
        .where('created_at', '>', since)
        .select('direction', 'gross', 'tax');

    // Net movement in the owner's favour: a sale earns, filling a buy order
    // spends. One number that answers "was I up or down while I was away".
    const gold = rows.reduce((sum: number, r: any) => sum + (
        r.direction === 'sale' ? Number(r.gross) - Number(r.tax) : -Number(r.gross)
    ), 0);

    return { count: rows.length, gold };
}

export async function markTradesSeen(playerId: number): Promise<void> {
    const found = await shopFor(playerId);
    if (!found) return;
    await db('player_shops').where({ id: found.shop.id }).update({ last_seen_at: new Date() });
}

/**
 * Tell an online owner their shop did something, at most once every few
 * minutes. Called after a trade commits.
 *
 * Deliberately vague and deliberately rare: the exact figures live in History,
 * and a line per sale would make a busy shop unusable to be logged in beside.
 * Silently does nothing if the shop spoke recently.
 */
export async function notifyOwnerOfTrade(shopId: number): Promise<void> {
    try {
        const shop = await db('player_shops').where({ id: shopId }).first();
        if (!shop) return;

        const last = shop.last_notified_at ? new Date(shop.last_notified_at).getTime() : 0;
        if (Date.now() - last < NOTIFY_COOLDOWN_MS) return;

        const property = await db('player_properties').where({ id: shop.property_id }).first();
        if (!property) return;

        await db('player_shops').where({ id: shopId }).update({ last_notified_at: new Date() });

        const { io } = await import('../index');
        io.to(`player_${property.player_id}`).emit('shop_traded', {
            shopName: shop.name,
            message: 'Somebody has been trading at your shop.',
        });
    } catch (err) {
        // A notification is never worth failing a sale over.
        logger.error(`notifyOwnerOfTrade error: ${err}`);
    }
}
