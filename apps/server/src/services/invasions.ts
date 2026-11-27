import type { Knex } from 'knex'
import db from '../db'
import { logger } from '../lib/logger'
import { afterCommit } from '../lib/afterCommit'
import { pushToAll, pushToPlayer, pushToRoom } from '../lib/realtime'
import { SERVER_ERROR } from '../lib/serviceResult'
import { tierOfLevel } from '../lib/tiers'
import { announceServer } from './records'
import { creditGoldWithin, lockPlayersInOrder } from './gold'
import { EVENTS_CHANGED } from './worldEvents'

// Invasions (docs/invasions-spec.md). Staff open a tear at a place; creatures
// of one or two realms come through it, and everyone who fights there draws on
// one shared horde. The tear is a world_events row of kind 'invasion' and a
// fighting_spots row of its own, made when the tear is sent (inactive) and
// switched on when it opens, so the fight engine needs to know only that a
// spot belongs to a tear (combatFights.ts takes one from the horde a kill).
//
//   send     staff only (admins, or a moderator with can_run_events). Opens now
//            or later, with an optional warning before. One tear a place;
//            several may run at once at different places, on any island.
//   sweep    every scheduler tick: warns, opens, and closes on time, each by a
//            conditional update so it happens once. Database-driven, so a
//            restart loses nothing (CLAUDE.md §4 rule 15).
//   close    held (the last of the horde killed, in that kill's settle),
//            lost (time), or ended by staff. The spot is switched off; a fight
//            in progress finishes the creature it is on, and then ends.
//   reward   the three who killed most, by their kills, held or lost (Nathan,
//            2026-11-27): a fifth of the XP a kill of each kill they made, all
//            of it to first, 60% to second, 30% to third. Gated on
//            invasion_rewards rows, never on the event row, which a settle
//            locks after the player (see the migration).

export const INVASION_KIND = 'invasion'

/** Each place's share of a kill's worth, first to third. */
export const TOP_THREE_SHARES = [1, 0.6, 0.3]

/** A kill's worth in gold: a fifth of its XP, the value rule (CLAUDE.md §8). */
const XP_PER_GOLD = 5

/** Defaults the Send a tear card fills in (spec §5). */
export const TEAR_DEFAULTS = { minutes: 120, multiplier: 1.25, minKills: 5, hordeByTier: { 1: 300, 2: 250 } as Record<number, number> }

const LIMITS = {
    minutes: [10, 360], horde: [10, 2000], multiplier: [1, 3], minKills: [1, 100],
    warnMinutes: [0, 24 * 60], opensInMinutes: [0, 7 * 24 * 60],
} as const

class Refusal extends Error {}

const whole = (raw: unknown, [lo, hi]: readonly [number, number], label: string): number => {
    const n = Math.floor(Number(raw))
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Refusal(`${label} must be a whole number from ${lo} to ${hi}.`)
    return n
}

const fill = (line: string, values: Record<string, string | number>): string =>
    line.replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all))

/** The tier of an island: its islands row, 1 where it has none (as fishing reads it). */
async function islandTier(x: Knex | Knex.Transaction, region: string | null): Promise<number> {
    if (!region) return 1
    const row = await x('islands').where({ name: region }).first('tier')
    return Number(row?.tier) || 1
}

/** The invaders of these realms that fit an island of this tier: their level's tier is the island's. */
async function rosterFor(x: Knex | Knex.Transaction, realmIds: number[], tier: number): Promise<any[]> {
    const rows = await x('creatures').whereIn('realm_id', realmIds).where({ is_active: true })
        .orderBy(['level', 'name']).select('id', 'name', 'level', 'realm_id')
    return rows.filter((c: any) => tierOfLevel(Number(c.level)) === tier)
}

// ── Sending ──────────────────────────────────────────────────────────────────

export interface SendTearRequest {
    /** One realm's key, or several to send them through one tear. */
    realms?: string[] | string
    locationId?: number | string
    horde?: number | string
    minutes?: number | string
    multiplier?: number | string
    minKills?: number | string
    /** Minutes before opening that the warning goes out; 0 or absent for none. */
    warnMinutes?: number | string
    /** Minutes from now until it opens; 0 or absent for now. */
    opensInMinutes?: number | string
    /** Most kills one player may count; absent for no limit (a tear for newcomers). */
    perPlayerCap?: number | string | null
    /** Rewrite the realm's lines for this tear; {location} is filled in. */
    warningLine?: string
    openLine?: string
}

export type SendTearResult = { ok: true; eventId: number; opensAt: string } | { error: string }

/** Staff send a tear (docs/invasions-spec.md §3). The caller has checked who is asking. */
export async function sendTear(staffId: number, req: SendTearRequest): Promise<SendTearResult> {
    try {
        const keys = [...new Set((Array.isArray(req.realms) ? req.realms : [req.realms]).filter((k): k is string => typeof k === 'string' && !!k))]
        if (!keys.length) throw new Refusal('Choose a realm.')
        const realms = await db('realms').whereIn('key', keys).where({ is_active: true })
        if (realms.length !== keys.length) throw new Refusal('One of those realms is not open to tears.')

        const locationId = whole(req.locationId, [1, 2 ** 31 - 1], 'The place')
        const location = await db('locations').where({ id: locationId }).first('id', 'name', 'region', 'is_accessible', 'islet_kind')
        if (!location || !location.is_accessible) throw new Refusal('No such place.')
        if (location.islet_kind) throw new Refusal('A tear cannot open on an islet.')

        const tier = await islandTier(db, location.region)
        const roster = await rosterFor(db, realms.map((r: any) => r.id), tier)
        if (!roster.length) throw new Refusal(`None of those realms has creatures for ${location.region ?? 'that island'}'s levels.`)

        const minutes = req.minutes == null || req.minutes === '' ? TEAR_DEFAULTS.minutes : whole(req.minutes, LIMITS.minutes, 'The length')
        const horde = req.horde == null || req.horde === '' ? (TEAR_DEFAULTS.hordeByTier[tier] ?? 250) : whole(req.horde, LIMITS.horde, 'The horde')
        const minKills = req.minKills == null || req.minKills === '' ? TEAR_DEFAULTS.minKills : whole(req.minKills, LIMITS.minKills, 'The minimum kills')
        const warnMinutes = req.warnMinutes == null || req.warnMinutes === '' ? 0 : whole(req.warnMinutes, LIMITS.warnMinutes, 'The warning')
        const opensIn = req.opensInMinutes == null || req.opensInMinutes === '' ? 0 : whole(req.opensInMinutes, LIMITS.opensInMinutes, 'The opening time')
        const multiplier = req.multiplier == null || req.multiplier === '' ? TEAR_DEFAULTS.multiplier : Number(req.multiplier)
        if (!Number.isFinite(multiplier) || multiplier < LIMITS.multiplier[0] || multiplier > LIMITS.multiplier[1]) {
            throw new Refusal(`The XP bonus must be from ${LIMITS.multiplier[0]} to ${LIMITS.multiplier[1]}.`)
        }
        const cap = req.perPlayerCap == null || req.perPlayerCap === '' ? null : whole(req.perPlayerCap, [1, LIMITS.horde[1]], 'The cap')

        const first = realms.find((r: any) => r.key === keys[0])
        const warningLine = fill(String(req.warningLine || first.warning_line), { location: location.name })
        const openLine = fill(String(req.openLine || first.open_line), { location: location.name })
        const name = realms.length === 1 ? `A tear onto ${first.name}` : `A tear onto ${realms.map((r: any) => r.name).join(' and ')}`

        const opensAt = new Date(Date.now() + opensIn * 60_000)
        const eventId = await db.transaction(async (trx) => {
            // One tear a place at a time, sent or open (Nathan, 2026-11-27): an
            // event may run several at once, each at a place of its own, on any
            // island. The settings row serializes two staff sending at once.
            await trx('world_event_settings').where({ id: 1 }).forUpdate().first()
            const busy = await trx('world_events').where({ kind: INVASION_KIND, location_id: location.id })
                .whereNull('ended_at').first('id')
            if (busy) throw new Refusal(`A tear is already sent or open over ${location.name}.`)

            const [event] = await trx('world_events').insert({
                name, kind: INVASION_KIND, skill: null, location_id: location.id,
                xp_multiplier: multiplier, pool_total: horde, pool_left: horde,
                starts_at: opensAt, ends_at: new Date(opensAt.getTime() + minutes * 60_000),
                warn_at: warnMinutes > 0 ? new Date(opensAt.getTime() - warnMinutes * 60_000) : null,
                started_by: staffId, announcement: openLine,
                // The first realm chosen speaks for a tear onto two: its lines open and close it.
                realm_id: first.id,
                min_kills: minKills, per_player_cap: cap,
                // Said by the sweep: the warning when warn_at comes, the
                // announcement when it opens.
                warning_text: warnMinutes > 0 ? warningLine : null,
            }).returning('*')

            const [spot] = await trx('fighting_spots').insert({
                key: `tear_${event.id}`, location_id: location.id,
                name: `The Tear over ${location.name}`, kind: 'chosen',
                description: realms.length === 1 ? first.description : realms.map((r: any) => r.description).filter(Boolean).join(' '),
                display_order: -1, is_active: false, world_event_id: event.id,
            }).returning('id')
            await trx('fighting_spot_creatures').insert(roster.map((c: any) => ({ spot_id: spot.id ?? spot, creature_id: c.id, weight: 1 })))
            return event.id as number
        })

        logger.info(`[invasions] staff ${staffId} sent ${name} to ${location.name}: horde ${horde}, ${minutes} min, opens ${opensAt.toISOString()}`)
        await invasionSweep()
        return { ok: true, eventId, opensAt: opensAt.toISOString() }
    } catch (err) {
        if (err instanceof Refusal) return { error: err.message }
        logger.error(`[invasions] send failed: ${err}`)
        return { error: SERVER_ERROR }
    }
}

// ── The sweep ────────────────────────────────────────────────────────────────

/** Warn, open, close on time, and pay anything left unpaid. Run from the world-events scheduler. */
export async function invasionSweep(): Promise<void> {
    let changed = false

    // Warnings due: said once, by whoever flips warned_at.
    const warned = await db('world_events').where({ kind: INVASION_KIND })
        .whereNull('ended_at').whereNull('warned_at').whereNull('opened_at')
        .whereNotNull('warn_at').where('warn_at', '<=', db.fn.now())
        .update({ warned_at: db.fn.now() }).returning(['id', 'warning_text'])
    for (const row of warned) {
        changed = true
        if (row.warning_text) await announceServer(row.warning_text)
    }

    // Tears due to open.
    const opened = await db('world_events').where({ kind: INVASION_KIND })
        .whereNull('ended_at').whereNull('opened_at').where('starts_at', '<=', db.fn.now())
        .update({ opened_at: db.fn.now() }).returning(['id', 'location_id', 'announcement', 'ends_at'])
    for (const row of opened) {
        changed = true
        await db('fighting_spots').where({ world_event_id: row.id }).update({ is_active: true })
        if (row.announcement) await announceServer(row.announcement)
        pushToRoom(`location_${row.location_id}`, 'tear_changed', { locationId: row.location_id, open: true })
    }

    // Tears whose time is up, held or not.
    const due = await db('world_events').where({ kind: INVASION_KIND })
        .whereNull('ended_at').where('ends_at', '<=', db.fn.now()).select('id')
    for (const row of due) {
        if (await closeTear(row.id, 'time')) changed = true
    }

    // Closed tears whose top three were never paid (a crash between the close
    // and the payment): paying is idempotent, so this only finishes the job.
    const unpaid = await db('world_events').where({ kind: INVASION_KIND })
        .whereNotNull('ended_at').whereNull('rewards_paid_at')
        .where('ended_at', '>', db.raw("now() - interval '1 day'")).select('id')
    for (const row of unpaid) await finishTear(row.id)

    if (changed) pushToAll(EVENTS_CHANGED, {})
}

// ── Closing ──────────────────────────────────────────────────────────────────

/**
 * End a tear that has not ended: by time, or by staff. Its spot is switched
 * off in the same transaction; the top three are paid after. Returns false
 * when it had already ended (someone else closed it). A held tear is closed
 * by the settle of its last kill (closeHeldWithin), not here.
 */
export async function closeTear(eventId: number, reason: 'time' | 'admin'): Promise<boolean> {
    const closed = await db.transaction(async (trx) => {
        const [row] = await trx('world_events').where({ id: eventId, kind: INVASION_KIND }).whereNull('ended_at')
            .update({ ended_at: trx.fn.now(), end_reason: reason }).returning(['id', 'location_id'])
        if (!row) return null
        await trx('fighting_spots').where({ world_event_id: eventId }).update({ is_active: false })
        return row
    })
    if (!closed) return false
    pushToRoom(`location_${closed.location_id}`, 'tear_changed', { locationId: closed.location_id, open: false })
    await finishTear(eventId)
    return true
}

/**
 * The settle of the kill that took the horde's last one: end the tear inside
 * that settle's transaction, and pay once it commits.
 */
export async function closeHeldWithin(trx: Knex.Transaction, eventId: number): Promise<void> {
    const [row] = await trx('world_events').where({ id: eventId }).whereNull('ended_at')
        .update({ ended_at: trx.fn.now(), end_reason: 'pool' }).returning(['id', 'location_id'])
    if (!row) return
    await trx('fighting_spots').where({ world_event_id: eventId }).update({ is_active: false })
    afterCommit(trx, () => {
        pushToRoom(`location_${row.location_id}`, 'tear_changed', { locationId: row.location_id, open: false })
        pushToAll(EVENTS_CHANGED, {})
        finishTear(eventId).catch((err) => logger.error(`[invasions] finish ${eventId} failed: ${err}`))
    })
}

/** The top three as the tear closed: at least its minimum kills, most first, ties to whoever got there first. */
export async function topThree(x: Knex | Knex.Transaction, eventId: number, minKills: number): Promise<{ playerId: number; kills: number; xp: number }[]> {
    const rows = await x('world_event_participation').where({ event_id: eventId }).where('actions', '>=', Math.max(1, minKills))
        .orderBy([{ column: 'actions', order: 'desc' }, { column: 'last_at', order: 'asc' }, { column: 'player_id', order: 'asc' }])
        .limit(TOP_THREE_SHARES.length).select('player_id', 'actions', 'invasion_xp')
    return rows.map((r: any) => ({ playerId: Number(r.player_id), kills: Number(r.actions), xp: Number(r.invasion_xp) }))
}

/** Gold for a place: the share of a fifth of the XP its kills were worth, at least 1. */
export function rewardFor(place: number, xp: number): number {
    return Math.max(1, Math.round((xp / XP_PER_GOLD) * TOP_THREE_SHARES[place - 1]))
}

/**
 * Pay the top three and say how it went. Idempotent: each payment is gated on
 * inserting its invasion_rewards row, and only what this call inserted is paid.
 */
export async function finishTear(eventId: number): Promise<void> {
    try {
        const event = await db('world_events as e').leftJoin('locations as l', 'l.id', 'e.location_id')
            .where('e.id', eventId).where('e.kind', INVASION_KIND).whereNotNull('e.ended_at')
            .first('e.id', 'e.end_reason', 'e.min_kills', 'e.realm_id', 'e.rewards_paid_at', 'l.name as place')
        if (!event || event.rewards_paid_at) return

        const top = await topThree(db, eventId, Number(event.min_kills ?? TEAR_DEFAULTS.minKills))
        const paid = await db.transaction(async (trx) => {
            await lockPlayersInOrder(trx, top.map(t => t.playerId))
            const out: { playerId: number; place: number; gold: number; kills: number }[] = []
            for (const [i, t] of top.entries()) {
                const place = i + 1
                const gold = rewardFor(place, t.xp)
                const inserted = await trx('invasion_rewards')
                    .insert({ event_id: eventId, player_id: t.playerId, place, kills: t.kills, gold })
                    .onConflict(['event_id', 'player_id']).ignore().returning('player_id')
                if (!inserted.length) continue
                await creditGoldWithin(trx, { playerId: t.playerId, amount: gold, reason: 'invasion_reward', refType: 'world_event', refId: eventId })
                out.push({ playerId: t.playerId, place, gold, kills: t.kills })
            }
            const [flip] = await trx('world_events').where({ id: eventId }).whereNull('rewards_paid_at')
                .update({ rewards_paid_at: trx.fn.now() }).returning('id')
            return flip ? out : null
        })
        if (!paid) return

        // Said once: by the call that flipped rewards_paid_at.
        const held = event.end_reason === 'pool'
        const realm = event.realm_id ? await db('realms').where({ id: event.realm_id }).first('held_line', 'lost_line') : null
        const count = Number((await db('world_event_participation').where({ event_id: eventId }).count({ n: '*' }).first())?.n ?? 0)
        const leader = top.length ? await db('players').where({ id: top[0].playerId }).first('username') : null
        const line = held
            ? (realm?.held_line ?? 'The tear over {location} has closed. {count} fought there, and {top} brought down the most.')
            : (realm?.lost_line ?? 'The tear over {location} has closed on its own, and the horde went back through it.')
        if (event.end_reason !== 'admin' || count > 0) {
            await announceServer(fill(line, { location: event.place ?? 'somewhere', count, top: leader?.username ?? 'nobody' }))
        }
        for (const p of paid) {
            pushToPlayer(p.playerId, 'invasion_reward', { place: p.place, gold: p.gold, kills: p.kills, location: event.place, held })
        }
        pushToAll(EVENTS_CHANGED, {})
        logger.info(`[invasions] tear ${eventId} ${held ? 'held' : `closed (${event.end_reason})`}; paid ${paid.map(p => `${p.playerId}:${p.gold}`).join(', ') || 'nobody'}`)
    } catch (err) {
        logger.error(`[invasions] finish ${eventId} failed: ${err}`)
    }
}

// ── The fight's side (services/combatFights.ts) ─────────────────────────────

export interface HordeTake {
    /** The kill counted against the horde (a tear open with some left). */
    counted: boolean
    /** The tear's XP bonus for this kill: its multiplier when counted, else 1. */
    multiplier: number
    /** The tear is over: the fight ends after this kill. */
    closed: boolean
    /** What is left of the horde, and what came through, for the kill card. */
    left: number | null
    total: number | null
}

/**
 * One kill at a tear's spot, inside the settle's transaction (lock order:
 * the fight's own rows first, this event row last, touched by one statement).
 * Takes one from the horde, counts the kill for the player, and closes the
 * tear on its last one.
 */
export async function takeFromHordeWithin(
    trx: Knex.Transaction, eventId: number, playerId: number, creatureXp: number, killedAt: Date,
): Promise<HordeTake> {
    const { rows } = await trx.raw(`
        UPDATE world_events SET pool_left = pool_left - 1
        WHERE id = ? AND kind = ? AND ended_at IS NULL AND opened_at IS NOT NULL
          AND pool_left > 0 AND ends_at > now()
        RETURNING pool_left, pool_total, xp_multiplier, per_player_cap`, [eventId, INVASION_KIND])
    const taken = rows[0]
    if (!taken) return { counted: false, multiplier: 1, closed: true, left: null, total: null }

    const guild = await trx('players').where({ id: playerId }).first('guild_id')
    const [mine] = await trx('world_event_participation')
        .insert({ event_id: eventId, player_id: playerId, guild_id: guild?.guild_id ?? null, actions: 1, invasion_xp: Math.max(0, Math.round(creatureXp)), last_at: killedAt })
        .onConflict(['event_id', 'player_id'])
        .merge({
            actions: trx.raw('world_event_participation.actions + 1'),
            invasion_xp: trx.raw('world_event_participation.invasion_xp + EXCLUDED.invasion_xp'),
            last_at: trx.raw('EXCLUDED.last_at'),
            guild_id: trx.raw('EXCLUDED.guild_id'),
        })
        .returning('actions')
    // A capped tear (for newcomers): past the cap a kill is the creature's
    // alone. Given back to the horde, and not counted.
    const cap = taken.per_player_cap == null ? null : Number(taken.per_player_cap)
    if (cap !== null && Number(mine.actions) > cap) {
        await trx('world_events').where({ id: eventId }).increment('pool_left', 1)
        await trx('world_event_participation').where({ event_id: eventId, player_id: playerId }).update({
            actions: trx.raw('actions - 1'), invasion_xp: trx.raw('invasion_xp - ?', [Math.max(0, Math.round(creatureXp))]),
        })
        return { counted: false, multiplier: 1, closed: false, left: null, total: null }
    }

    const left = Number(taken.pool_left)
    if (left === 0) await closeHeldWithin(trx, eventId)
    return { counted: true, multiplier: Number(taken.xp_multiplier) || 1, closed: left === 0, left, total: Number(taken.pool_total) }
}

// ── What staff and players see ───────────────────────────────────────────────

/** The realms and their creatures, for the Send a tear card. */
export async function realmsForStaff(): Promise<any[]> {
    const realms = await db('realms').orderBy('id').select('id', 'key', 'name', 'description', 'warning_line', 'open_line', 'is_active')
    const creatures = await db('creatures').whereNotNull('realm_id').where({ is_active: true })
        .orderBy(['level', 'name']).select('realm_id', 'name', 'level')
    return realms.map((r: any) => ({
        ...r,
        creatures: creatures.filter((c: any) => c.realm_id === r.id).map((c: any) => ({ name: c.name, level: Number(c.level), tier: tierOfLevel(Number(c.level)) })),
    }))
}

/** A tear's standings: kills by player, most first (the live card and the Events panel). */
export async function tearStandings(eventId: number, limit = 10): Promise<{ name: string; kills: number }[]> {
    const rows = await db('world_event_participation as p').join('players as pl', 'pl.id', 'p.player_id')
        .where('p.event_id', eventId)
        .orderBy([{ column: 'p.actions', order: 'desc' }, { column: 'p.last_at', order: 'asc' }])
        .limit(limit).select('pl.username as name', 'p.actions')
    return rows.map((r: any) => ({ name: r.name, kills: Number(r.actions) }))
}
