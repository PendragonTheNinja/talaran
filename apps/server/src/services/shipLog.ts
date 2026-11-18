import db from '../db';
import { addItemToInventoryWithin, recordItemFirst } from './inventory';
import { afterCommit } from '../lib/afterCommit';

// ── The ship's log (docs/sailing-spec.md §7 and §8) ──────────────────────────
//
// The sailor's own record of every voyage, read in its own tab beside the
// travel log. A voyage has a weather, set when it puts to sea; each leg is cut
// into watches, about one a minute, and each watch rolls once and writes a
// line from `ship_log_lines`: the weather, the sea, something aboard, a
// sighting, or one step of a story told over several watches.
//
// Nothing ticks. A leg's watches are all written when the leg starts, each with
// the moment it falls due, and the log shows a watch once that moment has
// passed: settled on read, as a fight is. A leg cut short (the sailor walked
// off, or was brought home) shows only what was due before it ended.
//
// The rare sighting (§8, kind 'vast') is the only thing a crossing gives: its
// last step hands over a Fathom Scale, paid once when the leg arrives, by a
// conditional flip of `sighting_paid`.

export const WATCH_SECONDS = 60;
/** One watch in this many turns up something vast: near hunting's trophy rate for a minute's work (CLAUDE.md §8). */
export const VAST_ONE_IN = 300;
export const SIGHTING_ITEM = 'Fathom Scale';
/** How many voyages a player's log keeps. */
export const SHIP_LOG_VOYAGES_KEPT = 20;

/** The voyage's weather, by weight. */
const WEATHER: [string, number][] = [['fair', 40], ['grey', 25], ['calm', 15], ['fog', 10], ['squall', 10]];
/** What a watch turns to, by weight, after the vast roll. */
const KINDS: [string, number][] = [['weather', 15], ['sea', 25], ['aboard', 20], ['sighting', 25], ['story', 15]];

export interface Watch { at: string; kind: string; text: string; line: number }

type Rng = () => number;

function byWeight<T>(rows: T[], weight: (r: T) => number, rng: Rng): T | null {
    const total = rows.reduce((s, r) => s + Math.max(0, weight(r)), 0);
    if (total <= 0) return null;
    let roll = rng() * total;
    for (const r of rows) {
        roll -= Math.max(0, weight(r));
        if (roll < 0) return r;
    }
    return rows[rows.length - 1] ?? null;
}

export function pickWeather(rng: Rng = Math.random): string {
    return byWeight(WEATHER, w => w[1], rng)![0];
}

interface LineRow { id: number; kind: string; weather: string | null; leg: string | null; story_key: string | null; step: number; text: string; weight: number }

/**
 * The watches of one leg, pure: `lines` are the island's active rows, `used`
 * the line ids already told this voyage (never twice in a voyage while
 * another will do). The first watch of a voyage is always its weather. At most
 * one story or vast sighting a leg, and only one that fits in the watches left.
 */
export function composeWatches(opts: {
    lines: LineRow[]; weather: string; leg: string; start: Date; seconds: number;
    first: boolean; used: Set<number>; rng?: Rng;
}): Watch[] {
    const { lines, weather, leg, start, seconds, first, used } = opts;
    const rng = opts.rng ?? Math.random;
    const count = Math.max(2, Math.round(seconds / WATCH_SECONDS));
    const spacing = seconds / count;
    const fits = (l: LineRow) => (!l.weather || l.weather === weather) && (!l.leg || l.leg === leg);
    // A leg's own lines keep their place: leaving early in the leg, landfall at its last watch.
    const inPlace = (l: LineRow, at: number) => !l.leg || (l.leg === 'home' ? at === count - 1 : at < count / 2);
    const fresh = (pool: LineRow[]) => {
        const unused = pool.filter(l => !used.has(l.id));
        return unused.length ? unused : pool;
    };
    const stories = (kind: 'story' | 'vast') => {
        const map = new Map<string, LineRow[]>();
        for (const l of lines) if (l.kind === kind && l.story_key && fits(l)) {
            map.set(l.story_key, [...(map.get(l.story_key) ?? []), l]);
        }
        return [...map.values()].map(steps => steps.sort((a, b) => a.step - b.step));
    };

    const texts: { kind: string; row: LineRow }[] = [];
    let told = false;
    while (texts.length < count) {
        const left = count - texts.length;
        let kind = first && texts.length === 0 ? 'weather' : null;
        if (!kind && !told && rng() * VAST_ONE_IN < 1) {
            const vast = stories('vast').filter(s => s.length <= left);
            const tale = vast.length ? vast[Math.floor(rng() * vast.length)] : null;
            if (tale) {
                for (const row of tale) texts.push({ kind: 'vast', row });
                told = true;
                continue;
            }
        }
        kind = kind ?? byWeight(KINDS, k => k[1], rng)![0];
        if (kind === 'story') {
            const tales = stories('story').filter(s => s.length <= left && !s.some(r => used.has(r.id)));
            const tale = !told && tales.length ? tales[Math.floor(rng() * tales.length)] : null;
            if (tale) {
                for (const row of tale) texts.push({ kind: 'story', row });
                told = true;
                continue;
            }
            kind = 'sighting';
        }
        const at = texts.length;
        const pool = fresh(lines.filter(l => l.kind === kind && fits(l) && inPlace(l, at) && !texts.some(t => t.row.id === l.id)));
        const row = byWeight(pool, l => Number(l.weight), rng);
        if (!row) break;
        texts.push({ kind, row });
        used.add(row.id);
    }
    for (const t of texts) used.add(t.row.id);
    return texts.map((t, i) => ({
        at: new Date(start.getTime() + Math.round((i + 1) * spacing * 1000)).toISOString(),
        kind: t.kind, text: t.row.text, line: t.row.id,
    }));
}

async function islandLines(x: any, island: string): Promise<LineRow[]> {
    const rows = await x('ship_log_lines').where({ is_active: true })
        .andWhere((b: any) => b.where({ island }).orWhereNull('island'))
        .select('id', 'kind', 'weather', 'leg', 'story_key', 'step', 'text', 'weight');
    return rows.map((r: any) => ({ ...r, id: Number(r.id), step: Number(r.step), weight: Number(r.weight) }));
}

/**
 * A leg begins (services/voyages.ts startLeg, inside its transaction, the
 * player row locked): on 'out', a new voyage in the log; then the leg's
 * watches, all of them, each due at its own moment.
 */
export async function logLegWithin(trx: any, playerId: number, opts: {
    leg: 'out' | 'on' | 'home'; island: string; boat: string; from: string; to: string; start: Date; seconds: number;
}): Promise<void> {
    const voyage = await trx('player_voyages').where({ player_id: playerId }).first('log_voyage_id');
    if (!voyage) return;
    let logId = voyage.log_voyage_id ? Number(voyage.log_voyage_id) : null;
    let weather: string;
    let first = false;
    if (!logId || opts.leg === 'out') {
        weather = pickWeather();
        const [row] = await trx('ship_log_voyages')
            .insert({ player_id: playerId, boat: opts.boat, home: opts.from, weather, started_at: opts.start })
            .returning('id');
        logId = Number(typeof row === 'object' ? row.id : row);
        await trx('player_voyages').where({ player_id: playerId }).update({ log_voyage_id: logId });
        first = true;
        // Keep the newest voyages only.
        const old = await trx('ship_log_voyages').where({ player_id: playerId })
            .orderBy('started_at', 'desc').offset(SHIP_LOG_VOYAGES_KEPT).pluck('id');
        if (old.length) await trx('ship_log_voyages').whereIn('id', old).delete();
    } else {
        weather = (await trx('ship_log_voyages').where({ id: logId }).first('weather'))?.weather ?? 'fair';
    }
    const used = new Set<number>();
    for (const l of await trx('ship_log_legs').where({ voyage_id: logId }).pluck('watches')) {
        for (const w of (typeof l === 'string' ? JSON.parse(l) : l) as Watch[]) used.add(Number(w.line));
    }
    const watches = composeWatches({
        lines: await islandLines(trx, opts.island), weather, leg: opts.leg,
        start: opts.start, seconds: opts.seconds, first, used,
    });
    await trx('ship_log_legs').insert({
        voyage_id: logId, leg: opts.leg, to_name: opts.to, started_at: opts.start,
        arrives_at: new Date(opts.start.getTime() + opts.seconds * 1000), watches: JSON.stringify(watches),
    });
}

/**
 * The leg arrives (services/voyages.ts arriveBySea, inside its transaction):
 * the landing's lines are kept beside the watches, a vast sighting pays its
 * Fathom Scale exactly once, and a homecoming closes the voyage. Returns the
 * line for the arrival card when the scale was paid.
 */
export async function landLegWithin(trx: any, playerId: number, opts: {
    home: boolean; landing: { message: string; itemName: string | null; quantity: number }[];
}): Promise<{ message: string; itemName: string; quantity: number } | null> {
    const voyage = await trx('player_voyages').where({ player_id: playerId }).first('log_voyage_id');
    if (!voyage?.log_voyage_id) return null;
    const leg = await trx('ship_log_legs').where({ voyage_id: voyage.log_voyage_id, arrived: false })
        .orderBy('id', 'desc').forUpdate().first('id', 'watches');
    let paid: { message: string; itemName: string; quantity: number } | null = null;
    // Locked, and landed only if this call landed it: a leg arrives once.
    const landed = leg ? await trx('ship_log_legs').where({ id: leg.id, arrived: false })
        .update({ arrived: true, landing: JSON.stringify(opts.landing) }) : 0;
    if (leg && landed === 1) {
        const watches = (typeof leg.watches === 'string' ? JSON.parse(leg.watches) : leg.watches) as Watch[];
        if (watches.some(w => w.kind === 'vast')) {
            // Completion is the gate (CLAUDE.md §4 rule 5): pay only if this call flipped it.
            const flipped = await trx('ship_log_legs').where({ id: leg.id, sighting_paid: false }).update({ sighting_paid: true });
            const item = flipped === 1 ? await trx('items').where({ name: SIGHTING_ITEM }).first('id') : null;
            if (item) {
                await addItemToInventoryWithin(trx, playerId, item.id, 1);
                afterCommit(trx, () => recordItemFirst(playerId, item.id, 'voyage'));
                paid = { message: `You stow the ${SIGHTING_ITEM} safe in your pack.`, itemName: SIGHTING_ITEM, quantity: 1 };
            }
        }
    }
    if (opts.home) await trx('ship_log_voyages').where({ id: voyage.log_voyage_id }).update({ ended_at: new Date() });
    return paid;
}

/** A voyage ends without coming home by sea (brought home while away). */
export async function closeVoyageLogWithin(trx: any, playerId: number): Promise<void> {
    const voyage = await trx('player_voyages').where({ player_id: playerId }).first('log_voyage_id');
    if (voyage?.log_voyage_id) await trx('ship_log_voyages').where({ id: voyage.log_voyage_id }).update({ ended_at: new Date() });
}

/**
 * The log, newest voyage first: each leg's watches that have fallen due, and
 * the landing once arrived. A leg that never arrived and is not the one under
 * way shows what was due before the voyage moved on.
 */
export async function shipLog(playerId: number) {
    const voyages = await db('ship_log_voyages').where({ player_id: playerId })
        .orderBy('started_at', 'desc').limit(SHIP_LOG_VOYAGES_KEPT);
    if (!voyages.length) return { voyages: [] };
    const legs = await db('ship_log_legs').whereIn('voyage_id', voyages.map((v: any) => v.id)).orderBy('id');
    const now = Date.now();
    return {
        voyages: voyages.map((v: any) => {
            const mine = legs.filter((l: any) => Number(l.voyage_id) === Number(v.id));
            return {
                id: Number(v.id),
                boat: v.boat,
                home: v.home,
                weather: v.weather,
                startedAt: v.started_at,
                endedAt: v.ended_at,
                legs: mine.map((l: any, i: number) => {
                    const watches = (typeof l.watches === 'string' ? JSON.parse(l.watches) : l.watches) as Watch[];
                    // A leg left behind ends where the next began, or where the voyage ended.
                    const next = mine[i + 1];
                    const cut = l.arrived ? Infinity
                        : next ? new Date(next.started_at).getTime()
                            : v.ended_at ? new Date(v.ended_at).getTime() : Infinity;
                    const due = watches.filter(w => {
                        const at = new Date(w.at).getTime();
                        return (l.arrived || at <= now) && at <= cut;
                    });
                    return {
                        leg: l.leg,
                        to: l.to_name,
                        startedAt: l.started_at,
                        arrived: !!l.arrived,
                        underWay: !l.arrived && cut === Infinity && new Date(l.arrives_at).getTime() > now - 5 * 60_000,
                        watches: due.map(w => ({ at: w.at, kind: w.kind, text: w.text })),
                        landing: l.arrived ? (typeof l.landing === 'string' ? JSON.parse(l.landing) : l.landing) ?? [] : [],
                    };
                }),
            };
        }),
    };
}
