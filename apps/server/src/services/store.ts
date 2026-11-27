import db from '../db';
import { logger } from '../lib/logger';
import { pushToPlayer } from '../lib/realtime';
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
    /**
     * Bought as often as wanted, each one used up (a name change): applied by
     * CONSUMABLES inside the purchase's transaction instead of an unlock row.
     */
    consumable?: boolean;
}

/** What buying a consumable does, inside the purchase's transaction. */
const CONSUMABLES: Record<string, (trx: any, playerId: number) => Promise<void>> = {
    // One name change, used in Settings > Profile (services/nameChange.ts).
    'token:name_change': async (trx, playerId) => {
        await trx('players').where({ id: playerId }).increment('name_change_tokens', 1);
    },
};

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

/** The look a player has until they choose another (Nathan, 2026-11-04: Stonehold,
 *  the mockup art, over Tavern). The client's DEFAULT_THEME in lib/theme.ts
 *  must match; the column default is set by migration 20261104100000. */
export const DEFAULT_THEME = 'stonehold';

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
        // Christmas (Nathan, 2026-11-27). Sold through December, like
        // Hallowtide in October; kept for good once bought.
        key: 'theme:yuletide',
        name: 'Yuletide',
        description: 'Holly red and pine green by candlelight, with snow on the sill.',
        price: 300,
        grants: ['theme:yuletide'],
        available: true,
        onSale: { from: '12-01', until: '12-31' },
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
    {
        // The timer bell's own sound (client lib/bell.ts). The file stays on
        // the player's device and is never uploaded: only they hear it, so
        // there is nothing to moderate or back up. The perk is what is sold.
        key: 'perk:custom_sound',
        name: 'Custom Sound',
        description: 'Ring the timer bell with a sound of your own: a short clip of up to three seconds, kept on your device.',
        price: 500,
        grants: ['perk:custom_sound'],
        available: true,
    },
];

/**
 * Supporter titles (docs/taler-perks-ideas.md): worn like a feat's title,
 * bought rather than earned. The unlock key is what is owned; the words are
 * what is worn (players.worn_title), checked against this list by wearTitle.
 */
export const STORE_TITLES: { key: string; title: string; blurb: string }[] = [
    { key: 'title:the-generous', title: 'the Generous', blurb: 'For those who give, and say little about it.' },
    { key: 'title:the-lamplighter', title: 'the Lamplighter', blurb: 'For those who keep a light burning for the rest.' },
    { key: 'title:the-openhanded', title: 'the Openhanded', blurb: 'For a full purse held with an open palm.' },
    { key: 'title:the-steadfast', title: 'the Steadfast', blurb: 'For those who stayed, through the alpha and after.' },
]

for (const t of STORE_TITLES) {
    STORE_ITEMS.push({
        key: t.key,
        name: `Title: ${t.title}`,
        description: `${t.blurb} Worn beside your name like a feat's title, chosen in your Feats.`,
        price: 300,
        grants: [t.key],
        available: true,
    })
}

/** The supporter titles this player owns, as worn words. */
export function ownedStoreTitles(unlocks: string[]): string[] {
    return STORE_TITLES.filter(t => unlocks.includes(t.key)).map(t => t.title)
}

STORE_ITEMS.push({
    key: 'perk:name_color',
    name: 'Name Color',
    description: 'Your name in a color of your choosing, in chat and among the folk standing about: ember, holly, sea, heather, frost, moss, rose, or amber.',
    price: 400,
    grants: ['perk:name_color'],
    available: true,
})

STORE_ITEMS.push({
    key: 'token:name_change',
    name: 'Name Change',
    description: 'Go by a new name. Everyone has one change for free; this is one more. Your old name shows on your profile for a month, and a change waits a month after the last.',
    price: 500,
    grants: [],
    available: true,
    consumable: true,
})

export async function getUnlocks(playerId: number): Promise<string[]> {
    const rows = await db('player_unlocks').where({ player_id: playerId }).pluck('unlock_key');
    return rows.map(String);
}

export function hasUnlock(unlocks: string[], key: string): boolean {
    return unlocks.includes(key);
}

/**
 * One purchase inside a transaction that has locked both rows: the payer's
 * Talers, the recipient's unlocks (the same player, or a friend for a gift).
 * Refuses, by throwing nothing and returning an error, before anything is
 * written; returns the talers paid and what was granted.
 */
async function buyWithin(trx: any, payerId: number, recipientId: number, item: StoreItem, gift: boolean):
    Promise<{ error: string } | { granted: string[]; paid: number }> {
    const owned: string[] = (await trx('player_unlocks').where({ player_id: recipientId }).pluck('unlock_key')).map(String);
    if (item.consumable) {
        const apply = CONSUMABLES[item.key];
        if (!apply) return { error: 'That item is not available.' };
        const paid = await spendTalersWithin(trx, { playerId: payerId, amount: item.price, reason: gift ? 'gift' : 'consumable', refType: 'store_item' });
        if (!paid) return { error: 'Not enough Talers.' };
        await apply(trx, recipientId);
        return { granted: [item.key], paid: item.price };
    }
    const missing = item.grants.filter(g => !owned.includes(g));
    if (missing.length === 0) return { error: gift ? 'They already own that.' : 'You already own this.' };
    const price = effectivePrice(item, owned);
    const paid = await spendTalersWithin(trx, { playerId: payerId, amount: price, reason: gift ? 'gift' : 'unlock', refType: 'store_item' });
    if (!paid) return { error: 'Not enough Talers.' };
    for (const key of missing) {
        await trx('player_unlocks').insert({ player_id: recipientId, unlock_key: key });
    }
    return { granted: missing, paid: price };
}

function sellable(itemKey: string, now: Date): { item: StoreItem } | { error: string } {
    const item = STORE_ITEMS.find(i => i.key === itemKey);
    if (!item || !item.available) return { error: 'That item is not available.' };
    if (!onSaleNow(item, now)) return { error: 'That is not on sale right now.' };
    return { item };
}

/**
 * Purchase a store item: one transaction covering the balance check, the
 * debit, and every granted unlock. Refuses if everything is already owned.
 */
export async function purchaseItem(playerId: number, itemKey: string, now: Date = new Date()): Promise<
    { ok: true; balance: number; granted: string[] } |
    { ok: false; error: string; balance: number }
> {
    const found = sellable(itemKey, now);
    if ('error' in found) return { ok: false, error: found.error, balance: await getTalerBalance(playerId) };

    const result = await db.transaction(async (trx) => {
        const player = await trx('players').where({ id: playerId }).forUpdate().first();
        if (!player) return { error: 'Player not found.' };
        return buyWithin(trx, playerId, playerId, found.item, false);
    });

    const balance = await getTalerBalance(playerId);
    if ('error' in result) return { ok: false, error: result.error, balance };
    logger.info(`[store] player ${playerId} bought ${itemKey}, granted: ${result.granted.join(', ')}`);
    return { ok: true, balance, granted: result.granted };
}

/**
 * Buy a store item for someone else (docs/taler-perks-ideas.md; Nathan,
 * 2026-11-27). Never Talers or gold, and nothing a gift grants can be traded
 * on. Both players are locked in ascending id order, as two players' gold
 * always is (services/gold.ts lockPlayersInOrder), so two gifts crossing
 * cannot deadlock. The recipient is told when it commits.
 */
export async function giftItem(fromId: number, toName: unknown, itemKey: string, now: Date = new Date()): Promise<
    { ok: true; balance: number; to: string } | { ok: false; error: string; balance: number }
> {
    const balance = async () => getTalerBalance(fromId);
    const found = sellable(itemKey, now);
    if ('error' in found) return { ok: false, error: found.error, balance: await balance() };
    if (typeof toName !== 'string' || !toName.trim()) return { ok: false, error: 'Name who it is for.', balance: await balance() };
    const to = await db('players').whereRaw('LOWER(username) = LOWER(?)', [toName.trim()]).first('id', 'username', 'is_guest');
    if (!to) return { ok: false, error: 'Nobody goes by that name.', balance: await balance() };
    if (to.id === fromId) return { ok: false, error: 'Buy it for yourself from the store as usual.', balance: await balance() };
    if (to.is_guest) return { ok: false, error: 'They have not claimed their account yet.', balance: await balance() };

    const result = await db.transaction(async (trx) => {
        for (const id of [fromId, to.id].sort((a, b) => a - b)) await trx('players').where({ id }).forUpdate().first('id');
        const bought = await buyWithin(trx, fromId, to.id, found.item, true);
        if ('error' in bought) return bought;
        await trx('store_gifts').insert({ from_player_id: fromId, to_player_id: to.id, item_key: itemKey, talers: bought.paid });
        return bought;
    });
    if ('error' in result) return { ok: false, error: result.error, balance: await balance() };

    const giver = await db('players').where({ id: fromId }).first('username');
    pushToPlayer(to.id, 'store_gift', { from: giver?.username ?? 'Someone', item: found.item.name });
    logger.info(`[store] player ${fromId} gave ${itemKey} to player ${to.id}`);
    return { ok: true, balance: await balance(), to: to.username };
}

/**
 * Name colors (perk:name_color): a short list chosen to read on every theme,
 * dark and light (index.css .name-color-*). None of them is the gold a name
 * is by default, and none passes for staff.
 */
export const NAME_COLORS = ['ember', 'holly', 'sea', 'heather', 'frost', 'moss', 'rose', 'amber'] as const

/** Choose a name color, or none. Only for the perk's owners, and only from the list. */
export async function setNameColor(playerId: number, color: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
    if (color !== null && !(NAME_COLORS as readonly string[]).includes(String(color))) return { ok: false, error: 'Choose one of the colors.' };
    if (color !== null && !hasUnlock(await getUnlocks(playerId), 'perk:name_color')) return { ok: false, error: 'Name colors are a supporter perk.' };
    await db('players').where({ id: playerId }).update({ name_color: color });
    return { ok: true };
}
