import db from '../db';
import { logger } from '../lib/logger';
import { gameDayKey } from '../lib/gameTime';

// Taiar Marketplace (docs/marketplace-spec.md §3).
//
// This module owns the two price walls and nothing else touches them. Every
// number a merchant quotes comes from here.
//
//   NPC sells to player at 175% of value.
//   Themed merchant buys from player at 45%. Pawnbroker at 35%.
//
// Because the buy rate sits far below the sell rate, buying from a merchant to
// sell back to one always loses money. That is structural, not a balance tuning
// choice, and validateWalls() below proves it stays that way.

export const WALLS = {
    SELL_MULTIPLIER: 1.75,
    BUY_RATE: 0.45,
    PAWN_BUY_RATE: 0.35,
} as const;

// Step-down bands. The last rate repeats forever.
export const STEP_RATES = [1.0, 0.75, 0.5, 0.25] as const;

// One band is roughly an hour's worth of an item's value. Deriving the
// allowance from value rather than listing it per item means anything added
// later gets a sensible allowance with no hand-tuning.
export const ALLOWANCE_GOLD = 500;
export const ALLOWANCE_MIN = 5;
export const ALLOWANCE_MAX = 500;

export function dailyAllowance(value: number): number {
    if (!value || value <= 0) return ALLOWANCE_MIN;
    return Math.min(ALLOWANCE_MAX, Math.max(ALLOWANCE_MIN, Math.ceil(ALLOWANCE_GOLD / value)));
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** What a player pays a merchant for one unit. Always strictly above value. */
export function buyPrice(value: number): number {
    return Math.max(1, Math.ceil(value * WALLS.SELL_MULTIPLIER));
}

export interface SaleBand {
    quantity: number;
    rate: number;      // step multiplier, 1.0 / 0.75 / 0.5 / 0.25
    gold: number;      // gold for THIS band
}

export interface SaleQuote {
    total: number;
    bands: SaleBand[];
    steppedDown: boolean;      // true if any band is below full rate
    unitAtFullRate: number;    // headline "worth X each" figure
    allowance: number;
    soldToday: number;
}

/**
 * Price a sale of `quantity` units, accounting for what the player has already
 * sold of this item today.
 *
 * Gold is computed PER BAND at lot level, not per unit. Per-unit integer
 * rounding breaks the floor at the bottom of the price range: a 1g item at 45%
 * floors to 0, gets clamped to 1 to avoid paying nothing, and so sells at 100%
 * of value with no step-down at all. Lot-level arithmetic keeps the wall honest
 * for cheap items, which are exactly the ones sold in bulk.
 */
export function quoteSale(params: {
    value: number;
    baseRate: number;
    quantity: number;
    soldToday: number;
}): SaleQuote {
    const { value, baseRate, quantity, soldToday } = params;
    const allowance = dailyAllowance(value);

    const bands: SaleBand[] = [];
    let remaining = Math.max(0, Math.floor(quantity));
    let position = Math.max(0, Math.floor(soldToday));

    while (remaining > 0) {
        const bandIndex = Math.min(Math.floor(position / allowance), STEP_RATES.length - 1);
        const rate = STEP_RATES[bandIndex];

        // How many units before this band ends. The final band never ends.
        const roomInBand = bandIndex === STEP_RATES.length - 1
            ? remaining
            : (bandIndex + 1) * allowance - position;

        const take = Math.min(remaining, Math.max(1, roomInBand));
        const gold = Math.floor(take * value * baseRate * rate);

        const last = bands[bands.length - 1];
        if (last && last.rate === rate) {
            last.quantity += take;
            last.gold += gold;
        } else {
            bands.push({ quantity: take, rate, gold });
        }

        remaining -= take;
        position += take;
    }

    // A sale never pays nothing. Rounding can zero out a tiny lot of cheap
    // items, and handing back 0g for real goods reads as theft.
    const rawTotal = bands.reduce((sum, b) => sum + b.gold, 0);
    const total = quantity > 0 ? Math.max(1, rawTotal) : 0;

    return {
        total,
        bands,
        steppedDown: bands.some((b) => b.rate < 1),
        unitAtFullRate: Math.max(1, Math.floor(value * baseRate)),
        allowance,
        soldToday,
    };
}

// ---------------------------------------------------------------------------
// Merchant domains: which merchant buys what
// ---------------------------------------------------------------------------

export type MerchantKey = 'smith' | 'carpenter' | 'leatherworker' | 'provisioner' | 'pawnbroker';

// Grouped by the chain that PRODUCES the item, not what it is made of. A
// hatchet has a wooden handle and is still the smith's business.
//
// Anything unmatched falls to the pawnbroker, which is what guarantees no item
// is ever unsellable. That fallback is safe but silent, so unmappedItems()
// exists to surface drift the moment new content lands.
const TYPE_DOMAINS: Partial<Record<string, MerchantKey>> = {
    ore: 'smith',
    ingot: 'smith',
    rock: 'smith',
    gem: 'smith',
    fuel: 'smith',
    ammo: 'smith',
    log: 'carpenter',
    plank: 'carpenter',
    // The leatherworker sells boots, so he had better buy them back. A merchant
    // who stocks a thing but will not take it is just confusing.
    armor: 'leatherworker',
    food: 'provisioner',
    animal: 'provisioner',
};

const TOOL_SUBTYPE_DOMAINS: Partial<Record<string, MerchantKey>> = {
    pickaxe: 'smith', axe: 'smith', hammer: 'smith', tongs: 'smith', anvil: 'smith',
    saw: 'smith', plane: 'smith', hoe: 'smith', fork: 'smith', butcher_knife: 'smith',
    foraging_knife: 'smith',
    mallet: 'carpenter', sawhorse: 'carpenter', staff: 'carpenter', bow: 'carpenter',
    bucket: 'carpenter', pail: 'carpenter', trap: 'carpenter',
    tanning_rack: 'carpenter', tanning_barrel: 'carpenter', foraging_basket: 'carpenter',
    halter: 'leatherworker', foraging_gloves: 'leatherworker',
};

const MATERIAL_SUBTYPE_DOMAINS: Partial<Record<string, MerchantKey>> = {
    hide: 'leatherworker', leather: 'leatherworker', bones: 'leatherworker',
    feather: 'leatherworker', cloth: 'leatherworker', fiber: 'leatherworker',
    bark: 'carpenter', shaft: 'carpenter', tool_rod: 'carpenter', reed: 'carpenter',
    stone: 'smith', component: 'smith',
    herb: 'provisioner', berry: 'provisioner', flower: 'provisioner', mushroom: 'provisioner',
    fungus: 'provisioner', nut: 'provisioner', root: 'provisioner', seed: 'provisioner',
    grain: 'provisioner', produce: 'provisioner', foodstuff: 'provisioner',
    fodder: 'provisioner', fertiliser: 'provisioner', reagent: 'provisioner',
    liquid: 'provisioner',
    // 'trophy' is deliberately absent: trophies are 1/300 keepsakes and belong
    // to the pawnbroker, who at least gives them a floor without a themed
    // merchant implying they are ordinary stock.
};

export function merchantForItem(item: { type?: string | null; subtype?: string | null }): MerchantKey {
    const type = item.type ?? '';
    const subtype = item.subtype ?? '';

    if (type === 'tool' && TOOL_SUBTYPE_DOMAINS[subtype]) return TOOL_SUBTYPE_DOMAINS[subtype]!;
    if (type === 'material' && MATERIAL_SUBTYPE_DOMAINS[subtype]) return MATERIAL_SUBTYPE_DOMAINS[subtype]!;
    if (TYPE_DOMAINS[type]) return TYPE_DOMAINS[type]!;
    return 'pawnbroker';
}

/** Buy rate a given merchant pays. */
export function buyRateFor(merchantKey: MerchantKey, itemMerchant: MerchantKey): number | null {
    if (merchantKey === 'pawnbroker') return WALLS.PAWN_BUY_RATE;
    return merchantKey === itemMerchant ? WALLS.BUY_RATE : null;  // null = "not my trade"
}

/**
 * Every priced item that no themed merchant claims. Should be short and
 * intentional (trophies, curios). If a whole new skill's output appears here,
 * the domain map needs a line. Surfaced in admin.
 */
export async function unmappedItems(): Promise<Array<{ id: number; name: string; type: string; subtype: string | null }>> {
    const items = await db('items')
        .whereNotNull('value')
        .where({ is_active: true })
        .select('id', 'name', 'type', 'subtype');

    return items.filter((i: any) => merchantForItem(i) === 'pawnbroker');
}

// ---------------------------------------------------------------------------
// Daily stock rotation
// ---------------------------------------------------------------------------

/**
 * Deterministic PRNG seeded from a string. The seed is the Eastern day key plus
 * the merchant key, so today's shop is identical on every request and survives
 * a pm2 restart. Math.random() here would reshuffle the shelves mid-afternoon
 * whenever the process bounced.
 */
function seededRandom(seed: string): () => number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return function next(): number {
        h += 0x6d2b79f5;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const ROTATING_LINES_MIN = 3;
export const ROTATING_LINES_MAX = 5;

export interface StockLine {
    itemId: number;
    name: string;
    icon: string | null;
    value: number;
    price: number;        // per unit, at the 175% wall
    dailyLimit: number;   // units this player may buy today
    bought: number;       // units already bought today
    remaining: number;
    isCore: boolean;
}

/**
 * Today's shelf for one merchant, for one player.
 *
 * Core lines are always present, which is what makes tools breaking survivable:
 * a player whose only pickaxe snaps can always replace it, even on a day the
 * rotation favours something else.
 */
export async function getStock(merchantId: number, playerId: number, now: Date = new Date()): Promise<StockLine[]> {
    const dayKey = gameDayKey(now);

    const merchant = await db('merchants').where({ id: merchantId }).first();
    if (!merchant || !merchant.sells) return [];

    const rows = await db('merchant_stock')
        .join('items', 'items.id', 'merchant_stock.item_id')
        .where('merchant_stock.merchant_id', merchantId)
        .where('merchant_stock.is_active', true)
        .where('items.is_active', true)
        .whereNotNull('items.value')
        .select(
            'items.id as itemId',
            'items.name as name',
            'items.icon as icon',
            'items.value as value',
            'merchant_stock.is_core as isCore',
            'merchant_stock.min_qty as minQty',
            'merchant_stock.max_qty as maxQty',
        );

    const core = rows.filter((r: any) => r.isCore);
    const pool = rows.filter((r: any) => !r.isCore);

    const rand = seededRandom(`${dayKey}:${merchant.key}`);

    // Shuffle the pool with the seeded generator, then take today's slice.
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const lineCount = ROTATING_LINES_MIN + Math.floor(rand() * (ROTATING_LINES_MAX - ROTATING_LINES_MIN + 1));
    const rotating = shuffled.slice(0, lineCount);

    const selected = [...core, ...rotating];
    if (selected.length === 0) return [];

    const bought = await db('npc_purchase_daily')
        .where({ player_id: playerId, purchase_date: dayKey })
        .whereIn('item_id', selected.map((r: any) => r.itemId))
        .select('item_id', 'units_bought');

    const boughtBy = new Map<number, number>(bought.map((b: any) => [b.item_id, Number(b.units_bought)]));

    return selected.map((r: any) => {
        const value = Number(r.value);
        // Rolled per item per day, so a line's stock is stable all day too.
        const perItemRand = seededRandom(`${dayKey}:${merchant.key}:${r.itemId}`);
        const dailyLimit = r.minQty + Math.floor(perItemRand() * (r.maxQty - r.minQty + 1));
        const alreadyBought = boughtBy.get(r.itemId) ?? 0;

        return {
            itemId: r.itemId,
            name: r.name,
            icon: r.icon ?? null,
            value,
            price: buyPrice(value),
            dailyLimit,
            bought: alreadyBought,
            remaining: Math.max(0, dailyLimit - alreadyBought),
            isCore: Boolean(r.isCore),
        };
    });
}

// ---------------------------------------------------------------------------
// Daily counters
// ---------------------------------------------------------------------------

export async function getSoldToday(playerId: number, itemId: number, now: Date = new Date()): Promise<number> {
    const row = await db('npc_sale_daily')
        .where({ player_id: playerId, item_id: itemId, sale_date: gameDayKey(now) })
        .first();
    return Number(row?.units_sold ?? 0);
}

/** Upsert inside the caller's transaction. Never call this outside one. */
export async function recordSaleWithin(trx: any, playerId: number, itemId: number, units: number, now: Date = new Date()): Promise<void> {
    await trx('npc_sale_daily')
        .insert({ player_id: playerId, item_id: itemId, sale_date: gameDayKey(now), units_sold: units })
        .onConflict(['player_id', 'item_id', 'sale_date'])
        .merge({ units_sold: trx.raw('npc_sale_daily.units_sold + ?', [units]) });
}

export async function recordPurchaseWithin(trx: any, playerId: number, itemId: number, units: number, now: Date = new Date()): Promise<void> {
    await trx('npc_purchase_daily')
        .insert({ player_id: playerId, item_id: itemId, purchase_date: gameDayKey(now), units_bought: units })
        .onConflict(['player_id', 'item_id', 'purchase_date'])
        .merge({ units_bought: trx.raw('npc_purchase_daily.units_bought + ?', [units]) });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Prove the walls cannot be farmed: for every priced item, what a merchant
 * charges must exceed what any merchant pays, at every step rate. Structurally
 * guaranteed while SELL_MULTIPLIER > BUY_RATE, but content and constants both
 * change, and a silent inversion is a money printer.
 */
export async function validateWalls(): Promise<string[]> {
    const problems: string[] = [];
    const items = await db('items').whereNotNull('value').where({ is_active: true }).select('id', 'name', 'value');

    for (const item of items) {
        const value = Number(item.value);
        if (value <= 0) {
            problems.push(`${item.name} (#${item.id}) has a non-positive value of ${value}.`);
            continue;
        }
        const charged = buyPrice(value);
        const paid = quoteSale({ value, baseRate: WALLS.BUY_RATE, quantity: 1, soldToday: 0 }).total;
        if (paid >= charged) {
            problems.push(`${item.name} (#${item.id}): merchant pays ${paid}g but charges ${charged}g. Arbitrage.`);
        }
    }

    if (problems.length) logger.warn(`[marketplace] wall validation found ${problems.length} problems`);
    return problems;
}
