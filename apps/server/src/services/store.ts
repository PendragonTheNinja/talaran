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
        description: 'Paint your own Talaran: a full palette editor, every premium theme included, and the ability to share your palettes with fellow customizers.',
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
export async function purchaseItem(playerId: number, itemKey: string): Promise<
    { ok: true; balance: number; granted: string[] } |
    { ok: false; error: string; balance: number }
> {
    const item = STORE_ITEMS.find(i => i.key === itemKey);
    if (!item || !item.available) {
        return { ok: false, error: 'That item is not available.', balance: await getTalerBalance(playerId) };
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
