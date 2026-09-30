import type { Knex } from 'knex';
import db from '../db';
import { logger } from '../lib/logger';
import { pushToAll } from '../lib/realtime';
import { afterCommit } from '../lib/afterCommit';
import { announceServer } from './records';

// World Events (docs/WORLD-EVENTS-AND-MUSEUMS.md).
//
// A skill event makes one skill worth more XP at one place, for a time and for
// a shared pool of actions, whichever runs out first. The bonus is applied in
// ONE place, awardXp in services/xp.ts, the game's only XP writer: every skill,
// present and future, is covered without touching the actions themselves. The
// place is where the player stands when the XP lands; actions stop when a
// player travels, so that is where the work was done.
//
// The roster is data (world_event_types) and the scheduler's dials are data
// (world_event_settings), so both are adjustable from the admin panel. What
// each KIND of event does is code, here.

/** Clients refresh their Events panel on this. */
export const EVENTS_CHANGED = 'world_events_changed';

const SCHEDULER_TICK_MS = 60_000;

// ── Live events, in memory ────────────────────────────────────────────────
//
// awardXp runs on every action in the game. Looking in the database each time
// for an event that almost never exists would cost a query per action for
// nothing, so live events are held here, keyed by place and skill, and the
// database is only touched when one could apply.

interface LiveEvent { id: number; locationId: number; skill: string }
let live = new Map<string, LiveEvent>();

const liveKey = (locationId: number, skill: string) => `${locationId}:${skill.toLowerCase()}`;

export async function refreshLiveEvents(): Promise<void> {
    const rows = await db('world_events')
        .whereNull('ended_at')
        .where('ends_at', '>', db.fn.now())
        .where('pool_left', '>', 0)
        .where({ kind: 'skill' })
        .whereNotNull('location_id')
        .whereNotNull('skill')
        .select('id', 'location_id', 'skill');
    const next = new Map<string, LiveEvent>();
    for (const r of rows) next.set(liveKey(r.location_id, r.skill), { id: r.id, locationId: r.location_id, skill: r.skill });
    live = next;
}

/** Refresh the cache and tell clients now: for writes made outside a transaction. */
export async function eventsChanged(): Promise<void> {
    await refreshLiveEvents();
    pushToAll(EVENTS_CHANGED, {});
}

/** Refresh the cache and tell clients, once whatever wrote has committed. */
function changedAfterCommit(x: Knex | Knex.Transaction): void {
    afterCommit(x, () => {
        refreshLiveEvents()
            .then(() => pushToAll(EVENTS_CHANGED, {}))
            .catch((err) => logger.error(`[events] refresh failed: ${err}`));
    });
}

/**
 * The XP for an award, with any live event at the player's place applied.
 * Called by awardXp, inside its transaction. `units` is how many things the
 * award paid for (a Harvest All over 20 plots is 20): that many are taken from
 * the event's pool atomically, or whatever is left if fewer, and only that
 * share of the award is raised. If the action rolls back, the pool gets its
 * units back. The last unit ends the event.
 */
export async function applyEventBonus(
    playerId: number,
    skillName: string,
    xp: number,
    x: Knex | Knex.Transaction,
    units = 1,
): Promise<number> {
    if (!live.size) return xp;
    const player = await x('players').where({ id: playerId }).select('current_location_id').first();
    if (!player?.current_location_id) return xp;
    const event = live.get(liveKey(player.current_location_id, skillName));
    if (!event) return xp;

    const want = Math.max(1, Math.floor(units));
    // One statement: lock the row, take min(want, left), and report how many
    // were taken. The locked read in the CTE sees the latest pool, so two
    // awards racing for the last few units split them rather than both
    // taking them.
    const { rows } = await x.raw(`
        WITH cur AS (
            SELECT id, pool_left FROM world_events
            WHERE id = ? AND ended_at IS NULL AND pool_left > 0 AND ends_at > now()
            FOR UPDATE
        )
        UPDATE world_events w
        SET pool_left = w.pool_left - LEAST(cur.pool_left, ?)
        FROM cur
        WHERE w.id = cur.id
        RETURNING LEAST(cur.pool_left, ?) AS taken, w.pool_left, w.xp_multiplier`,
        [event.id, want, want]);
    const taken = rows[0];
    if (!taken) {
        // Emptied or ended since the cache was filled.
        changedAfterCommit(x);
        return xp;
    }
    if (Number(taken.pool_left) === 0) {
        await x('world_events').where({ id: event.id }).update({ ended_at: x.fn.now(), end_reason: 'pool' });
        changedAfterCommit(x);
    }
    const extra = Math.round(xp * (Number(taken.xp_multiplier) - 1) * Number(taken.taken) / want);
    if (extra > 0) afterCommit(x, () => noteEventXp(playerId, skillName, extra));
    return xp + extra;
}

// ── What the result card is told ──────────────────────────────────────────
//
// Each action's service reports its own XP before awardXp raises it, so the
// result card would show the normal number and never the bonus. Rather than
// thread the bonus back through every call site, the bonus is noted here once
// the award commits, and the tick's one emit point (emitActionComplete) takes
// it and adds it to the result as `eventXp`. Keyed by player and skill, and
// short-lived, so a bonus from anything the tick did not resolve is never
// shown on a later, unrelated card.

const NOTE_TTL_MS = 60_000;
const eventXpNotes = new Map<number, { skill: string; xp: number; at: number }>();

function noteEventXp(playerId: number, skillName: string, extra: number): void {
    const prev = eventXpNotes.get(playerId);
    const same = prev && prev.skill === skillName && Date.now() - prev.at < NOTE_TTL_MS;
    eventXpNotes.set(playerId, { skill: skillName, xp: (same ? prev.xp : 0) + extra, at: Date.now() });
}

/** The event bonus in a player's last award of this skill, once; 0 when none. */
export function takeEventXp(playerId: number, skillName: string | null | undefined): number {
    const note = eventXpNotes.get(playerId);
    if (!note) return 0;
    eventXpNotes.delete(playerId);
    if (!skillName || note.skill.toLowerCase() !== skillName.toLowerCase()) return 0;
    return Date.now() - note.at < NOTE_TTL_MS ? note.xp : 0;
}

// ── Where an event may happen ─────────────────────────────────────────────

/**
 * The places a type may happen at: those pinned on the type in the admin
 * panel, or else wherever that skill's work actually is, read from the game's
 * own data so a new fishing spot or forest is eligible the day it is added.
 */
export async function eligibleLocations(type: { skill: string | null; location_ids: number[] | null }): Promise<number[]> {
    let ids: number[];
    if (type.location_ids?.length) {
        ids = type.location_ids;
    } else {
        ids = await skillLocations(type.skill ?? '');
    }
    if (!ids.length) return [];
    const open = await db('locations').whereIn('id', ids).where({ is_accessible: true }).select('id');
    return open.map((r: { id: number }) => r.id);
}

async function skillLocations(skill: string): Promise<number[]> {
    const ids = (rows: { location_id: number | null }[]) =>
        [...new Set(rows.map((r) => r.location_id).filter((id): id is number => id !== null))];
    const named = async (names: string[]) =>
        (await db('locations').whereIn('name', names).select('id')).map((r: { id: number }) => r.id);

    switch (skill.toLowerCase()) {
        case 'woodcutting':
        case 'mining':
            return ids(await db('resource_nodes').whereRaw('LOWER(skill) = ?', [skill.toLowerCase()]).select('location_id'));
        case 'fishing':
            return ids(await db('fish_species').select('location_id'));
        case 'foraging':
            return ids(await db('foraging_habitats').select('location_id'));
        case 'hunting':
            return ids([
                ...await db('huntable_animals').select('location_id'),
                ...await db('trap_targets').select('location_id'),
            ]);
        case 'farming': {
            const { FARMSTEAD_TOWN } = await import('./farming');
            return named([FARMSTEAD_TOWN]);
        }
        case 'husbandry': {
            const { HUSBANDRY_TOWN } = await import('./husbandry');
            return named([HUSBANDRY_TOWN]);
        }
        case 'smithing':
        case 'carpentry':
        case 'cooking': {
            // The public benches: Emberra's forge, Verdale's workshop, Phoenwick's kitchen.
            const { PUBLIC_STATIONS } = await import('./workstations');
            const station = PUBLIC_STATIONS[skill.toLowerCase()];
            return station ? named([station.location]) : [];
        }
        case 'crafting':
            // Crafting has no public bench: it is done at players' own racks and
            // hearths, which can be anywhere. Towns and workshops are where
            // people gather to do it.
            return ids(await db('locations').whereIn('type', ['town', 'workshop']).select('id as location_id'));
        default:
            return [];
    }
}

// ── Starting and ending ───────────────────────────────────────────────────

const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (Math.max(hi, lo) - lo + 1));

export interface StartOptions {
    locationId: number;
    minutes?: number;
    pool?: number;
    multiplier?: number;
    /** Null when the scheduler starts it; the admin's player id otherwise. */
    startedBy?: number | null;
    /** Overrides the type's start line; {location} is filled in. */
    announcement?: string;
}

/** Start an event of a type at a place. Announced in chat and pushed to clients. */
export async function startEvent(type: any, opts: StartOptions): Promise<any> {
    const location = await db('locations').where({ id: opts.locationId }).first();
    if (!location) throw new Error(`startEvent: no location ${opts.locationId}`);
    const minutes = opts.minutes ?? between(type.min_minutes, type.max_minutes);
    const pool = opts.pool ?? between(type.min_pool, type.max_pool);
    const announcement = String(opts.announcement ?? type.start_text).replace(/\{location\}/g, location.name);

    const [event] = await db('world_events').insert({
        type_id: type.id ?? null,
        name: type.name,
        kind: type.kind ?? 'skill',
        skill: type.skill ?? null,
        location_id: location.id,
        xp_multiplier: opts.multiplier ?? type.xp_multiplier ?? 1.25,
        pool_total: pool,
        pool_left: pool,
        ends_at: new Date(Date.now() + minutes * 60_000),
        started_by: opts.startedBy ?? null,
        announcement,
    }).returning('*');

    await refreshLiveEvents();
    pushToAll(EVENTS_CHANGED, {});
    await announceServer(announcement);
    logger.info(`[events] ${type.name} at ${location.name}: ${minutes} min, pool ${pool}${opts.startedBy ? ` (started by player ${opts.startedBy})` : ''}`);
    return event;
}

/**
 * Pick and start a random event, respecting the scheduler's rules: no more than
 * `maxConcurrent` at once, no type still cooling down, never two for the same
 * skill or the same place. Returns null when nothing fits right now.
 */
export async function spawnRandomEvent(maxConcurrent: number): Promise<any | null> {
    const running = await db('world_events').whereNull('ended_at').where('ends_at', '>', db.fn.now()).select('skill', 'location_id');
    if (running.length >= maxConcurrent) return null;
    const busySkills = new Set(running.map((r: any) => String(r.skill ?? '').toLowerCase()));
    const busyPlaces = new Set(running.map((r: any) => r.location_id));

    const types = await db('world_event_types').where({ is_active: true, kind: 'skill' }).where('weight', '>', 0);
    const recent = await db('world_events')
        .whereNotNull('type_id')
        .select('type_id')
        .max('created_at as last')
        .groupBy('type_id');
    const lastByType = new Map(recent.map((r: any) => [r.type_id, new Date(r.last).getTime()]));

    let candidates = types.filter((t: any) =>
        !busySkills.has(String(t.skill ?? '').toLowerCase())
        && Date.now() - (lastByType.get(t.id) ?? 0) >= t.cooldown_minutes * 60_000);

    // Weighted by rarity; a type with nowhere free to happen is dropped and
    // another drawn.
    while (candidates.length) {
        const total = candidates.reduce((n: number, t: any) => n + t.weight, 0);
        let roll = Math.random() * total;
        const type = candidates.find((t: any) => (roll -= t.weight) < 0) ?? candidates[candidates.length - 1];
        const places = (await eligibleLocations(type)).filter((id) => !busyPlaces.has(id));
        if (places.length) return startEvent(type, { locationId: places[Math.floor(Math.random() * places.length)] });
        candidates = candidates.filter((t: any) => t !== type);
    }
    return null;
}

/** End events whose time is up. Returns how many ended. */
export async function endExpiredEvents(): Promise<number> {
    const ended = await db('world_events')
        .whereNull('ended_at')
        .where('ends_at', '<=', db.fn.now())
        .update({ ended_at: db.fn.now(), end_reason: 'time' })
        .returning('id');
    return ended.length;
}

async function schedulerTick(): Promise<void> {
    let changed = (await endExpiredEvents()) > 0;
    const settings = await db('world_event_settings').where({ id: 1 }).first();
    // A new event with probability 1/average_gap each minute: one every
    // average_gap minutes on average, at no predictable time.
    if (settings?.scheduler_enabled && Math.random() < 1 / Math.max(1, settings.average_gap_minutes)) {
        if (await spawnRandomEvent(settings.max_concurrent)) changed = false; // startEvent already refreshed and pushed
    }
    if (changed) {
        await refreshLiveEvents();
        pushToAll(EVENTS_CHANGED, {});
    }
}

export function startWorldEventScheduler(): void {
    refreshLiveEvents().catch((err) => logger.error(`[events] initial load failed: ${err}`));
    setInterval(() => {
        schedulerTick().catch((err) => logger.error(`[events] scheduler failed: ${err}`));
    }, SCHEDULER_TICK_MS);
}

// ── Listing ───────────────────────────────────────────────────────────────

/** What the Events panel shows: live events, and those that ended in the last day. */
export async function listEvents(): Promise<{ live: any[]; recent: any[] }> {
    const columns = [
        'e.id', 'e.name', 'e.kind', 'e.skill', 'e.xp_multiplier', 'e.pool_total', 'e.pool_left',
        'e.starts_at', 'e.ends_at', 'e.ended_at', 'e.end_reason', 'e.announcement',
        'l.name as location', 'l.id as location_id',
    ];
    const liveRows = await db('world_events as e').leftJoin('locations as l', 'l.id', 'e.location_id')
        .whereNull('e.ended_at').where('e.ends_at', '>', db.fn.now())
        .orderBy('e.ends_at', 'asc').select(columns);
    const recentRows = await db('world_events as e').leftJoin('locations as l', 'l.id', 'e.location_id')
        .whereNotNull('e.ended_at').where('e.ended_at', '>', db.raw("now() - interval '1 day'"))
        .orderBy('e.ended_at', 'desc').limit(20).select(columns);
    const shape = (r: any) => ({
        id: r.id, name: r.name, kind: r.kind, skill: r.skill,
        bonusPercent: Math.round((Number(r.xp_multiplier) - 1) * 100),
        poolTotal: r.pool_total, poolLeft: r.pool_left,
        startsAt: r.starts_at, endsAt: r.ends_at, endedAt: r.ended_at, endReason: r.end_reason,
        location: r.location, locationId: r.location_id, announcement: r.announcement,
    });
    return { live: liveRows.map(shape), recent: recentRows.map(shape) };
}
