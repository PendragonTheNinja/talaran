import db from '../db'
import { gameDayKey } from '../lib/gameTime'
import { dayTitle, renderVerse, seededUnit } from '../lib/chronicleVerse'
import { todaySoFar } from './chronicleComposer'

// ── The Chronicle, step 3: reading the book at the Salty Sloth (docs/chronicle-spec.md §2) ──
//
// Everything here reads what the composer froze; nothing is computed but the
// today-so-far lines (cached by the composer) and Wenna's greeting.

export interface BookLine {
    section: string
    text: string
    struck: boolean
    /** Players this line names, by the name they carry now, so the page can link them. */
    names: { playerId: number; name: string }[]
    /** Guilds this line names. */
    guilds: { guildId: number; name: string }[]
}

export interface BookPage {
    dayKey: string
    title: string
    headline: string | null
    quiet: boolean
    lines: BookLine[]
    /** The written days either side, for the arrows. */
    prev: string | null
    next: string | null
}

/** The tavern at a location, if there is one. */
export async function tavernAt(locationId: number): Promise<{ id: number; name: string; description: string | null } | null> {
    const t = await db('taverns').where({ location_id: locationId }).first('id', 'name', 'description')
    return t ?? null
}

/** Wenna's greeting for today: one of her lines, the same all day. */
async function greeting(): Promise<string | null> {
    const lines = await db('chronicle_verses').where({ kind: 'greeting', enabled: true }).orderBy('id').select('id', 'text')
    if (!lines.length) return null
    const day = gameDayKey()
    const pick = lines[Math.floor(seededUnit(`greeting:${day}`) * lines.length)]
    return renderVerse(pick.text, {}, `greeting:${day}`)
}

/** The newest written page's day, title and headline, or null before the first. */
async function latestDay(): Promise<{ dayKey: string; title: string; headline: string | null } | null> {
    const d = await db('chronicle_days').where({ status: 'done' }).orderBy('day_key', 'desc').first('day_key', 'headline')
    return d ? { dayKey: d.day_key, title: dayTitle(d.day_key), headline: d.headline } : null
}

/** What the Wenna tab shows: her greeting, today's tidings so far (no names), and the last page's headline. */
export async function tavernFront(locationId: number) {
    const tavern = await tavernAt(locationId)
    if (!tavern) return null
    const [hello, today, latest] = await Promise.all([greeting(), todaySoFar(), latestDay()])
    return { tavern, greeting: hello, today, latest }
}

/** Every written day, newest first, for the date picker. */
export async function bookDays(): Promise<{ dayKey: string; title: string; headline: string | null }[]> {
    const rows = await db('chronicle_days').where({ status: 'done' }).orderBy('day_key', 'desc').limit(1000).select('day_key', 'headline')
    return rows.map((r: any) => ({ dayKey: r.day_key, title: dayTitle(r.day_key), headline: r.headline }))
}

/** One page with its names linked, or null when the day has none. A missing day opens the newest. */
export async function bookPage(dayKey: string | null): Promise<BookPage | null> {
    const day = dayKey
        ? await db('chronicle_days').where({ day_key: dayKey, status: 'done' }).first()
        : await db('chronicle_days').where({ status: 'done' }).orderBy('day_key', 'desc').first()
    if (!day) return null
    const key = day.day_key
    const [lines, mentions, prev, next] = await Promise.all([
        db('chronicle_lines').where({ day_key: key }).orderBy('position').select('id', 'section', 'text', 'struck_at'),
        db('chronicle_mentions as m')
            .leftJoin('players as p', 'p.id', 'm.player_id')
            .leftJoin('guilds as g', 'g.id', 'm.guild_id')
            .where('m.day_key', key)
            .select('m.line_id', 'm.player_id', 'm.guild_id', 'p.username', 'g.name as guild_name'),
        db('chronicle_days').where({ status: 'done' }).where('day_key', '<', key).orderBy('day_key', 'desc').first('day_key'),
        db('chronicle_days').where({ status: 'done' }).where('day_key', '>', key).orderBy('day_key', 'asc').first('day_key'),
    ])
    return {
        dayKey: key,
        title: dayTitle(key),
        headline: day.headline,
        quiet: !!day.quiet,
        prev: prev?.day_key ?? null,
        next: next?.day_key ?? null,
        lines: lines.map((l: any) => {
            const here = l.struck_at ? [] : mentions.filter((m: any) => m.line_id === l.id)
            return {
                section: l.section,
                text: l.struck_at ? 'A line here was struck from the book.' : l.text,
                struck: !!l.struck_at,
                names: here.filter((m: any) => m.player_id && m.username).map((m: any) => ({ playerId: Number(m.player_id), name: m.username })),
                guilds: here.filter((m: any) => m.guild_id && m.guild_name).map((m: any) => ({ guildId: Number(m.guild_id), name: m.guild_name })),
            }
        }),
    }
}

/**
 * The days a player or a guild was named, newest first: "in the lines" when a
 * line of its own named them, otherwise the long roll. Looked up by name.
 */
export async function namedDays(who: { player?: string; guild?: string }): Promise<{ name: string; days: { dayKey: string; title: string; inLines: boolean }[] } | null> {
    let row: { id: number; name: string } | undefined
    let column: 'player_id' | 'guild_id'
    if (who.player) {
        const p = await db('players').whereRaw('lower(username) = lower(?)', [who.player]).first('id', 'username')
        row = p ? { id: Number(p.id), name: p.username } : undefined
        column = 'player_id'
    } else if (who.guild) {
        const g = await db('guilds').whereRaw('lower(name) = lower(?)', [who.guild]).first('id', 'name')
        row = g ? { id: Number(g.id), name: g.name } : undefined
        column = 'guild_id'
    } else return null
    if (!row) return null
    const rows = await db('chronicle_mentions as m')
        .join('chronicle_days as d', 'd.day_key', 'm.day_key')
        .leftJoin('chronicle_lines as l', 'l.id', 'm.line_id')
        .where(`m.${column}`, row.id).where('d.status', 'done').whereNull('l.struck_at')
        .groupBy('m.day_key')
        .orderBy('m.day_key', 'desc')
        .select('m.day_key', db.raw('bool_or(m.in_lines) as in_lines'))
    return { name: row.name, days: rows.map((r: any) => ({ dayKey: r.day_key, title: dayTitle(r.day_key), inLines: !!r.in_lines })) }
}

// ── "Wenna sang of you" (step 4, §2 Elsewhere) ──────────────────────────────

/** How far back an unseen notice still counts: past a week, it is old news. */
const NOTICE_DAYS = 7

/**
 * The newest page that named this player since they last put the notice away,
 * within a week: a line of their own, or the long roll. Null when there is none.
 */
export async function chronicleNotice(playerId: number): Promise<{ dayKey: string; title: string; inLines: boolean } | null> {
    const player = await db('players').where({ id: playerId }).first('chronicle_seen_day')
    const since = player?.chronicle_seen_day ?? ''
    const oldest = new Date(Date.now() - NOTICE_DAYS * 86400_000).toISOString().slice(0, 10)
    const row = await db('chronicle_mentions as m')
        .join('chronicle_days as d', 'd.day_key', 'm.day_key')
        .leftJoin('chronicle_lines as l', 'l.id', 'm.line_id')
        .where({ 'm.player_id': playerId, 'd.status': 'done' })
        .whereNull('l.struck_at')
        .where('m.day_key', '>', since)
        .where('m.day_key', '>=', oldest)
        .groupBy('m.day_key')
        .orderBy('m.day_key', 'desc')
        .first('m.day_key', db.raw('bool_or(m.in_lines) as in_lines'))
    return row ? { dayKey: row.day_key, title: dayTitle(row.day_key), inLines: !!row.in_lines } : null
}

/** Put the notice away up to this day (never moves backwards). */
export async function seeChronicleNotice(playerId: number, dayKey: string): Promise<void> {
    await db('players').where({ id: playerId })
        .where((q) => q.whereNull('chronicle_seen_day').orWhere('chronicle_seen_day', '<', dayKey))
        .update({ chronicle_seen_day: dayKey })
}
