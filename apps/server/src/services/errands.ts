import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { addItemToInventoryWithin, takeItemsWithin } from './inventory';
import { creditGoldWithin } from './gold';
import { awardXp } from './xp';

// ── Errands (the Friddick Brothers; Nathan, 2026-11-22) ─────────────────────
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
// late, or very late. A late leg forfeits the reward (Nathan, 2026-11-22).
//
// One open errand a player (`player_errands`, keyed by player). Handing over
// is one transaction: the player's row, then their errand row, both locked;
// the item taken; the leg moved on or the errand closed, paid if never late.

export const ERRAND_SLACK = 1.5;
export const ERRAND_GRACE_SECONDS = 90;
/** Past the limit by more than the limit itself is very late. */
const VERY_LATE_FACTOR = 1;

interface Leg {
    from: string; to: string; item: string
    offer: string[]; waiting: string[]
    on_time: string[]; late: string[]; very_late: string[]
}
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

const say = (lines: string[], vars: Record<string, string>) =>
    lines.map(l => l.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`));

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
    return Math.round((road ?? 600) * ERRAND_SLACK + ERRAND_GRACE_SECONDS);
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

async function carries(x: any, playerId: number, itemName: string): Promise<boolean> {
    const r = await x('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
        .where({ 'pi.player_id': playerId, 'i.name': itemName }).where('pi.quantity', '>', 0).first('pi.item_id');
    return !!r;
}

// ── What an errand NPC says and offers ──────────────────────────────────────

export interface ErrandTalk { lines: string[]; options: { label: string; next_stage: string | null; action: string | null }[] }

/**
 * The conversation an errand NPC holds with this player while an errand is
 * open (null when none is, and the NPC's own 'intro' row speaks, offering
 * `errand_accept`).
 */
export async function errandTalk(playerId: number, npc: { name: string; errand_pool: string | null }): Promise<ErrandTalk | null> {
    if (!npc.errand_pool) return null;
    const open = await openErrand(db, playerId);
    if (!open?.leg) return null;
    const { leg, row } = open;
    const left = Number(row.leg_limit_seconds) - (Date.now() - new Date(row.leg_started_at).getTime()) / 1000;
    if (leg.to === npc.name) {
        const has = await carries(db, playerId, leg.item);
        // Brothers say each other's first names.
        const sender = leg.from.split(' ')[0];
        return {
            lines: has ? [`${sender} sent you? Let's see it.`] : [`${sender} said something was coming. You haven't got it.`],
            options: [
                ...(has ? [{ label: `Hand over the ${leg.item}`, next_stage: null, action: 'errand_deliver' }] : []),
                { label: 'Leave', next_stage: null, action: 'close' },
            ],
        };
    }
    if (leg.from === npc.name) {
        return {
            lines: [...say(leg.waiting, { to: leg.to }), left > 0 ? `(${spokenTime(left)} left to reach ${leg.to}.)` : `(You are late for ${leg.to}.)`],
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
    if (open.leg.to === npc.name && await carries(db, playerId, open.leg.item)) return ['errand_deliver'];
    if (open.leg.from === npc.name) return ['errand_drop'];
    return [];
}

// ── Taking one, handing over, giving up ─────────────────────────────────────

type Said = { ok: true; message: string } | { ok: false; error: string; status: number };

function refuse(err: unknown, context: string): Said {
    if (err instanceof ErrandAbort) return { ok: false, error: err.message, status: 400 };
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'You are already carrying something for them.', status: 409 };
    logger.error(`errands ${context}: ${err}`);
    return { ok: false, error: SERVER_ERROR, status: 500 };
}

/** Take an errand from this NPC: one of the lines that start with them, at random. */
export async function acceptErrand(playerId: number, npc: { name: string; errand_pool: string | null }): Promise<Said> {
    try {
        if (!npc.errand_pool) throw new ErrandAbort('There is nothing to carry.');
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first('id');
            if (await trx('player_errands').where({ player_id: playerId }).first('player_id')) throw new ErrandAbort('You are already carrying something for them.');
            const lines = (await trx('errands').where({ pool: npc.errand_pool, is_active: true })).map(asErrand).filter(e => e.legs[0]?.from === npc.name);
            if (!lines.length) throw new ErrandAbort('There is nothing to carry.');
            const errand = lines[Math.floor(Math.random() * lines.length)];
            const leg = errand.legs[0];
            const item = await trx('items').where({ name: leg.item }).first('id');
            if (!item) throw new ErrandAbort(`No one in Talaran has made ${leg.item} yet.`);
            const limit = await legLimit(trx, leg);
            await trx('player_errands').insert({ player_id: playerId, errand_id: errand.id, leg: 0, leg_started_at: new Date(), leg_limit_seconds: limit });
            await addItemToInventoryWithin(trx, playerId, item.id, 1);
            return { ok: true as const, message: say(leg.offer, { limit: spokenTime(limit), to: leg.to }).join('\n') };
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
            const took = await takeItemsWithin(trx, playerId, [{ name: leg.item, quantity: 1 }]);
            if (!took.ok) throw new ErrandAbort(`You haven't got the ${leg.item}.`);

            const limit = Number(row.leg_limit_seconds);
            const taken = (Date.now() - new Date(row.leg_started_at).getTime()) / 1000;
            const lateBy = Math.max(0, Math.round(taken - limit));
            await trx('errand_log').insert({ player_id: playerId, errand_id: errand.id, leg: row.leg, limit_seconds: limit, late_seconds: lateBy });
            const lines = lateBy <= 0 ? leg.on_time : lateBy <= limit * VERY_LATE_FACTOR ? leg.late : leg.very_late;
            const said = say(lines, { late: spokenTime(lateBy), from: leg.from });
            const late = Number(row.late_legs) + (lateBy > 0 ? 1 : 0);

            const nextIndex = Number(row.leg) + 1;
            const next = errand.legs[nextIndex];
            if (next) {
                const nextItem = await trx('items').where({ name: next.item }).first('id');
                if (!nextItem) throw new ErrandAbort(`No one in Talaran has made ${next.item} yet.`);
                const nextLimit = await legLimit(trx, next);
                const moved = await trx('player_errands').where({ player_id: playerId, leg: row.leg })
                    .update({ leg: nextIndex, leg_started_at: new Date(), leg_limit_seconds: nextLimit, late_legs: late });
                if (moved !== 1) throw new ErrandAbort('That has been handed over already.');
                await addItemToInventoryWithin(trx, playerId, nextItem.id, 1);
                return { ok: true as const, message: [...said, ...say(next.offer, { limit: spokenTime(nextLimit), to: next.to })].join('\n') };
            }

            // The last leg: the errand is done. The delete is the gate, so it pays once.
            const closed = await trx('player_errands').where({ player_id: playerId, leg: row.leg }).delete();
            if (closed !== 1) throw new ErrandAbort('That has been handed over already.');
            const paid: string[] = [];
            if (late === 0) {
                if (errand.reward_gold > 0) {
                    await creditGoldWithin(trx, { playerId, amount: errand.reward_gold, reason: 'errand_reward', refType: 'errand', refId: errand.id });
                    paid.push(`${errand.reward_gold.toLocaleString('en-US')} gold`);
                }
                if (errand.reward_skill && errand.reward_xp > 0) {
                    await awardXp(playerId, errand.reward_skill, errand.reward_xp, trx);
                    paid.push(`${errand.reward_xp.toLocaleString('en-US')} ${errand.reward_skill} experience`);
                }
            }
            const tail = late === 0
                ? (paid.length ? `(Errand done on time. You are paid ${paid.join(' and ')}.)` : '(Errand done on time.)')
                : '(Errand done, but late. Nothing is paid for a late errand.)';
            return { ok: true as const, message: [...said, tail].join('\n') };
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
            if (open.leg && await carries(trx, playerId, open.leg.item)) {
                await takeItemsWithin(trx, playerId, [{ name: open.leg.item, quantity: 1 }]);
            }
            await trx('player_errands').where({ player_id: playerId }).delete();
            return { ok: true as const, message: 'Fine. I\'ll find someone else.' };
        });
    } catch (err) {
        return refuse(err, 'drop');
    }
}
