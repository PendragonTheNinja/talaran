import db from '../db';
import { logger } from '../lib/logger';
import { getTalerBalance, spendTalersWithin } from './talers';

// Cosmetic store (docs/support-spec.md §4). Catalog is code, not DB — theme
// palettes live client-side in CSS and ownership lives in player_unlocks, so
// a store item is just a key, a price, and what it grants.
//
// Buying an item you partly own charges full price but only grants what's
// missing — so the UI should surface bundle-vs-owned math; the server's job
// is refusing full duplicates and keeping unlock+debit atomic.

export interface StoreItem {
    key: string;                // purchase key, e.g. 'theme:moonveil', 'bundle:themes'
    name: string;
    description: string;
    price: number;              // Talers (bundles: price for the full set)
    grants: string[];           // unlock_keys granted
    available: boolean;         // coming-soon items render but can't be bought
    perMissingPricing?: boolean; // bundles: charge (price / grants) x missing, so
                                 // partial owners complete the set at the bundle rate
    onSale?: SaleWindow;        // seasonal: sold only inside this window each year.
                                 // What was bought is kept for good; only buying ends.
}

/**
 * A yearly sale window, both days inclusive, as 'MM-DD' in UTC (one clock for
 * every player, wherever they are). A window may cross the new year
 * ('12-20' to '01-02').
 */
export interface SaleWindow {
    from: string;
    until: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const monthDay = (d: Date) => `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** When the sale that is open at `now` closes, or null if none is open. */
export function saleEndsAt(window: SaleWindow, now: Date): Date | null {
    const today = monthDay(now);
    const wraps = window.from > window.until;
    const open = wraps
        ? today >= window.from || today <= window.until
        : today >= window.from && today <= window.until;
    if (!open) return null;
    // The closing day belongs to this year, or to next year when the window
    // crosses the new year and we are still on its December side.
    const year = now.getUTCFullYear() + (wraps && today >= window.from ? 1 : 0);
    const [m, d] = window.until.split('-').map(Number);
    return new Date(Date.UTC(year, m - 1, d + 1));   // midnight after the last day
}

/** Can this item be bought at `now`? Seasonal items only inside their window. */
export function onSaleNow(item: StoreItem, now: Date = new Date()): boolean {
    if (!item.available) return false;
    return !item.onSale || saleEndsAt(item.onSale, now) !== null;
}

/** Every theme the store sells, by id ('moonveil', ...): the list the theme
 *  setting checks ownership against, so a new theme is added in one place. */
export function premiumThemeIds(): string[] {
    const ids = STORE_ITEMS.flatMap(i => i.grants)
        .filter(g => g.startsWith('theme:'))
        .map(g => g.slice('theme:'.length));
    return [...new Set(ids)];
}

/** What this player actually pays for an item right now. */
export function effectivePrice(item: StoreItem, owned: string[]): number {
    if (!item.perMissingPricing) return item.price;
    const missing = item.grants.filter(g => !owned.includes(g)).length;
    return Math.round(item.price / item.grants.length) * missing;
}

export const STORE_ITEMS: StoreItem[] = [
    {
        key: 'theme:moonveil',
        name: 'Moonveil',
        description: 'Cold slate and silver — Talaran under a winter moon.',
        price: 300,
        grants: ['theme:moonveil'],
        available: true,
    },
    {
        key: 'theme:mosswood',
        name: 'Mosswood',
        description: 'Deep forest greens and lantern amber, far beneath the canopy.',
        price: 300,
        grants: ['theme:mosswood'],
        available: true,
    },
    {
        key: 'theme:forgeheart',
        name: 'Forgeheart',
        description: 'Coal-black iron and living ember — the smithy after dark.',
        price: 300,
        grants: ['theme:forgeheart'],
        available: true,
    },
    {
        // Halloween. Sold the week before and on the day itself; never part of
        // the bundle or the palette perk, which would make it a year-round buy.
        key: 'theme:hallowtide',
        name: 'Hallowtide',
        description: 'Pumpkin lanterns and bone-white candles in the last nights of October.',
        price: 300,
        grants: ['theme:hallowtide'],
        available: true,
        onSale: { from: '10-24', until: '10-31' },
    },
    {
        key: 'bundle:themes',
        name: 'Theme Bundle',
        description: 'All three premium themes together — Moonveil, Mosswood, and Forgeheart.',
        price: 750,
        grants: ['theme:moonveil', 'theme:mosswood', 'theme:forgeheart'],
        available: true,
        perMissingPricing: true,
    },
    {
        key: 'perk:custom_palette',
        name: 'Custom Palettes',
        description: 'Paint your own Talaran: a full palette editor, the three year-round premium themes, and the ability to share your palettes with fellow customizers.',
        price: 1500,
        grants: ['perk:custom_palette', 'theme:moonveil', 'theme:mosswood', 'theme:forgeheart'],
        available: true,
    },
];

export async function getUnlocks(playerId: number): Promise<string[]> {
    const rows = await db('player_unlocks').where({ player_id: playerId }).pluck('unlock_key');
    return rows.map(String);
}

export function hasUnlock(unlocks: string[], key: string): boolean {
    return unlocks.includes(key);
}

/**
 * Purchase a store item: one transaction covering the balance check, the
 * debit, and every granted unlock. Refuses if everything is already owned.
 */
export async function purchaseItem(playerId: number, itemKey: string, now: Date = new Date()): Promise<
    { ok: true; balance: number; granted: string[] } |
    { ok: false; error: string; balance: number }
> {
    const item = STORE_ITEMS.find(i => i.key === itemKey);
    if (!item || !item.available) {
        return { ok: false, error: 'That item is not available.', balance: await getTalerBalance(playerId) };
    }
    if (!onSaleNow(item, now)) {
        return { ok: false, error: 'That is not on sale right now.', balance: await getTalerBalance(playerId) };
    }

    const result: { error?: string; granted?: string[] } = await db.transaction(async (trx) => {
        const player = await trx('players').where({ id: playerId }).forUpdate().first();
        if (!player) return { error: 'Player not found.' as const };

        const owned: string[] = (await trx('player_unlocks').where({ player_id: playerId }).pluck('unlock_key')).map(String);
        const missing = item.grants.filter(g => !owned.includes(g));
        if (missing.length === 0) return { error: 'You already own this.' as const };

        const paid = await spendTalersWithin(trx, {
            playerId,
            amount: effectivePrice(item, owned),
            reason: 'unlock',
            refType: 'store_item',
        });
        if (!paid) return { error: 'Not enough Talers.' as const };

        for (const key of missing) {
            await trx('player_unlocks').insert({ player_id: playerId, unlock_key: key });
        }
        return { granted: missing };
    });

    const balance = await getTalerBalance(playerId);
    if (result.error) return { ok: false, error: result.error, balance };
    const granted = result.granted ?? [];
    logger.info(`[store] player ${playerId} bought ${itemKey}, granted: ${granted.join(', ')}`);
    return { ok: true, balance, granted };
}
