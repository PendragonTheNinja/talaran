import type { Knex } from 'knex';
import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { buyPrice } from './marketplace';
import { debitGoldWithin, creditGoldWithin, getGold } from './gold';
import { addItemToInventoryWithin, takeItemsWithin, notifyInventoryChanged } from './inventory';
import { logSubtypeFor } from './woodcutting';
import { rockSubtypeFor, veinOresAt } from './mining';
import { eventsChanged } from './worldEvents';
import { announceServer } from './records';
import { noteDeed } from './chronicle';
import { isLiquid } from './liquids';

// The Travelling Merchant (docs/WORLD-EVENTS-AND-MUSEUMS.md, step 3).
//
// Once a week, at a random place, for a day. He sells what that place yields,
// read from the game's own data with the same rules the skills use, so his
// stock needs no upkeep and a new tree or fishing spot is in his cart the day
// it is added. The admin's extras list can add anything on top.
//
// A visit is a world_events row of kind 'merchant' (the countdown, admin
// controls and history come with it). Its pool is his goods: pool_total every
// unit he brought, pool_left what is unsold, so the history's "paid out" reads
// as units sold, and he leaves early when he sells out.
//
// His stock is shared by the whole server. Buying is one conditional
// decrement inside the transaction that takes the gold, so two players never
// both buy the last one (race:check 'merchant').

export const MERCHANT_NAME = 'The Travelling Merchant';

const SCHEDULER_BUFFER_MS = 60_000;

// ── What a place yields ───────────────────────────────────────────────────

export interface YieldItem { id: number; name: string; value: number }

const parseTable = (raw: unknown): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { const t = JSON.parse(raw); return Array.isArray(t) ? t : []; } catch { return []; } }
    return [];
};

/**
 * Every priced item a place's own work gives: its trees' logs, its rocks and
 * the ores its veins can be, its fish, and what its hedgerows and game give.
 * Rare finds (a drop marked notable: an antler, a Squonk's tear) are left
 * out: those are for finding, and the extras list is how a rare thing is sold
 * on purpose. Salvage is not fish.
 */
export async function locationYields(locationId: number): Promise<YieldItem[]> {
    const byName = new Set<string>();
    const byId = new Set<number>();

    const nodes = await db('resource_nodes').where({ location_id: locationId, is_active: true });
    for (const n of nodes) {
        const skill = String(n.skill ?? '').toLowerCase();
        if (skill === 'woodcutting') {
            const qualities = [
                Number(n.poor_chance) > 0 ? 'poor' : null,
                Number(n.fine_chance) > 0 ? 'fine' : null,
                Number(n.excellent_chance) > 0 ? 'excellent' : null,
            ].filter((q): q is string => q !== null);
            const logs = await db('items').where({ type: 'log', subtype: logSubtypeFor(n.name) })
                .whereIn('quality', qualities).select('id');
            for (const l of logs) byId.add(l.id);
        } else if (skill === 'mining') {
            const subtype = rockSubtypeFor(n);
            const rock = subtype ? await db('items').where({ type: 'rock', subtype }).first() : null;
            if (rock) byId.add(rock.id);
        }
    }
    for (const ore of await veinOresAt(locationId)) byId.add(ore.id);

    const fish = await db('fish_species').where({ location_id: locationId, kind: 'fish', is_active: true }).select('item_name');
    for (const f of fish) if (f.item_name) byName.add(f.item_name);

    const tables = [
        ...await db('foraging_habitats').where({ location_id: locationId, is_active: true }).select('drop_table'),
        ...await db('huntable_animals').where({ location_id: locationId, is_active: true }).select('drop_table'),
        ...await db('trap_targets').where({ location_id: locationId, is_active: true }).select('drop_table'),
    ];
    for (const t of tables) {
        for (const d of parseTable(t.drop_table)) {
            if (d?.itemName && d.notable !== true) byName.add(String(d.itemName));
        }
    }

    if (!byName.size && !byId.size) return [];
    const rows = await db('items')
        .where({ is_active: true })
        .where('value', '>', 0)
        .where((q) => {
            q.whereIn('name', [...byName]);
            if (byId.size) q.orWhereIn('id', [...byId]);
        })
        .orderBy('name')
        .select('id', 'name', 'value');
    return rows.map((r: any) => ({ id: r.id, name: r.name, value: Number(r.value) }));
}

/**
 * Where his next visit will be, chosen when it is set (Chronicle step 5): a
 * rumour of his sail names it, so it has to be decided ahead. Null when
 * nowhere will do.
 */
async function nextPlace(): Promise<number | null> {
    const places = await merchantPlaces();
    return places.length ? places[Math.floor(Math.random() * places.length)].id : null;
}

/** The places he can visit: open, and with something to sell. */
export async function merchantPlaces(): Promise<{ id: number; name: string }[]> {
    const places = await db('locations').where({ is_accessible: true }).select('id', 'name');
    const out = [];
    for (const p of places) if ((await locationYields(p.id)).length) out.push(p);
    return out;
}

// ── His cart ──────────────────────────────────────────────────────────────
//
// What he sells (Nathan, 2026-11-08): what is NOT lying about where he stands.
// Seeds, gems, cooked food and provisions, and worked goods (planks, ingots,
// leather, cloth, anything a bench or a fire makes), drawn at random each visit
// so his cart is never the same twice. Never a tool or a piece of gear, never
// a raw gathered good (a log, an ore, a fish), which anyone can fetch for
// themselves. Now and then one lit gem, dear. He buys too: a few wanted lines.

interface StockPlan { itemId: number; quantity: number; price: number }
interface WantPlan { itemId: number; quantity: number; price: number; playerCap: number }

const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (Math.max(hi, lo) - lo + 1));

function shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

/** Charged gems (a filled stone): sold only as the rare line, never as ordinary stock. */
const CHARGED_QUALITIES = ['lit', 'bright', 'radiant'];

interface Good { id: number; name: string; value: number; type: string | null; subtype: string | null; quality: string | null; tier: number }

/** Every priced, ordinary good: no tools, no gear, no animals, no curios, nothing poured. */
async function ordinaryGoods(): Promise<Good[]> {
    const rows = await db('items')
        .where({ is_active: true }).where('value', '>', 0)
        .whereNull('slot')
        .where((q) => q.whereNull('type').orWhereNotIn('type', ['tool', 'mount', 'animal', 'curio', 'collectible']))
        .select('id', 'name', 'value', 'type', 'subtype', 'quality', 'tier');
    return rows
        .filter((r: any) => !isLiquid(r.name))
        .map((r: any) => ({ id: r.id, name: r.name, value: Number(r.value), type: r.type, subtype: r.subtype, quality: r.quality, tier: Number(r.tier) || 1 }));
}

/** What a bench, a fire or a vat makes: every recipe's outputs, planks and ingots. */
async function workedGoodIds(): Promise<{ all: Set<number>; cooked: Set<number> }> {
    const recipes = await db('recipes').where({ is_active: true })
        .select('skill', 'output_item_name', 'byproduct_item_name', 'grade_outputs');
    const names = new Set<string>();
    const cookedNames = new Set<string>();
    for (const r of recipes) {
        const outs = [r.output_item_name, r.byproduct_item_name, ...parseTable(r.grade_outputs)].filter(Boolean).map(String);
        for (const n of outs) {
            names.add(n);
            if (r.skill === 'Cooking') cookedNames.add(n);
        }
    }
    const rows = await db('items')
        .where((q) => {
            q.whereIn('type', ['plank', 'ingot']);
            if (names.size) q.orWhereIn('name', [...names]);
        })
        .select('id', 'name');
    return {
        all: new Set(rows.map((r: any) => r.id)),
        cooked: new Set(rows.filter((r: any) => cookedNames.has(r.name)).map((r: any) => r.id)),
    };
}

/** Everything gathered raw anywhere on the island: what he will not sell, and some of what he wants. */
async function islandYieldIds(): Promise<Set<number>> {
    const places = await db('locations').where({ is_accessible: true }).select('id');
    const ids = new Set<number>();
    for (const p of places) for (const y of await locationYields(p.id)) ids.add(y.id);
    return ids;
}

/** A line's size: about `lineGold` of value, so cheap goods come by the armful and dear ones by the handful. */
function lineQuantity(lineGold: number, unitValue: number): number {
    return Math.max(1, Math.min(999, Math.round(lineGold / unitValue * (0.7 + Math.random() * 0.6))));
}

/** What a wanted line pays: a share of value, always below what any merchant charges for it. */
export function wantPrice(value: number, rate: number): number {
    return Math.max(1, Math.min(buyPrice(value) - 1, Math.floor(value * rate)));
}

async function planVisit(settings: any): Promise<{ stock: StockPlan[]; wants: WantPlan[] }> {
    const [goods, worked, raw] = await Promise.all([ordinaryGoods(), workedGoodIds(), islandYieldIds()]);

    // His wares, by kind, so one visit is not all seeds.
    const seeds: Good[] = [];
    const gems: Good[] = [];
    const food: Good[] = [];
    const wares: Good[] = [];
    const charged: Good[] = [];
    for (const g of goods) {
        if (g.quality && CHARGED_QUALITIES.includes(g.quality)) charged.push(g);
        else if (g.subtype === 'seed') seeds.push(g);
        else if (g.type === 'gem') gems.push(g);
        else if (raw.has(g.id)) continue;
        else if (worked.cooked.has(g.id)) food.push(g);
        else if (worked.all.has(g.id)) wares.push(g);
    }
    const kinds = [seeds, gems, food, wares].map(shuffle).filter((k) => k.length);
    const picked: Good[] = [];
    for (let round = 0; picked.length < settings.merchant_lines && kinds.some((k) => k.length); round++) {
        for (const k of shuffle([...kinds])) {
            if (picked.length >= settings.merchant_lines) break;
            const next = k.shift();
            if (next) picked.push(next);
        }
    }

    const stock = new Map<number, StockPlan>();
    for (const g of picked) {
        stock.set(g.id, { itemId: g.id, quantity: lineQuantity(settings.merchant_line_gold, buyPrice(g.value)), price: buyPrice(g.value) });
    }

    // Now and then a single lit gem, dear: the plainest grades most often.
    if (charged.length && Math.random() * 100 < Number(settings.merchant_lit_gem_chance ?? 0)) {
        const lowest = Math.min(...charged.map((g) => g.tier));
        const weight = (g: Good) => ({ lit: 3, bright: 2, radiant: 1 } as Record<string, number>)[g.quality ?? ''] ?? 1;
        const pool = charged.filter((g) => g.tier === lowest);
        let roll = Math.random() * pool.reduce((n, g) => n + weight(g), 0);
        const gem = pool.find((g) => (roll -= weight(g)) <= 0) ?? pool[0];
        stock.set(gem.id, { itemId: gem.id, quantity: 1, price: Math.ceil(buyPrice(gem.value) * Number(settings.merchant_lit_gem_markup ?? 3)) });
    }

    // The admin's extras list, on top.
    const extras = await db('merchant_extra_goods as x')
        .join('items as i', 'i.id', 'x.item_id')
        .where('x.is_active', true).where('i.is_active', true).where('i.value', '>', 0)
        .select('x.item_id', 'x.chance_percent', 'x.min_qty', 'x.max_qty', 'i.value');
    for (const x of extras) {
        if (Math.random() * 100 >= x.chance_percent) continue;
        const quantity = between(x.min_qty, x.max_qty);
        const had = stock.get(x.item_id);
        if (had) had.quantity += quantity;
        else stock.set(x.item_id, { itemId: x.item_id, quantity, price: buyPrice(Number(x.value)) });
    }

    // What he wants: raw goods from anywhere on the island and worked goods,
    // never what he is selling this visit, never a gem or anything rare.
    const wantable = shuffle(goods.filter((g) =>
        !stock.has(g.id)
        && !(g.quality && CHARGED_QUALITIES.includes(g.quality))
        && g.type !== 'gem'
        && (raw.has(g.id) || worked.all.has(g.id))));
    const wants: WantPlan[] = wantable.slice(0, Math.max(0, Number(settings.merchant_want_lines ?? 0))).map((g) => {
        const price = wantPrice(g.value, Number(settings.merchant_want_rate));
        const quantity = lineQuantity(settings.merchant_line_gold, price);
        return { itemId: g.id, quantity, price, playerCap: Math.max(1, Math.ceil(quantity * Number(settings.merchant_want_share))) };
    });

    return { stock: [...stock.values()], wants };
}

// ── His visits ────────────────────────────────────────────────────────────

async function merchantSettings(x: Knex | Knex.Transaction = db): Promise<any> {
    return x('world_event_settings').where({ id: 1 }).first();
}

/** The visit under way, if any. There is only ever one merchant. */
export async function liveVisit(x: Knex | Knex.Transaction = db): Promise<any | null> {
    return (await x('world_events')
        .where({ kind: 'merchant' }).whereNull('ended_at').where('ends_at', '>', x.fn.now())
        .first()) ?? null;
}

export interface SummonOptions {
    /** Leave out for a random place with something to sell. */
    locationId?: number
    stayMinutes?: number
    /** Null when the scheduler brings him; the admin's player id otherwise. */
    startedBy?: number | null
}

export class MerchantRefusal extends Error {}

/**
 * Bring him now: roll his cart, open the visit, and say so in chat. Refused if
 * he is already somewhere, or the place has nothing he could carry.
 */
export async function summonMerchant(opts: SummonOptions = {}): Promise<{ eventId: number; location: string; lines: number }> {
    const settings = await merchantSettings();
    if (await liveVisit()) throw new MerchantRefusal(`${MERCHANT_NAME} is already out on the road. End that visit first.`);

    let location: { id: number; name: string } | undefined;
    if (opts.locationId) {
        location = await db('locations').where({ id: opts.locationId }).select('id', 'name').first();
        if (!location) throw new MerchantRefusal('That location does not exist.');
    } else {
        const places = await merchantPlaces();
        if (!places.length) throw new MerchantRefusal('Nowhere on the island yields anything he could carry.');
        location = places[Math.floor(Math.random() * places.length)];
    }

    const { stock: plan, wants } = await planVisit(settings);
    if (!plan.length) throw new MerchantRefusal('There is nothing on the island he could carry.');

    const stay = opts.stayMinutes ?? settings.merchant_stay_minutes;
    const units = plan.reduce((n, p) => n + p.quantity, 0);
    const eventId = await db.transaction(async (trx) => {
        const [event] = await trx('world_events').insert({
            type_id: null,
            name: MERCHANT_NAME,
            kind: 'merchant',
            skill: null,
            location_id: location!.id,
            xp_multiplier: 1,
            pool_total: units,
            pool_left: units,
            ends_at: new Date(Date.now() + stay * 60_000),
            started_by: opts.startedBy ?? null,
            announcement: String(settings.merchant_arrival_text).replace(/\{location\}/g, location!.name),
        }).returning(['id', 'announcement']);
        await trx('world_event_stock').insert(plan.map((p) => ({
            event_id: event.id, item_id: p.itemId, quantity_total: p.quantity, quantity_left: p.quantity, price: p.price,
        })));
        if (wants.length) {
            await trx('world_event_wants').insert(wants.map((w) => ({
                event_id: event.id, item_id: w.itemId, quantity_total: w.quantity, quantity_left: w.quantity,
                price: w.price, player_cap: w.playerCap,
            })));
        }
        return event;
    });

    await eventsChanged();
    await announceServer(eventId.announcement);
    noteDeed(db, { kind: 'merchant_arrived', subject: location.name, data: { place: location.name, lines: plan.length } });
    logger.info(`[merchant] at ${location.name} for ${stay} min: ${plan.length} lines, ${units} units, ${wants.length} wanted${opts.startedBy ? ` (summoned by player ${opts.startedBy})` : ''}`);
    return { eventId: eventId.id, location: location.name, lines: plan.length };
}

/**
 * Called by the events scheduler each minute. When he is due and not already
 * out, he comes, and his next visit is set one interval on. A missed day (the
 * server was down, or nowhere had stock) simply means he comes at the next
 * minute that works.
 */
export async function merchantSchedulerTick(): Promise<void> {
    const settings = await merchantSettings();
    if (!settings?.merchant_enabled) return;
    const everyMs = settings.merchant_every_days * 24 * 60 * 60_000;

    if (!settings.merchant_next_at) {
        // First run: somewhere in the coming interval, not at a known time.
        const at = new Date(Date.now() + SCHEDULER_BUFFER_MS + Math.floor(Math.random() * everyMs));
        await db('world_event_settings').where({ id: 1 }).update({ merchant_next_at: at, merchant_next_location_id: await nextPlace() });
        return;
    }
    if (new Date(settings.merchant_next_at).getTime() > Date.now()) return;
    if (await liveVisit()) return;

    try {
        // Where he was said to be going (a rumour may have told of it), else anywhere.
        const planned = settings.merchant_next_location_id
            && (await merchantPlaces()).some((p) => p.id === settings.merchant_next_location_id)
            ? settings.merchant_next_location_id : undefined;
        await summonMerchant({ locationId: planned });
    } catch (err) {
        if (err instanceof MerchantRefusal) logger.warn(`[merchant] could not come: ${err.message}`);
        else throw err;
    }
    await db('world_event_settings').where({ id: 1 }).update({
        merchant_next_at: new Date(Date.now() + everyMs),
        merchant_next_location_id: await nextPlace(),
    });
}

// ── Trading with him ──────────────────────────────────────────────────────

export interface MerchantLine { itemId: number; name: string; value: number; price: number; left: number; total: number }

/** A good he is buying: what he pays, what he still wants, and this player's share of it. */
export interface MerchantWant {
    itemId: number; name: string; price: number; left: number; total: number
    /** How many this player may still sell him (their cap less what they have sold). */
    yourRoom: number
    /** How many the player carries. */
    have: number
}

/** His cart where the player stands, or null when he is not here. */
export async function merchantHere(playerId: number): Promise<{ eventId: number; location: string; endsAt: string; stock: MerchantLine[]; wants: MerchantWant[]; gold: number } | null> {
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    const visit = await liveVisit();
    if (!visit || !player || visit.location_id !== player.current_location_id) return null;
    const location = await db('locations').where({ id: visit.location_id }).select('name').first();
    const stock = await db('world_event_stock as s').join('items as i', 'i.id', 's.item_id')
        .where('s.event_id', visit.id).orderBy('i.name')
        .select('s.item_id', 'i.name', 'i.value', 's.price', 's.quantity_left', 's.quantity_total');
    return {
        eventId: visit.id,
        location: location?.name ?? '',
        endsAt: visit.ends_at,
        stock: stock.map((s: any) => ({
            itemId: s.item_id, name: s.name, value: Number(s.value), price: s.price,
            left: s.quantity_left, total: s.quantity_total,
        })),
        wants: await wantsFor(visit.id, playerId),
        gold: await getGold(playerId),
    };
}

async function wantsFor(eventId: number, playerId: number): Promise<MerchantWant[]> {
    const rows = await db('world_event_wants as w').join('items as i', 'i.id', 'w.item_id')
        .leftJoin('world_event_want_sales as s', function () {
            this.on('s.event_id', 'w.event_id').andOn('s.item_id', 'w.item_id').andOn('s.player_id', db.raw('?', [playerId]));
        })
        .leftJoin('player_inventory as pi', function () {
            this.on('pi.item_id', 'w.item_id').andOn('pi.player_id', db.raw('?', [playerId]));
        })
        .where('w.event_id', eventId).orderBy('i.name')
        .select('w.item_id', 'i.name', 'w.price', 'w.quantity_left', 'w.quantity_total', 'w.player_cap',
            db.raw('COALESCE(s.quantity, 0) as sold'), db.raw('COALESCE(pi.quantity, 0) as have'));
    return rows.map((r: any) => ({
        itemId: r.item_id, name: r.name, price: r.price, left: r.quantity_left, total: r.quantity_total,
        yourRoom: Math.max(0, r.player_cap - Number(r.sold)), have: Number(r.have),
    }));
}

/** A refusal inside the buy: thrown so the transaction rolls back, answered in words. */
class BuyAbort extends Error {}

/**
 * Buy from his cart. The client sends the price it showed; a different price
 * is refused rather than charged. Presence is checked here, against the visit
 * row, so it holds however the call arrives.
 */
export async function buyFromMerchant(
    playerId: number,
    req: { eventId: unknown; itemId: unknown; quantity: unknown; price: unknown },
): Promise<{ ok: true; bought: number; name: string; cost: number; gold: number } | { error: string }> {
    const quantity = Math.floor(Number(req.quantity));
    const eventId = Math.floor(Number(req.eventId));
    const itemId = Math.floor(Number(req.itemId));
    const shownPrice = Math.floor(Number(req.price));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return { error: 'Invalid quantity.' };
    if (!Number.isFinite(eventId) || !Number.isFinite(itemId) || !Number.isFinite(shownPrice)) return { error: 'That is not for sale.' };

    try {
        return await db.transaction(async (trx) => {
            const player = await trx('players').where({ id: playerId }).select('current_location_id').first();
            // Locked, so an admin ending the visit or the last unit selling
            // cannot land between this check and the sale.
            const visit = await trx('world_events').where({ id: eventId, kind: 'merchant' })
                .whereNull('ended_at').where('ends_at', '>', trx.fn.now()).forUpdate().first();
            if (!visit) throw new BuyAbort(`${MERCHANT_NAME} has moved on.`);
            if (!player || player.current_location_id !== visit.location_id) throw new BuyAbort(`${MERCHANT_NAME} is not here.`);

            const line = await trx('world_event_stock as s').join('items as i', 'i.id', 's.item_id')
                .where({ 's.event_id': eventId, 's.item_id': itemId }).select('s.price', 'i.name').first();
            if (!line) throw new BuyAbort('He has none of that.');
            if (line.price !== shownPrice) throw new BuyAbort('His price has changed. Look again.');

            // The gate: take the goods only if that many are still in the
            // cart, in one statement against the row as it stands.
            const [taken] = await trx('world_event_stock')
                .where({ event_id: eventId, item_id: itemId })
                .where('quantity_left', '>=', quantity)
                .decrement('quantity_left', quantity)
                .returning(['quantity_left']);
            if (!taken) {
                const now = await trx('world_event_stock').where({ event_id: eventId, item_id: itemId }).first();
                throw new BuyAbort(now?.quantity_left ? `He has only ${now.quantity_left} left.` : `He has sold all his ${line.name}.`);
            }

            const cost = line.price * quantity;
            const paid = await debitGoldWithin(trx, {
                playerId, amount: cost, reason: 'npc_purchase', refType: 'world_event', refId: eventId,
            });
            if (!paid.ok) throw new BuyAbort('You cannot afford that.');

            await addItemToInventoryWithin(trx, playerId, itemId, quantity);

            const [pool] = await trx('world_events').where({ id: eventId })
                .decrement('pool_left', quantity).returning(['pool_left']);
            if (Number(pool.pool_left) === 0) {
                await trx('world_events').where({ id: eventId }).update({ ended_at: trx.fn.now(), end_reason: 'pool' });
            }
            return { ok: true as const, bought: quantity, name: line.name, cost, gold: paid.balance, soldOut: Number(pool.pool_left) === 0 };
        }).then(async (r) => {
            notifyInventoryChanged(playerId);
            if (r.soldOut) await eventsChanged();
            const { soldOut: _soldOut, ...answer } = r;
            return answer;
        });
    } catch (err) {
        if (err instanceof BuyAbort) return { error: err.message };
        logger.error(`[merchant] buy failed for player ${playerId}: ${err}`);
        return { error: SERVER_ERROR };
    }
}

// ── Selling to him ────────────────────────────────────────────────────────

/** A refusal inside the sale: thrown so the transaction rolls back, answered in words. */
class SellAbort extends Error {}

/**
 * Sell him something he wants. Capped twice, both in the database: what he
 * still wants of it (a conditional decrement), and this player's share of it
 * for the visit (a conditional upsert). The goods, the gold and both counts
 * move in one transaction (race:check 'merchant').
 */
export async function sellToMerchant(
    playerId: number,
    req: { eventId: unknown; itemId: unknown; quantity: unknown; price: unknown },
): Promise<{ ok: true; sold: number; name: string; earned: number; gold: number } | { error: string }> {
    const quantity = Math.floor(Number(req.quantity));
    const eventId = Math.floor(Number(req.eventId));
    const itemId = Math.floor(Number(req.itemId));
    const shownPrice = Math.floor(Number(req.price));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return { error: 'Invalid quantity.' };
    if (!Number.isFinite(eventId) || !Number.isFinite(itemId) || !Number.isFinite(shownPrice)) return { error: 'He is not buying that.' };

    try {
        const r = await db.transaction(async (trx) => {
            const player = await trx('players').where({ id: playerId }).select('current_location_id').first();
            const visit = await trx('world_events').where({ id: eventId, kind: 'merchant' })
                .whereNull('ended_at').where('ends_at', '>', trx.fn.now()).forUpdate().first();
            if (!visit) throw new SellAbort(`${MERCHANT_NAME} has moved on.`);
            if (!player || player.current_location_id !== visit.location_id) throw new SellAbort(`${MERCHANT_NAME} is not here.`);

            const want = await trx('world_event_wants as w').join('items as i', 'i.id', 'w.item_id')
                .where({ 'w.event_id': eventId, 'w.item_id': itemId })
                .select('w.price', 'w.player_cap', 'i.name').first();
            if (!want) throw new SellAbort('He is not buying that.');
            if (want.price !== shownPrice) throw new SellAbort('His price has changed. Look again.');
            if (quantity > want.player_cap) throw new SellAbort(`He will take no more than ${want.player_cap} of those from you.`);

            // Your share: added only while it stays within your cap.
            const [mine] = await trx('world_event_want_sales')
                .insert({ event_id: eventId, player_id: playerId, item_id: itemId, quantity })
                .onConflict(['event_id', 'player_id', 'item_id'])
                .merge({ quantity: trx.raw('world_event_want_sales.quantity + ?', [quantity]) })
                .where('world_event_want_sales.quantity', '<=', want.player_cap - quantity)
                .returning(['quantity']);
            if (!mine) {
                const had = await trx('world_event_want_sales').where({ event_id: eventId, player_id: playerId, item_id: itemId }).first();
                const room = Math.max(0, want.player_cap - Number(had?.quantity ?? 0));
                throw new SellAbort(room ? `He will take only ${room} more of those from you.` : `He has had all the ${want.name} he will take from you.`);
            }

            // What he still wants, in one statement against the row as it stands.
            const [left] = await trx('world_event_wants')
                .where({ event_id: eventId, item_id: itemId })
                .where('quantity_left', '>=', quantity)
                .decrement('quantity_left', quantity)
                .returning(['quantity_left']);
            if (!left) {
                const now = await trx('world_event_wants').where({ event_id: eventId, item_id: itemId }).first();
                throw new SellAbort(now?.quantity_left ? `He wants only ${now.quantity_left} more.` : `He has all the ${want.name} he wants.`);
            }

            const took = await takeItemsWithin(trx, playerId, [{ name: want.name, quantity }]);
            if (!took.ok) throw new SellAbort(`You do not have ${quantity} ${want.name}.`);

            const earned = want.price * quantity;
            const gold = await creditGoldWithin(trx, {
                playerId, amount: earned, reason: 'npc_sale', refType: 'world_event', refId: eventId,
            });
            return { ok: true as const, sold: quantity, name: want.name as string, earned, gold };
        });
        notifyInventoryChanged(playerId);
        return r;
    } catch (err) {
        if (err instanceof SellAbort) return { error: err.message };
        logger.error(`[merchant] sell failed for player ${playerId}: ${err}`);
        return { error: SERVER_ERROR };
    }
}
