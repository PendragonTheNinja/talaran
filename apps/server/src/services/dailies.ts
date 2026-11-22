import db from '../db';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { gameDayKey } from '../lib/gameTime';
import { takeItemsWithin } from './inventory';
import { creditGoldWithin } from './gold';
import { awardXp, levelFromXp } from './xp';
import { activeXpForSeconds } from './farming';

// ── The tutors' daily tasks (Nathan, 2026-11-22) ────────────────────────────
//
// Once their lesson is done, each Taiar tutor (Geoffrey, Geossica, and the
// rest; `npcs.daily_skill`) asks for one thing a day: some of what their
// craft makes, which they keep, so dailies take goods out of the world.
// The task is one of the tutor's `daily_tasks`, picked for each player by the
// game day (gameDayKey, Eastern midnight, when the Chronicle turns over), so
// it is the same all day and different tomorrow, and never Math.random.
//
// It pays the tutor's skill DAILY_XP_SECONDS of work at the player's own
// level, and gold at DAILY_GOLD_SHARE of what the goods are worth: below the
// merchants' 45%, so a daily is never the best place to sell. One a tutor a
// player a day (`player_daily_tasks`, keyed so); the insert is the gate, in
// the transaction that takes the goods and pays.
//
// Between tasks a tutor says one of their own `daily_chatter` lines, at
// random, so they no longer repeat one line forever.

export const DAILY_XP_SECONDS = 600;
export const DAILY_GOLD_SHARE = 0.4;

interface Task { id: number; npc_name: string; item_name: string; quantity: number; ask: string[]; thanks: string[] }

class DailyAbort extends Error {}

const lines = (v: unknown): string[] => {
    const a = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(a) ? a.map(String) : [];
};

/** A small stable hash, so a player's task for a day is fixed. */
function pick(n: number, seed: string): number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h) % n;
}

/** Has the player finished this tutor's own lesson? Dailies come after it. */
async function lessonDone(x: any, playerId: number, npc: any): Promise<boolean> {
    if (!npc.daily_after_quest_id) return true;
    const q = await x('player_quests').where({ player_id: playerId, quest_id: npc.daily_after_quest_id, status: 'completed' }).first('id');
    return !!q;
}

async function todaysTask(x: any, playerId: number, npc: any, day: string): Promise<Task | null> {
    const tasks = await x('daily_tasks').where({ npc_name: npc.name, is_active: true }).orderBy('id');
    if (!tasks.length) return null;
    const t = tasks[pick(tasks.length, `${playerId}:${day}:${npc.name}`)];
    return { ...t, quantity: Number(t.quantity), ask: lines(t.ask), thanks: lines(t.thanks) };
}

async function held(x: any, playerId: number, itemName: string): Promise<number> {
    const r = await x('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
        .where({ 'pi.player_id': playerId, 'i.name': itemName }).sum({ q: 'pi.quantity' }).first();
    return Number(r?.q ?? 0);
}

const fill = (ls: string[], t: Task) => ls.map(l => l.replace(/\{qty\}/g, t.quantity.toLocaleString('en-US')).replace(/\{item\}/g, t.item_name));

export interface DailyTalk { lines: string[]; options: { label: string; next_stage: string | null; action: string | null }[] }

/**
 * What a tutor says once their lesson is done: today's task, or, when it is
 * done, a line of their own. Null for anyone else, or before the lesson.
 */
export async function dailyTalk(playerId: number, npc: any): Promise<DailyTalk | null> {
    if (!npc.daily_skill || !(await lessonDone(db, playerId, npc))) return null;
    const day = gameDayKey();
    const chatter = lines(npc.daily_chatter);
    const aside = chatter.length ? [chatter[Math.floor(Math.random() * chatter.length)]] : [];
    const done = await db('player_daily_tasks').where({ player_id: playerId, npc_name: npc.name, day }).first('task_id');
    if (done) {
        return { lines: [...aside, 'That\'s all I need from you today. Come back tomorrow.'], options: [{ label: 'Leave', next_stage: null, action: 'close' }] };
    }
    const task = await todaysTask(db, playerId, npc, day);
    if (!task) return aside.length ? { lines: aside, options: [{ label: 'Leave', next_stage: null, action: 'close' }] } : null;
    const have = await held(db, playerId, task.item_name);
    return {
        lines: [...aside, ...fill(task.ask, task), `(Today: ${task.item_name} ×${task.quantity.toLocaleString('en-US')}. You have ${have.toLocaleString('en-US')}.)`],
        options: [
            ...(have >= task.quantity ? [{ label: `Hand over ${task.item_name} ×${task.quantity.toLocaleString('en-US')}`, next_stage: null, action: 'daily_hand_in' }] : []),
            { label: 'Leave', next_stage: null, action: 'close' },
        ],
    };
}

/** The daily actions this tutor offers this player now (routes/npcs.ts offeredActions). */
export async function dailyActions(playerId: number, npc: any): Promise<string[]> {
    if (!npc.daily_skill || !(await lessonDone(db, playerId, npc))) return [];
    const day = gameDayKey();
    if (await db('player_daily_tasks').where({ player_id: playerId, npc_name: npc.name, day }).first('task_id')) return [];
    const task = await todaysTask(db, playerId, npc, day);
    return task && (await held(db, playerId, task.item_name)) >= task.quantity ? ['daily_hand_in'] : [];
}

/** Hand today's task in: the goods taken, the skill and the gold paid, once a day. */
export async function handInDaily(playerId: number, npc: any): Promise<{ ok: true; message: string } | { ok: false; error: string; status: number }> {
    try {
        if (!npc.daily_skill) throw new DailyAbort(`${npc.name} has nothing for you.`);
        return await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first('id');
            if (!(await lessonDone(trx, playerId, npc))) throw new DailyAbort(`${npc.name} has nothing for you yet.`);
            const day = gameDayKey();
            const task = await todaysTask(trx, playerId, npc, day);
            if (!task) throw new DailyAbort(`${npc.name} has nothing for you today.`);
            // The day's row is the gate: a second hand-in finds it there.
            const [row] = await trx('player_daily_tasks')
                .insert({ player_id: playerId, npc_name: npc.name, day, task_id: task.id })
                .onConflict(['player_id', 'npc_name', 'day']).ignore().returning('task_id');
            if (!row) throw new DailyAbort('That\'s all I need from you today. Come back tomorrow.');
            const took = await takeItemsWithin(trx, playerId, [{ name: task.item_name, quantity: task.quantity }]);
            if (!took.ok) throw new DailyAbort(`You need ${task.item_name} ×${task.quantity.toLocaleString('en-US')}.`);

            const skillRow = await trx('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
                .where({ 'ps.player_id': playerId, 's.name': npc.daily_skill }).first('ps.xp');
            const xp = activeXpForSeconds(skillRow ? levelFromXp(Number(skillRow.xp)) : 1, DAILY_XP_SECONDS);
            await awardXp(playerId, npc.daily_skill, xp, trx);
            const value = Number((await trx('items').where({ name: task.item_name }).first('value'))?.value ?? 0);
            const gold = Math.floor(value * task.quantity * DAILY_GOLD_SHARE);
            if (gold > 0) await creditGoldWithin(trx, { playerId, amount: gold, reason: 'daily_task', refType: 'daily_task', refId: task.id });
            const paid = [`${xp.toLocaleString('en-US')} ${npc.daily_skill} experience`, ...(gold > 0 ? [`${gold.toLocaleString('en-US')} gold`] : [])];
            return { ok: true as const, message: [...fill(task.thanks, task), `(You are paid ${paid.join(' and ')}.)`].join('\n') };
        });
    } catch (err) {
        if (err instanceof DailyAbort) return { ok: false, error: err.message, status: 400 };
        logger.error(`dailies hand-in: ${err}`);
        return { ok: false, error: SERVER_ERROR, status: 500 };
    }
}

// ── Rare lines (2026-11-22) ─────────────────────────────────────────────────
//
// Any NPC may have lines that turn up only now and then (`npc_rare_lines`,
// 1 in `chance_one_in` each time the player opens a conversation), added
// after what the NPC would have said. The Friddicks' first: a faint hint of
// the brothers who went through a door and never came out the other side.

export async function rareLine(npcId: number): Promise<string | null> {
    const rows = await db('npc_rare_lines').where({ npc_id: npcId, is_active: true });
    for (const r of rows) if (Math.random() * Math.max(1, Number(r.chance_one_in)) < 1) return r.line;
    return null;
}
