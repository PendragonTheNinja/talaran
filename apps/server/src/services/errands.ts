import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { addItemToInventoryWithin, takeItemsWithin } from './inventory';
import { creditGoldWithin } from './gold';
import { awardXp } from './xp';
import { gameDayKey } from '../lib/gameTime';
import { listWords } from '../lib/listWords';

// ── Errands (the Friddik Brothers; Nathan, 2026-11-22) ─────────────────────
//
// Repeatable timed deliveries between NPCs who will not go themselves. An
// errand (`errands`) is a line of one or more legs: each leg hands the player
// an item from one NPC to carry to another before the time runs out. Every
// NPC in an errand pool (`npcs.errand_pool`) offers one at random from the
// lines that start with them; finishing one, the player may take another.
//
// Each leg's time is worked out when it is handed over, from the shortest
// road between the two NPCs' places at a new walker's pace (ERRAND_SLACK
// over it, plus ERRAND_GRACE_SECONDS for the clicking), so it stays fair
// if the map changes. Lateness never fails an errand: it is kept, leg by leg
// (`errand_log`), and the one receiving says something different on time,
// late, or very late. A late leg forfeits the reward (Nathan, 2026-11-22)
// and ends the errand there, with no next leg (Nathan, 2026-11-25).
//
// One open errand a player (`player_errands`, keyed by player). Handing over
// is one transaction: the player's row, then their errand row, both locked;
// the item taken; the leg moved on or the errand closed, paid if never late.

export const ERRAND_SLACK = 1.5;
export const ERRAND_GRACE_SECONDS = 90;
/**
 * Pay wanders this far either side of the errand's own figures, so one
 * errand is not every errand (Nathan, 2026-11-25): 80 gold pays 70 to 90.
 */
export const ERRAND_PAY_SPREAD = 0.125;
/** Past the limit by more than the limit itself is very late. */
const VERY_LATE_FACTOR = 1;

interface Leg {
    from: string; to: string; item: string
    /**
     * Brought, not handed over (Nathan, 2026-11-25): the player supplies this
     * many of an everyday item (eggs, feathers) from their own pack, and the
     * one receiving keeps them. Nothing is given out, so nothing can be kept
     * by giving the errand up; the goods are paid for at their value.
     */
    supply?: number
    offer: string[]; waiting: string[]
    on_time: string[]; late: string[]; very_late: string[]
}

/** Extra time on a leg whose goods the player must fetch first. */
export const SUPPLY_FETCH_SECONDS = 900;

/** How many of the leg's item the receiver wants. */
const wanted = (leg: Leg) => Math.max(1, Math.floor(Number(leg.supply ?? 1)));
/** "Egg ×6", or just "Matthew's Pie" for one. */
const goods = (leg: Leg) => wanted(leg) > 1 ? `${leg.item} ×${wanted(leg)}` : leg.item;
interface Errand { id: number; key: string; name: string; pool: string; legs: Leg[]; reward_gold: number; reward_skill: string | null; reward_xp: number }

class ErrandAbort extends Error {}

function asErrand(row: any): Errand {
    const legs = typeof row.legs === 'string' ? JSON.parse(row.legs) : row.legs;
    return { ...row, legs: Array.isArray(legs) ? legs : [], reward_gold: Number(row.reward_gold ?? 0), reward_xp: Number(row.reward_xp ?? 0) };
}

/** "6 minutes", "1 minute", "45 seconds". */
export function spokenTime(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    if (s < 90) return `${s} seconds`;
    const m = Math.round(s / 60);
    return m === 1 ? '1 minute' : `${m} minutes`;
}

/** Lateness to the minute and second: "4 minutes and 12 seconds", "1 minute", "40 seconds". */
export function spokenLate(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60), r = s % 60;
    const mins = m === 1 ? '1 minute' : `${m} minutes`, secs = r === 1 ? '1 second' : `${r} seconds`;
    if (m === 0) return secs;
    return r === 0 ? mins : `${mins} and ${secs}`;
}

const say = (lines: string[], vars: Record<string, string>) =>
    lines.map(l => l.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`));

/** A small stable hash, so the errand a brother offers is fixed, not chosen by asking again. */
function pick(n: number, seed: string): number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h) % n;
}

/** Where an NPC stands, for telling the player where to go: "Matthew Friddik is in Dawncrest." */
async function whereIs(x: any, name: string): Promise<string> {
    const r = await x('npcs as n').join('locations as l', 'l.id', 'n.location_id').where('n.name', name).first('l.name');
    return r ? `(${name} is in ${r.name}.)` : '';
}

/** A figure, wandered by ERRAND_PAY_SPREAD either side. */
function wander(amount: number): number {
    if (amount <= 0) return 0;
    return Math.max(1, Math.round(amount * (1 - ERRAND_PAY_SPREAD + Math.random() * 2 * ERRAND_PAY_SPREAD)));
}

/** The shortest road between two places, in base seconds, over land (no ferry or sea). */
async function roadSeconds(x: any, fromId: number, toId: number): Promise<number | null> {
    if (fromId === toId) return 0;
    const rows = await x('location_connections').whereNotIn(x.raw("coalesce(travel_type, '')"), ['ferry', 'sea'])
        .select('from_location_id', 'to_location_id', 'base_travel_time', 'is_bidirectional');
    const graph = new Map<number, { to: number; s: number }[]>();
    const add = (a: number, b: number, s: number) => { if (!graph.has(a)) graph.set(a, []); graph.get(a)!.push({ to: b, s }); };
    for (const r of rows) {
        add(Number(r.from_location_id), Number(r.to_location_id), Number(r.base_travel_time));
        if (r.is_bidirectional) add(Number(r.to_location_id), Number(r.from_location_id), Number(r.base_travel_time));
    }
    const dist = new Map<number, number>([[fromId, 0]]);
    const open = new Set<number>([fromId]);
    while (open.size) {
        let u = -1, best = Infinity;
        for (const n of open) { const d = dist.get(n)!; if (d < best) { best = d; u = n; } }
        open.delete(u);
        if (u === toId) return best;
        for (const e of graph.get(u) ?? []) {
            const d = best + e.s;
            if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); open.add(e.to); }
        }
    }
    return null;
}

async function npcPlace(x: any, name: string): Promise<number> {
    const npc = await x('npcs').where({ name }).first('location_id');
    if (!npc) throw new ErrandAbort(`There is nobody called ${name}.`);
    return Number(npc.location_id);
}

/** The time allowed for a leg, in seconds. */
async function legLimit(x: any, leg: Leg): Promise<number> {
    const road = await roadSeconds(x, await npcPlace(x, leg.from), await npcPlace(x, leg.to));
    return Math.round((road ?? 600) * ERRAND_SLACK + ERRAND_GRACE_SECONDS + (leg.supply ? SUPPLY_FETCH_SECONDS : 0));
}

async function openErrand(x: any, playerId: number, lock = false) {
    const q = x('player_errands').where({ player_id: playerId });
    const row = await (lock ? q.forUpdate() : q).first();
    if (!row) return null;
    const errand = await x('errands').where({ id: row.errand_id }).first();
    if (!errand) return null;
    const e = asErrand(errand);
    return { row, errand: e, leg: e.legs[Number(row.leg)] as Leg | undefined };
}

async function carries(x: any, playerId: number, itemName: string, quantity = 1): Promise<boolean> {
    const r = await x('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
        .where({ 'pi.player_id': playerId, 'i.name': itemName }).sum({ q: 'pi.quantity' }).first();
    return Number(r?.q ?? 0) >= quantity;
}

// ── What an errand NPC says and offers ──────────────────────────────────────

export interface ErrandTalk { lines: string[]; options: { label: string; next_stage: string | null; action: string | null }[] }

/** Has this player carried for this pool before? Then a brother does not introduce himself again. */
async function hasCarriedFor(x: any, playerId: number, pool: string): Promise<boolean> {
    const r = await x('errand_log as g').join('errands as e', 'e.id', 'g.errand_id')
        .where({ 'g.player_id': playerId, 'e.pool': pool }).first('g.id');
    return !!r;
}

/**
 * The conversation an errand NPC holds with this player while an errand is
 * open (null when none is, and the NPC's own 'intro' row speaks, offering
 * `errand_accept`).
 */
export async function errandTalk(playerId: number, npc: { name: string; errand_pool: string | null }): Promise<ErrandTalk | null> {
    if (!npc.errand_pool) return null;
    const open = await openErrand(db, playerId);
    if (!open?.leg) {
        // Met before: no introduction, only his own short greeting (npc_dialogues
        // stage 'errand_again'); a first meeting falls through to his 'intro'.
        if (!(await hasCarriedFor(db, playerId, npc.errand_pool))) return null;
        const again = await db('npc_dialogues as d').join('npcs as n', 'n.id', 'd.npc_id')
            .where({ 'n.name': npc.name, 'd.stage_key': 'errand_again' }).first('d.text_lines', 'd.options');
        if (!again) return null;
        const opts = typeof again.options === 'string' ? JSON.parse(again.options) : again.options;
        return { lines: again.text_lines ?? [], options: opts ?? [] };
    }
    const { leg, row } = open;
    const left = Number(row.leg_limit_seconds) - (Date.now() - new Date(row.leg_started_at).getTime()) / 1000;
    if (leg.to === npc.name) {
        const has = await carries(db, playerId, leg.item, wanted(leg));
        // Brothers say each other's first names.
        const sender = leg.from.split(' ')[0];
        return {
            lines: has
                ? [leg.supply ? `${sender} sent you? Let's see what you've brought.` : `${sender} sent you? Let's see it.`]
                : [leg.supply ? `${sender} said you'd be bringing something. You haven't got it all.` : `${sender} said something was coming. You haven't got it.`],
            options: [
                ...(has ? [{ label: leg.supply ? `Hand over ${goods(leg)}` : `Hand over the ${leg.item}`, next_stage: null, action: 'errand_deliver' }] : []),
                { label: 'Leave', next_stage: null, action: 'close' },
            ],
        };
    }
    if (leg.from === npc.name) {
        return {
            lines: [...say(leg.waiting, { to: leg.to }), left > 0 ? `(${spokenTime(left)} left to reach ${leg.to}.)` : `(You are late for ${leg.to}.)`, await whereIs(db, leg.to)].filter(Boolean),
            options: [
                { label: '"I\'ll go."', next_stage: null, action: 'close' },
                { label: '"I can\'t do it after all."', next_stage: null, action: 'errand_drop' },
            ],
        };
    }
    return {
        lines: ['That\'s between the other two. I don\'t get involved.', 'Mostly I don\'t get involved.'],
        options: [{ label: 'Leave', next_stage: null, action: 'close' }],
    };
}

/** The errand actions this NPC offers this player now (routes/npcs.ts offeredActions). */
export async function errandActions(playerId: number, npc: { name: string; errand_pool: string | null }): Promise<string[]> {
    if (!npc.errand_pool) return [];
    const open = await openErrand(db, playerId);
    if (!open) {
        const lines = (await db('errands').where({ pool: npc.errand_pool, is_active: true })).map(asErrand);
        return lines.some(e => e.legs[0]?.from === npc.name) ? ['errand_accept'] : [];
    }
    if (!open.leg) return ['errand_drop'];
    if (open.leg.to === npc.name && await carries(db, playerId, open.leg.item, wanted(open.leg))) return ['errand_deliver'];
    if (open.leg.from === npc.name) return ['errand_drop'];
    return [];
}

// ── Taking one, handing over, giving up ─────────────────────────────────────

type Option = { label: string; next_stage: string | null; action: string | null };
/**
 * `options`: what the player may answer to what was just said. The dialogue
 * shows the reply with these buttons and nothing else, rather than reloading
 * into what the NPC says next time (which repeated the offer's waiting lines
 * under it). `end` is the plain case: one Leave button.
 */
type Said = { ok: true; message: string; end?: boolean; options?: Option[] } | { ok: false; error: string; status: number };

/** The answers to a leg just handed over: off you go, or not after all. */
const ON_YOUR_WAY: Option[] = [
    { label: '"I\'ll go."', next_stage: null, action: 'close' },
    { label: '"I can\'t do it after all."', next_stage: null, action: 'errand_drop' },
];

function refuse(err: unknown, context: string): Said {
    if (err instanceof ErrandAbort) return { ok: false, error: err.message, status: 400 };
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'You are already carrying something for them.', status: 409 };
    logger.error(`errands ${context}: ${err}`);
    return { ok: false, error: SERVER_ERROR, status: 500 };
}

/**
 * Take an errand from this NPC: one of the lines that start with them, fixed
 * for the player by the day and by how many legs they have carried, so
 * turning one down and asking again offers the same one (Nathan, 2026-11-25).
 */
export async function acceptErrand(playerId: number, npc: { name: string; errand_pool: string | null }): Promise<Said> {
    try {
        if (!npc.errand_pool) throw new ErrandAbort('There is nothing to carry.');
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first('id');
            if (await trx('player_errands').where({ player_id: playerId }).first('player_id')) throw new ErrandAbort('You are already carrying something for them.');
            const lines = (await trx('errands').where({ pool: npc.errand_pool, is_active: true })).map(asErrand).filter(e => e.legs[0]?.from === npc.name);
            if (!lines.length) throw new ErrandAbort('There is nothing to carry.');
            const carried = Number((await trx('errand_log').where({ player_id: playerId }).count('id as n').first())?.n ?? 0);
            const errand = lines[pick(lines.length, `${playerId}:${gameDayKey()}:${npc.name}:${carried}`)];
            const leg = errand.legs[0];
            const item = await trx('items').where({ name: leg.item }).first('id');
            if (!item) throw new ErrandAbort(`No one in Talaran has made ${leg.item} yet.`);
            const limit = await legLimit(trx, leg);
            await trx('player_errands').insert({ player_id: playerId, errand_id: errand.id, leg: 0, leg_started_at: new Date(), leg_limit_seconds: limit });
            if (!leg.supply) await addItemToInventoryWithin(trx, playerId, item.id, 1);
            return { ok: true as const, message: [...say(leg.offer, { limit: spokenTime(limit), to: leg.to, qty: String(wanted(leg)) }), await whereIs(trx, leg.to)].filter(Boolean).join('\n'), options: ON_YOUR_WAY };
        });
    } catch (err) {
        return refuse(err, 'accept');
    }
}

/** Hand the leg's item to the NPC it was meant for. Late or not, it is delivered. */
export async function deliverErrand(playerId: number, npc: { name: string }): Promise<Said> {
    try {
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first('id');
            const open = await openErrand(trx, playerId, true);
            if (!open?.leg || open.leg.to !== npc.name) throw new ErrandAbort(`You have nothing for ${npc.name}.`);
            const { row, errand, leg } = open;
            const took = await takeItemsWithin(trx, playerId, [{ name: leg.item, quantity: wanted(leg) }]);
            if (!took.ok) throw new ErrandAbort(leg.supply ? `You need ${goods(leg)}.` : `You haven't got the ${leg.item}.`);

            const limit = Number(row.leg_limit_seconds);
            const taken = (Date.now() - new Date(row.leg_started_at).getTime()) / 1000;
            const lateBy = Math.max(0, Math.round(taken - limit));
            await trx('errand_log').insert({ player_id: playerId, errand_id: errand.id, leg: row.leg, limit_seconds: limit, late_seconds: lateBy });
            const lines = lateBy <= 0 ? leg.on_time : lateBy <= limit * VERY_LATE_FACTOR ? leg.late : leg.very_late;
            const said = say(lines, { late: spokenLate(lateBy), from: leg.from });
            const late = Number(row.late_legs) + (lateBy > 0 ? 1 : 0);

            // A late leg ends the errand there (Nathan, 2026-11-25): being on
            // time is the whole of it, so the next leg is never handed out.
            const nextIndex = Number(row.leg) + 1;
            const next = lateBy > 0 ? undefined : errand.legs[nextIndex];
            if (next) {
                const nextItem = await trx('items').where({ name: next.item }).first('id');
                if (!nextItem) throw new ErrandAbort(`No one in Talaran has made ${next.item} yet.`);
                const nextLimit = await legLimit(trx, next);
                const moved = await trx('player_errands').where({ player_id: playerId, leg: row.leg })
                    .update({ leg: nextIndex, leg_started_at: new Date(), leg_limit_seconds: nextLimit, late_legs: late });
                if (moved !== 1) throw new ErrandAbort('That has been handed over already.');
                if (!next.supply) await addItemToInventoryWithin(trx, playerId, nextItem.id, 1);
                return { ok: true as const, message: [...said, ...say(next.offer, { limit: spokenTime(nextLimit), to: next.to }), await whereIs(trx, next.to)].filter(Boolean).join('\n'), options: ON_YOUR_WAY };
            }

            // The last leg: the errand is done. The delete is the gate, so it pays once.
            const closed = await trx('player_errands').where({ player_id: playerId, leg: row.leg }).delete();
            if (closed !== 1) throw new ErrandAbort('That has been handed over already.');
            const paid: string[] = [];
            // Goods the player brought are paid for whether or not they were late:
            // they were handed over either way. Full value, as a tutor's daily pays.
            let goodsGold = 0;
            for (const l of errand.legs.filter(x => x.supply)) {
                const v = Number((await trx('items').where({ name: l.item }).first('value'))?.value ?? 0);
                goodsGold += v * wanted(l);
            }
            if (goodsGold > 0) {
                await creditGoldWithin(trx, { playerId, amount: goodsGold, reason: 'errand_goods', refType: 'errand', refId: errand.id });
            }
            if (late === 0) {
                const gold = wander(errand.reward_gold), xp = wander(errand.reward_xp);
                if (gold > 0) {
                    await creditGoldWithin(trx, { playerId, amount: gold, reason: 'errand_reward', refType: 'errand', refId: errand.id });
                }
                // One gold figure: the pay and the goods together, the goods' share named.
                const total = gold + goodsGold;
                if (total > 0) paid.push(goodsGold > 0
                    ? `${total.toLocaleString('en-US')} gold (${goodsGold.toLocaleString('en-US')} of it for the goods)`
                    : `${total.toLocaleString('en-US')} gold`);
                if (errand.reward_skill && xp > 0) {
                    await awardXp(playerId, errand.reward_skill, xp, trx);
                    paid.push(`${xp.toLocaleString('en-US')} ${errand.reward_skill} experience`);
                }
            }
            const tail = late === 0
                ? (paid.length ? `(Errand done on time. You are paid ${listWords(paid)}.)` : '(Errand done on time.)')
                : goodsGold > 0
                    ? `(You were ${spokenLate(lateBy)} late, and the errand ends here. You are paid ${goodsGold.toLocaleString('en-US')} gold for the goods, and nothing more.)`
                    : `(You were ${spokenLate(lateBy)} late, and the errand ends here. Nothing is paid.)`;
            return { ok: true as const, message: [...said, tail].join('\n'), end: true };
        });
    } catch (err) {
        return refuse(err, 'deliver');
    }
}

/** Give the errand up: the item, if still carried, goes back. Nothing is paid. */
export async function dropErrand(playerId: number): Promise<Said> {
    try {
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first('id');
            const open = await openErrand(trx, playerId, true);
            if (!open) throw new ErrandAbort('You are not carrying anything for anyone.');
            // A handed-over item goes back; goods the player brought are theirs to keep.
            if (open.leg && !open.leg.supply && await carries(trx, playerId, open.leg.item)) {
                await takeItemsWithin(trx, playerId, [{ name: open.leg.item, quantity: 1 }]);
            }
            await trx('player_errands').where({ player_id: playerId }).delete();
            return { ok: true as const, message: 'Fine. I\'ll find someone else.', end: true };
        });
    } catch (err) {
        return refuse(err, 'drop');
    }
}

// ── The quest log (routes/quests.ts) ────────────────────────────────────────

export interface ErrandSummary {
    name: string; leg: number; legs: number
    item: string; quantity: number; brought: boolean; from: string; to: string; place: string | null
    secondsLeft: number
}

/** The player's open errand as the Quests menu shows it, or null. */
export async function errandSummary(playerId: number): Promise<ErrandSummary | null> {
    const open = await openErrand(db, playerId);
    if (!open?.leg) return null;
    const { row, errand, leg } = open;
    const place = await db('npcs as n').join('locations as l', 'l.id', 'n.location_id').where('n.name', leg.to).first('l.name');
    const left = Number(row.leg_limit_seconds) - (Date.now() - new Date(row.leg_started_at).getTime()) / 1000;
    return {
        name: errand.name, leg: Number(row.leg) + 1, legs: errand.legs.length,
        item: leg.item, quantity: wanted(leg), brought: !!leg.supply, from: leg.from, to: leg.to, place: place?.name ?? null,
        secondsLeft: Math.round(left),
    };
}

