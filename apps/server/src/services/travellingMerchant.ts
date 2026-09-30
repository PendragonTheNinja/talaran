import type { Knex } from 'knex';
import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { buyPrice } from './marketplace';
import { debitGoldWithin, getGold } from './gold';
import { addItemToInventoryWithin, notifyInventoryChanged } from './inventory';
import { logSubtypeFor } from './woodcutting';
import { rockSubtypeFor, veinOresAt } from './mining';
import { eventsChanged } from './worldEvents';
import { announceServer } from './records';

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

/** The places he can visit: open, and with something to sell. */
export async function merchantPlaces(): Promise<{ id: number; name: string }[]> {
    const places = await db('locations').where({ is_accessible: true }).select('id', 'name');
    const out = [];
    for (const p of places) if ((await locationYields(p.id)).length) out.push(p);
    return out;
}

// ── His cart ──────────────────────────────────────────────────────────────

interface StockPlan { itemId: number; quantity: number; price: number }

const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (Math.max(hi, lo) - lo + 1));

/**
 * What he brings to a place: up to `lines` of its yields, each about
 * `lineGold` worth of value (so a cheap log comes by the armful and an ore by
 * the handful), plus whatever from the extras list turns up this time.
 */
async function planStock(locationId: number, settings: any): Promise<StockPlan[]> {
    const yields = await locationYields(locationId);
    for (let i = yields.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [yields[i], yields[j]] = [yields[j], yields[i]];
    }
    const plan = new Map<number, StockPlan>();
    for (const y of yields.slice(0, settings.merchant_lines)) {
        const quantity = Math.max(1, Math.min(999, Math.round(settings.merchant_line_gold / y.value * (0.7 + Math.random() * 0.6))));
        plan.set(y.id, { itemId: y.id, quantity, price: buyPrice(y.value) });
    }

    const extras = await db('merchant_extra_goods as x')
        .join('items as i', 'i.id', 'x.item_id')
        .where('x.is_active', true).where('i.is_active', true).where('i.value', '>', 0)
        .select('x.item_id', 'x.chance_percent', 'x.min_qty', 'x.max_qty', 'i.value');
    for (const x of extras) {
        if (Math.random() * 100 >= x.chance_percent) continue;
        const quantity = between(x.min_qty, x.max_qty);
        const had = plan.get(x.item_id);
        if (had) had.quantity += quantity;
        else plan.set(x.item_id, { itemId: x.item_id, quantity, price: buyPrice(Number(x.value)) });
    }
    return [...plan.values()];
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

    const plan = await planStock(location.id, settings);
    if (!plan.length) throw new MerchantRefusal(`${location.name} yields nothing he could carry, and nothing from the extras list turned up.`);

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
        return event;
    });

    await eventsChanged();
    await announceServer(eventId.announcement);
    logger.info(`[merchant] at ${location.name} for ${stay} min: ${plan.length} lines, ${units} units${opts.startedBy ? ` (summoned by player ${opts.startedBy})` : ''}`);
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
        await db('world_event_settings').where({ id: 1 }).update({ merchant_next_at: at });
        return;
    }
    if (new Date(settings.merchant_next_at).getTime() > Date.now()) return;
    if (await liveVisit()) return;

    try {
        await summonMerchant();
    } catch (err) {
        if (err instanceof MerchantRefusal) logger.warn(`[merchant] could not come: ${err.message}`);
        else throw err;
    }
    await db('world_event_settings').where({ id: 1 }).update({ merchant_next_at: new Date(Date.now() + everyMs) });
}

// ── Trading with him ──────────────────────────────────────────────────────

export interface MerchantLine { itemId: number; name: string; value: number; price: number; left: number; total: number }

/** His cart where the player stands, or null when he is not here. */
export async function merchantHere(playerId: number): Promise<{ eventId: number; location: string; endsAt: string; stock: MerchantLine[]; gold: number } | null> {
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
        gold: await getGold(playerId),
    };
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
