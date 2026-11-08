import db from '../db'
import { logger } from '../lib/logger'
import { afterCommit } from '../lib/afterCommit'
import { gameDayKey } from '../lib/gameTime'

// ── The Chronicle: the deed journal (docs/chronicle-spec.md §4) ──────────────
//
// Every place in the game where something worth singing about happens calls
// noteDeed once. That is all this file does in step 1: it writes the journal.
// Scoring, verses and pages come later and read it once a day.
//
// THE RULES. After commit, never inside the action's transaction: given a trx
// the write waits for the commit (afterCommit), so a rolled-back action leaves
// no deed. Never throws: a failed write is logged and dropped, and no action
// ever fails because the Chronicle could not keep up. One statement: no reads
// on the hot path, the filters below are part of the insert itself.
//
// WHO IS LEFT OUT, at write time (§11): guests (counted only as newcomers),
// banned players, and anyone who has asked to be kept out of the book.

export type DeedKind =
    | 'drop_rare' | 'cryptid' | 'world_first_item' | 'trophy' | 'record_fish'
    | 'server_first_level' | 'level_milestone' | 'level_max' | 'total_level_mark'
    | 'newcomers' | 'guest_claimed'
    | 'first_kill' | 'strong_kill' | 'bestiary_mark' | 'death'
    | 'museum_first_give' | 'exhibit_complete' | 'event_winner' | 'event_winner_guild' | 'merchant_arrived'
    | 'mount_raised' | 'field_twenty'
    | 'guild_founded' | 'guild_hall_tier'
    | 'road_first' | 'gem_best_grade' | 'first_craft_tier' | 'feat_rare' | 'quest_first' | 'shop_big_sale'

export interface Deed {
    kind: DeedKind
    /** The player the deed is about, or null for a world deed (a merchant arriving). */
    playerId?: number | null
    /** The guild, when the deed is a guild's (a hall raised, an event won). */
    guildId?: number | null
    /** What it is about: an item, a creature, a skill. */
    subject?: string | null
    /** The numbers and names the verse will need (place, level, chance, weight). */
    data?: Record<string, unknown>
}

/** A strong kill is worth a line when the creature's level is at least this far above the player's combat level. */
export const STRONG_KILL_GAP = 5

/**
 * True the first time a key is seen this game day, in this process. For deeds
 * that can repeat all day (a player grinding a strong creature): the journal
 * wants the first, not three hundred. One process runs the game
 * (ecosystem.config.cjs), so memory is the right place; a restart may let one
 * repeat through, which costs nothing.
 */
const seenToday = { day: '', keys: new Set<string>() }
export function firstToday(key: string): boolean {
    const day = gameDayKey(new Date())
    if (seenToday.day !== day) { seenToday.day = day; seenToday.keys.clear() }
    if (seenToday.keys.has(key)) return false
    seenToday.keys.add(key)
    return true
}

/** Kinds a guest may appear in: only the rolled-up count of new arrivals. */
const GUEST_KINDS = new Set<DeedKind>(['newcomers'])

/** Milestone levels a player's own level-up is noted at (§5). 100 is level_max. */
export const LEVEL_MILESTONES = [50, 75, 90]
/** Total level is noted each time it crosses a multiple of this. */
export const TOTAL_LEVEL_STEP = 250
/** Kills of one creature that are worth a line (matches the Bestiary's later steps). */
export const BESTIARY_MARKS = [250, 1000]
/** A single shop sale this large (gross, in gold) is worth a line (§5, shop_big_sale). */
export const SHOP_BIG_SALE_GOLD = 2000
/** A first crafted on the island counts from this tier up (§5, first_craft_tier). */
export const FIRST_CRAFT_MIN_TIER = 3

/**
 * A road walked to its end (services/gameTick.ts, arrival). The first on the
 * island to walk it gets a line: road_firsts holds one row per road, either
 * way, and the insert that makes it is the gate. Never throws.
 */
export async function noteRoadWalked(playerId: number, fromId: number | null | undefined, toId: number): Promise<void> {
    try {
        if (!fromId || fromId === toId) return
        const key = `${Math.min(fromId, toId)}-${Math.max(fromId, toId)}`
        const [made] = await db('road_firsts').insert({ road_key: key, player_id: playerId }).onConflict('road_key').ignore().returning('road_key')
        if (!made) return
        const places = await db('locations').whereIn('id', [fromId, toId]).select('id', 'name')
        const name = (id: number) => places.find((p: any) => p.id === id)?.name ?? null
        noteDeed(db, { kind: 'road_first', playerId, subject: key, data: { place: name(fromId), place2: name(toId) } })
    } catch (err) {
        logger.warn(`chronicle: road for player ${playerId} failed: ${err}`)
    }
}

/**
 * Note a deed. `x` is whatever the caller wrote with: a transaction (the deed
 * waits for its commit) or the plain connection (written now). Fire and forget.
 */
export function noteDeed(x: unknown, deed: Deed): void {
    afterCommit(x, () => writeDeed(deed))
}

async function writeDeed(deed: Deed): Promise<void> {
    try {
        const row = {
            day_key: gameDayKey(new Date()),
            kind: deed.kind,
            player_id: deed.playerId ?? null,
            guild_id: deed.guildId ?? null,
            subject: deed.subject ?? null,
            data: JSON.stringify(deed.data ?? {}),
        }
        if (!row.player_id) {
            await db('chronicle_deeds').insert(row)
            return
        }
        // One statement: the row goes in only if the player may be sung of.
        const guestOk = GUEST_KINDS.has(deed.kind)
        await db.raw(
            `INSERT INTO chronicle_deeds (day_key, kind, player_id, guild_id, subject, data)
             SELECT ?, ?, p.id, ?, ?, ?::jsonb
               FROM players p
               LEFT JOIN player_settings s ON s.player_id = p.id
              WHERE p.id = ?
                AND coalesce(p.is_banned, false) = false
                AND (? OR coalesce(p.is_guest, false) = false)
                AND coalesce(s.chronicle_opt_out, false) = false`,
            [row.day_key, row.kind, row.guild_id, row.subject, row.data, row.player_id, guestOk],
        )
    } catch (err) {
        logger.warn(`chronicle: could not note ${deed.kind} (player ${deed.playerId ?? '-'}): ${err}`)
    }
}

// ── Finds (called from the tick's completion, services/gameTick.ts) ─────────

export interface Find {
    name: string
    quantity: number
    /** The first time anyone in Talaran has held this item. */
    firstInWorld?: boolean
}

/** The coin find rides in result.drops with a sparkle; it is not a find to sing of. */
const NOT_A_FIND = new Set(['Gold'])

/**
 * Rare finds, trophies and world firsts from one completed action. Only what
 * the action marked notable (or a world first) is passed in; the rarity that
 * weighs it is worked out when the page is written (§6). Runs after the
 * action has committed. Never throws.
 */
export async function noteFinds(playerId: number, locationId: number | null, source: string, finds: Find[]): Promise<void> {
    try {
        const list = finds.filter(f => f?.name && !NOT_A_FIND.has(f.name))
        if (!list.length) return
        const [items, place] = await Promise.all([
            db('items').whereIn('name', list.map(f => f.name)).select('name', 'subtype', 'cryptid'),
            locationId
                ? db('locations').where({ id: locationId }).first('name')
                : db('players as p').join('locations as l', 'l.id', 'p.current_location_id').where('p.id', playerId).first('l.name as name'),
        ])
        const subtype = new Map(items.map((i: any) => [i.name, i.subtype]))
        // A cryptid is flagged on the item (items.cryptid), never guessed from its name.
        const cryptid = new Set(items.filter((i: any) => i.cryptid).map((i: any) => i.name))
        for (const f of list) {
            const kind: DeedKind = f.firstInWorld ? 'world_first_item'
                : cryptid.has(f.name) ? 'cryptid'
                : subtype.get(f.name) === 'trophy' ? 'trophy'
                : 'drop_rare'
            noteDeed(db, {
                kind, playerId, subject: f.name,
                data: { item: f.name, quantity: f.quantity, place: place?.name ?? null, source },
            })
        }
    } catch (err) {
        logger.warn(`chronicle: finds for player ${playerId} failed: ${err}`)
    }
}

// ── Events (services/worldEvents.ts) ────────────────────────────────────────

/**
 * The top player and the top guild of skill events that have just ended, on
 * time or with their pool spent (not when staff call one off). Read from the
 * standings (world_event_participation). Runs after the end has committed.
 * Never throws.
 */
export async function noteEventWinners(eventIds: number[]): Promise<void> {
    for (const eventId of eventIds) {
        try {
            const event = await db('world_events as e').leftJoin('locations as l', 'l.id', 'e.location_id')
                .where('e.id', eventId).where('e.kind', 'skill').first('e.id', 'e.name', 'e.skill', 'l.name as place')
            if (!event) continue
            const data = { event: event.name, skill: event.skill, place: event.place }
            const top = await db('world_event_participation').where({ event_id: eventId })
                .orderBy([{ column: 'actions', order: 'desc' }, { column: 'player_id', order: 'asc' }])
                .first('player_id', 'actions')
            if (top) noteDeed(db, { kind: 'event_winner', playerId: Number(top.player_id), subject: event.name, data: { ...data, actions: Number(top.actions) } })
            const guild: { guild_id: number; actions: string; members: string } | undefined = await db('world_event_participation')
                .where({ event_id: eventId }).whereNotNull('guild_id')
                .groupBy('guild_id')
                .select('guild_id', db.raw('sum(actions) as actions'), db.raw('count(player_id) as members'))
                .orderBy('actions', 'desc').first()
            if (guild) noteDeed(db, { kind: 'event_winner_guild', guildId: Number(guild.guild_id), subject: event.name, data: { ...data, actions: Number(guild.actions), members: Number(guild.members) } })
        } catch (err) {
            logger.warn(`chronicle: event winners for event ${eventId} failed: ${err}`)
        }
    }
}

// ── Reading the journal (admin, step 1) ──────────────────────────────────────

export interface DeedRow {
    id: number
    dayKey: string
    kind: string
    player: string | null
    playerId: number | null
    guild: string | null
    subject: string | null
    data: Record<string, unknown>
    at: string
}

function shape(r: any): DeedRow {
    return {
        id: Number(r.id),
        dayKey: r.day_key,
        kind: r.kind,
        player: r.username ?? null,
        playerId: r.player_id ?? null,
        guild: r.guild_name ?? null,
        subject: r.subject ?? null,
        data: typeof r.data === 'string' ? JSON.parse(r.data) : (r.data ?? {}),
        at: new Date(r.created_at).toISOString(),
    }
}

function deedQuery() {
    return db('chronicle_deeds as d')
        .leftJoin('players as p', 'p.id', 'd.player_id')
        .leftJoin('guilds as g', 'g.id', 'd.guild_id')
        .select('d.*', 'p.username', 'g.name as guild_name')
}

/** One game day's deeds, newest first, with a count per kind. */
export async function deedsForDay(dayKey: string): Promise<{ dayKey: string; total: number; byKind: { kind: string; label: string; n: number }[]; deeds: DeedRow[]; days: { dayKey: string; n: number }[] }> {
    const [rows, kinds, days] = await Promise.all([
        deedQuery().where('d.day_key', dayKey).orderBy('d.id', 'desc').limit(2000),
        db('chronicle_deed_kinds').select('key', 'label'),
        db('chronicle_deeds').select('day_key').count({ n: '*' }).groupBy('day_key').orderBy('day_key', 'desc').limit(60),
    ])
    const label = new Map(kinds.map((k: any) => [k.key, k.label]))
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
    return {
        dayKey,
        total: rows.length,
        byKind: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([kind, n]) => ({ kind, label: String(label.get(kind) ?? kind), n })),
        deeds: rows.map(shape),
        days: days.map((d: any) => ({ dayKey: d.day_key, n: Number(d.n) })),
    }
}

function csvCell(v: unknown): string {
    const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The journal between two game days, inclusive, as CSV (for tuning, §14 step 1). */
export async function deedsCsv(fromDay: string, toDay: string): Promise<string> {
    const rows = await deedQuery()
        .where('d.day_key', '>=', fromDay).where('d.day_key', '<=', toDay)
        .orderBy('d.id', 'asc').limit(200000)
    const head = ['id', 'day', 'at', 'kind', 'player_id', 'player', 'guild', 'subject', 'data']
    const lines = rows.map(shape).map(d => [d.id, d.dayKey, d.at, d.kind, d.playerId, d.player, d.guild, d.subject, d.data].map(csvCell).join(','))
    return [head.join(','), ...lines].join('\n') + '\n'
}

/** Journal rows older than the keep window are trimmed; pages keep what was sung (§10). */
export async function trimDeeds(keepDays: number): Promise<number> {
    const cutoff = gameDayKey(new Date(Date.now() - keepDays * 86400 * 1000))
    return db('chronicle_deeds').where('day_key', '<', cutoff).delete()
}
