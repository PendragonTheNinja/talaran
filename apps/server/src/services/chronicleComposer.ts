import { createHash } from 'crypto'
import type { Knex } from 'knex'
import db from '../db'
import { logger } from '../lib/logger'
import { gameDayKey, startOfGameDay, nextGameMidnight } from '../lib/gameTime'
import { addDays, balladStanzas, canFill, countWord, dayTitle, nameList, renderVerse, seededUnit, Slots } from '../lib/chronicleVerse'
import { STRONG_KILL_GAP, trimDeeds } from './chronicle'
import { announceServer } from './records'
import { pushToPlayer } from '../lib/realtime'
import { evaluateFeats } from './feats'
import { trueRumours } from './chronicleRumours'

/** Paid ballads sung on one page at most (§9); a third waits a day. */
export const BALLADS_PER_PAGE = 2

// ── The Chronicle, step 2: Wenna writes the page (docs/chronicle-spec.md §3, §6, §8, §12) ──
//
// Once a game day is over, its deeds are read once, scored, and the best are
// set down as one page in Wenna's voice. The page is frozen: its lines,
// who they name and which verses were sung are stored, and reading a page
// never computes anything.
//
// Composing the same day twice gives the same page: every chance in here is
// seeded by the day and the deed (never Math.random()), which is what makes
// the admin dry run a true preview.
//
// Writing pages is OFF until it is turned on (chronicle_settings
// composer_enabled), so no page is frozen before the weights are tuned. The
// dry run works either way.

// ── Settings ────────────────────────────────────────────────────────────────

export interface ChronicleSettings {
    composer_enabled: boolean
    headline_threshold: number
    headline_max: number
    island_lines: number
    guild_lines: number
    fallen_lines: number
    roll_max: number
    deed_keep_days: number
    quiet_below: number
    death_heavy_stacks: number
    rumour_chance: number
    rumour_cooldown_days: number
    ballad_price: number
    ballad_cooldown_days: number
}

const DEFAULTS: ChronicleSettings = {
    composer_enabled: false, headline_threshold: 60, headline_max: 2, island_lines: 8, guild_lines: 3,
    fallen_lines: 2, roll_max: 40, deed_keep_days: 30, quiet_below: 4, death_heavy_stacks: 10,
    rumour_chance: 50, rumour_cooldown_days: 14, ballad_price: 10000, ballad_cooldown_days: 7,
}

export async function chronicleSettings(x: Knex | Knex.Transaction = db): Promise<ChronicleSettings> {
    const rows = await x('chronicle_settings').select('key', 'value')
    const out: any = { ...DEFAULTS }
    for (const r of rows) {
        const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
        if (r.key in out) out[r.key] = typeof DEFAULTS[r.key as keyof ChronicleSettings] === 'boolean' ? !!v : Number(v)
    }
    return out
}

export async function setComposerEnabled(on: boolean): Promise<void> {
    await db('chronicle_settings').insert({ key: 'composer_enabled', value: JSON.stringify(on) })
        .onConflict('key').merge({ value: JSON.stringify(on) })
}

// ── What a page is ──────────────────────────────────────────────────────────

export type Section = 'heading' | 'headline' | 'island' | 'guilds' | 'fallen' | 'maker' | 'quiet' | 'roll' | 'rumour' | 'signoff'

export interface PageLine {
    section: Section
    text: string
    deedKind: string | null
    verseId: number | null
    /** Named in the line itself. */
    playerIds: number[]
    guildIds: number[]
    /** Named only in the long roll. */
    rollPlayerIds?: number[]
    /** What a rumour was about, for its cooldown (§15). */
    subject?: string | null
    /** A paid ballad this line sings (§9): marked sung when the page is kept. */
    balladId?: number
}

export interface ScoredDeed {
    id: number
    kind: string
    section: string
    player: string | null
    guild: string | null
    subject: string | null
    score: number
    told: boolean
}

export interface Page {
    dayKey: string
    title: string
    lines: PageLine[]
    headline: string | null
    quiet: boolean
    /** Kinds whose every verse was on cooldown (or which had none that fit): more verses wanted. */
    thin: string[]
    /** For the dry run: every deed as scored, best first. */
    scored: ScoredDeed[]
}

// ── Reading a day ───────────────────────────────────────────────────────────

interface Kind { key: string; section: string; base_weight: number; max_per_page: number | null; enabled: boolean }

interface Deed {
    id: number
    kind: string
    section: string
    playerId: number | null
    guildId: number | null
    subject: string | null
    data: Record<string, any>
    n: number
    slots: Slots
    score: number
}

/** The game-day window of a day key: from its midnight to the next. */
function dayWindow(dayKey: string): { start: Date; end: Date } {
    const [y, m, d] = dayKey.split('-').map(Number)
    const noon = new Date(Date.UTC(y, m - 1, d, 17))   // midday in the game's zone, any time of year
    return { start: startOfGameDay(noon), end: nextGameMidnight(noon) }
}

const DROP_KINDS = new Set(['drop_rare', 'cryptid', 'world_first_item', 'trophy'])
const ROLLED_UP = new Set(['newcomers', 'guest_claimed'])

/** The rarest chance an item drops at anywhere, as a fraction (1/250 = 0.004). */
async function dropChances(names: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!names.length) return out
    const rows = await db('drop_table_entries as e').join('items as i', 'i.id', 'e.item_id')
        .whereIn('i.name', names).where('e.is_active', true)
        .select('i.name', 'e.chance_one_in', 'e.chance_percent')
    for (const r of rows) {
        const chance = r.chance_percent !== null && r.chance_percent !== undefined
            ? Number(r.chance_percent) / 100
            : 1 / Math.max(1, Number(r.chance_one_in))
        if (chance > 0 && (!out.has(r.name) || chance < out.get(r.name)!)) out.set(r.name, chance)
    }
    return out
}

/** How much bigger than usual a deed is (§6, magnitude). */
function magnitude(d: Deed): number {
    const x = d.data
    switch (d.kind) {
        case 'level_milestone': return Math.max(1, Number(x.level ?? 50) / 50)
        case 'total_level_mark': return 1 + Number(x.total ?? 0) / 1000
        case 'strong_kill': return 1 + Math.max(0, Number(x.creatureLevel ?? 0) - Number(x.combatLevel ?? 0) - STRONG_KILL_GAP) / 10
        case 'death': return 1 + Math.max(0, Number(x.creatureLevel ?? 0) - Number(x.combatLevel ?? 0)) / 20
        case 'bestiary_mark': return Math.sqrt(Number(x.kills ?? 250) / 250)
        case 'mount_raised': return 1 + Number(x.level ?? 0) / 50
        case 'record_fish': {
            const prev = Number(x.previousLb ?? 0)
            return prev > 0 ? Math.min(2, 1 + (Number(x.weightLb ?? prev) - prev) / prev) : 1
        }
        case 'newcomers': case 'guest_claimed': return Math.min(3, 1 + Math.log10(Math.max(1, d.n)))
        default: return 1
    }
}

function formatLb(lb: unknown): string | null {
    const n = Number(lb)
    if (!Number.isFinite(n) || n <= 0) return null
    return `${n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100} lb`
}

async function readDay(dayKey: string, settings: ChronicleSettings, names: boolean) {
    const [kindRows, rows, yesterday] = await Promise.all([
        db('chronicle_deed_kinds').select('key', 'section', 'base_weight', 'max_per_page', 'enabled'),
        db('chronicle_deeds').where({ day_key: dayKey }).orderBy('id'),
        db('chronicle_deeds').where({ day_key: addDays(dayKey, -1) }).whereNotNull('player_id').select('player_id', 'kind', 'subject'),
    ])
    const kinds = new Map<string, Kind>(kindRows.map((k: any) => [k.key, { ...k, base_weight: Number(k.base_weight) }]))
    const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : (v ?? {})) as Record<string, any>

    // Who may be named, as of now (§11): opted out, banned or a guest since is left unsaid.
    const playerIds = new Set<number>()
    for (const r of rows) {
        if (r.player_id) playerIds.add(Number(r.player_id))
        const by = parse(r.data).byPlayerId
        if (by) playerIds.add(Number(by))
    }
    const players = playerIds.size
        ? await db('players as p').leftJoin('player_settings as s', 's.player_id', 'p.id')
            .whereIn('p.id', [...playerIds])
            .select('p.id', 'p.username', 'p.is_banned', 'p.is_guest', 's.chronicle_opt_out')
        : []
    const nameable = new Map<number, string>()
    for (const p of players) {
        if (!p.is_banned && !p.is_guest && !p.chronicle_opt_out) nameable.set(Number(p.id), p.username)
    }

    const guildIds = [...new Set(rows.map((r: any) => r.guild_id).filter(Boolean).map(Number))]
    const guilds = guildIds.length
        ? await db('guilds as g').whereIn('g.id', guildIds)
            .select('g.id', 'g.name', 'g.tag', db.raw('(SELECT count(*) FROM players m WHERE m.guild_id = g.id) as members'))
        : []
    const guildBy = new Map(guilds.map((g: any) => [Number(g.id), g]))

    const placeIds = [...new Set(rows.map((r: any) => parse(r.data).placeId).filter(Boolean).map(Number))]
    const places = placeIds.length ? await db('locations').whereIn('id', placeIds).select('id', 'name') : []
    const placeBy = new Map(places.map((p: any) => [Number(p.id), p.name]))

    const dropNames = rows.filter((r: any) => DROP_KINDS.has(r.kind)).map((r: any) => String(parse(r.data).item ?? r.subject ?? ''))
    const chances = await dropChances([...new Set(dropNames.filter(Boolean))])

    // Deaths are told only when they are a story (§6): the player's first, to
    // something well above them, or a heavy loss; never the same player twice
    // in three days.
    const deathPlayers = [...new Set(rows.filter((r: any) => r.kind === 'death' && r.player_id).map((r: any) => Number(r.player_id)))]
    const [deathStats, recentlyFallen] = deathPlayers.length
        ? await Promise.all([
            db('player_stats').whereIn('player_id', deathPlayers).select('player_id', 'total_combat_deaths'),
            db('chronicle_mentions as m').join('chronicle_lines as l', 'l.id', 'm.line_id')
                .where('l.section', 'fallen').whereIn('m.player_id', deathPlayers)
                .whereIn('l.day_key', [addDays(dayKey, -1), addDays(dayKey, -2)]).select('m.player_id'),
        ])
        : [[], []]
    const deathsToday = new Map<number, number>()
    for (const r of rows) if (r.kind === 'death' && r.player_id) deathsToday.set(Number(r.player_id), (deathsToday.get(Number(r.player_id)) ?? 0) + 1)
    const firstDeath = new Set(deathStats.filter((s: any) => Number(s.total_combat_deaths) <= (deathsToday.get(Number(s.player_id)) ?? 0)).map((s: any) => Number(s.player_id)))
    const fallenLately = new Set(recentlyFallen.map((r: any) => Number(r.player_id)))

    const seenYesterday = new Set(yesterday.map((r: any) => `${r.player_id}:${r.kind}:${r.subject ?? ''}`))
    const date = dayTitle(dayKey)

    const deeds: Deed[] = []
    const rolled = new Map<string, number>()
    for (const r of rows) {
        const kind = kinds.get(r.kind)
        if (!kind || !kind.enabled) continue
        if (ROLLED_UP.has(r.kind)) { rolled.set(r.kind, (rolled.get(r.kind) ?? 0) + 1); continue }
        const data = parse(r.data)
        const playerId = r.player_id ? Number(r.player_id) : null
        // A player's own deed is told only while they may be named.
        if (playerId && !nameable.has(playerId)) continue
        if (r.kind === 'death') {
            const gap = Number(data.creatureLevel ?? 0) - Number(data.combatLevel ?? 0)
            const story = (playerId && firstDeath.has(playerId)) || gap >= STRONG_KILL_GAP || Number(data.stacksLost ?? 0) >= settings.death_heavy_stacks
            if (!story || (playerId && fallenLately.has(playerId))) continue
        }
        const guild = r.guild_id ? guildBy.get(Number(r.guild_id)) : null
        const byPlayer = data.byPlayerId ? nameable.get(Number(data.byPlayerId)) ?? null : null
        const item = data.item ?? data.fish ?? data.mount ?? (DROP_KINDS.has(r.kind) ? r.subject : null)
        const slots: Slots = {
            player: playerId && names ? nameable.get(playerId) : (byPlayer && names ? byPlayer : null),
            guild: guild?.name ?? data.guild ?? null,
            tag: guild?.tag ?? data.tag ?? null,
            members: guild ? Number(guild.members) : null,
            item,
            creature: data.creature ?? null,
            place: data.place ?? (data.placeId ? placeBy.get(Number(data.placeId)) : null) ?? null,
            place2: data.place2 ?? null,
            skill: data.skill ?? null,
            level: data.level ?? data.total ?? null,
            n: data.kills ?? data.n ?? data.tier ? countWord(Number(data.kills ?? data.n ?? data.tier)) : null,
            feat: data.feat ?? null,
            quest: data.quest ?? null,
            gold: data.gold ? Number(data.gold).toLocaleString('en-US') : null,
            weight: formatLb(data.weightLb),
            museum: data.museum ?? null,
            exhibit: data.exhibit ?? null,
            date,
        }
        const deed: Deed = {
            id: Number(r.id), kind: r.kind, section: kind.section, playerId, guildId: r.guild_id ? Number(r.guild_id) : null,
            subject: r.subject, data, n: 1, slots, score: 0,
        }
        const chance = DROP_KINDS.has(r.kind) && item ? chances.get(String(item)) : undefined
        const rarity = chance ? 1 + Math.log10(1 / chance) : 1
        const fresh = playerId && seenYesterday.has(`${playerId}:${r.kind}:${r.subject ?? ''}`) ? 0.5 : 1
        const jitter = 0.9 + 0.2 * seededUnit(`${dayKey}:${r.id}`)
        deed.score = kind.base_weight * rarity * magnitude(deed) * fresh * jitter
        deeds.push(deed)
    }
    // Arrivals and claims become one line each, with how many (§6).
    for (const [k, n] of rolled) {
        const kind = kinds.get(k)!
        const deed: Deed = {
            id: -(deeds.length + 1), kind: k, section: kind.section, playerId: null, guildId: null,
            subject: null, data: { n }, n, slots: { n: countWord(n), date }, score: 0,
        }
        deed.score = kind.base_weight * magnitude(deed) * (0.9 + 0.2 * seededUnit(`${dayKey}:${k}`))
        deeds.push(deed)
    }

    // A player's nth deed of the day counts for less, best first (§6).
    const byPlayer = new Map<number, Deed[]>()
    for (const d of deeds) if (d.playerId) byPlayer.set(d.playerId, [...(byPlayer.get(d.playerId) ?? []), d])
    for (const list of byPlayer.values()) {
        list.sort((a, b) => b.score - a.score)
        list.forEach((d, i) => { d.score *= Math.pow(0.5, i) })
    }
    deeds.sort((a, b) => b.score - a.score || a.id - b.id)

    return { deeds, kinds, nameable, guildBy }
}

// ── Verses ──────────────────────────────────────────────────────────────────

interface Verse { id: number; kind: string; text: string; min_n: number | null; max_n: number | null }

class VersePicker {
    private byKind = new Map<string, Verse[]>()
    private lastUsed = new Map<number, string>()
    private usedOnPage = new Set<number>()
    readonly thin = new Set<string>()

    constructor(private dayKey: string) {}

    async load(): Promise<void> {
        const [verses, uses] = await Promise.all([
            db('chronicle_verses').where({ enabled: true }).select('id', 'kind', 'text', 'min_n', 'max_n'),
            db('chronicle_verse_uses').where('day_key', '<', this.dayKey).where('day_key', '>=', addDays(this.dayKey, -61))
                .groupBy('verse_id').select('verse_id', db.raw('max(day_key) as last')),
        ])
        for (const v of verses) this.byKind.set(v.kind, [...(this.byKind.get(v.kind) ?? []), v])
        for (const u of uses) this.lastUsed.set(Number(u.verse_id), u.last)
    }

    /**
     * A verse of this kind that the slots can fill, not sung on this page and,
     * if it can be helped, not within its kind's cooldown (§8): least lately
     * used first, ties broken by the seed. Null when no verse of the kind fits.
     */
    pick(kind: string, slots: Slots, n: number, seedKey: string): { verse: Verse; text: string } | null {
        const all = (this.byKind.get(kind) ?? []).filter(v =>
            !this.usedOnPage.has(v.id)
            && (v.min_n === null || n >= v.min_n)
            && (v.max_n === null || n <= v.max_n)
            && canFill(v.text, slots))
        if (!all.length) {
            if (this.byKind.has(kind)) this.thin.add(kind)
            return null
        }
        const cooldown = Math.min(60, Math.floor((this.byKind.get(kind)?.length ?? 0) / 2))
        const since = addDays(this.dayKey, -cooldown)
        const rested = all.filter(v => { const last = this.lastUsed.get(v.id); return !last || last <= since })
        if (!rested.length) this.thin.add(kind)
        const pool = (rested.length ? rested : all).slice().sort((a, b) => {
            const la = this.lastUsed.get(a.id) ?? '', lb = this.lastUsed.get(b.id) ?? ''
            if (la !== lb) return la < lb ? -1 : 1
            return seededUnit(`${seedKey}:${a.id}`) - seededUnit(`${seedKey}:${b.id}`)
        })
        const verse = pool[0]
        const text = renderVerse(verse.text, slots, `${seedKey}:${verse.id}`)
        if (!text) return null
        this.usedOnPage.add(verse.id)
        return { verse, text }
    }
}

// ── Composing ───────────────────────────────────────────────────────────────

/** Compose a day's page from its deeds. Saves nothing. */
export async function composePage(dayKey: string, settings?: ChronicleSettings): Promise<Page> {
    const s = settings ?? await chronicleSettings()
    const { deeds, kinds } = await readDay(dayKey, s, true)
    const verses = new VersePicker(dayKey)
    await verses.load()
    const lines: PageLine[] = []
    const date = dayTitle(dayKey)
    const told = new Set<number>()
    const namedPlayers = new Set<number>()
    const namedGuilds = new Set<number>()
    const perKind = new Map<string, number>()

    const line = (section: Section, kind: string, slots: Slots, seed: string, n = 1, extra: Partial<PageLine> = {}): PageLine | null => {
        const got = verses.pick(kind, slots, n, `${dayKey}:${seed}`)
        if (!got) return null
        const l: PageLine = { section, text: got.text, deedKind: kind, verseId: got.verse.id, playerIds: [], guildIds: [], ...extra }
        lines.push(l)
        return l
    }

    const tell = (d: Deed, section: Section): boolean => {
        if (told.has(d.id)) return false
        if (d.playerId && namedPlayers.has(d.playerId)) return false
        if (d.guildId && namedGuilds.has(d.guildId)) return false
        const cap = kinds.get(d.kind)?.max_per_page
        if (cap !== null && cap !== undefined && (perKind.get(d.kind) ?? 0) >= cap) return false
        const l = line(section, d.kind, d.slots, `deed:${d.id}`, d.n, {
            playerIds: d.playerId ? [d.playerId] : [],
            guildIds: d.guildId ? [d.guildId] : [],
        })
        if (!l) return false
        told.add(d.id)
        if (d.playerId) namedPlayers.add(d.playerId)
        if (d.guildId) namedGuilds.add(d.guildId)
        perKind.set(d.kind, (perKind.get(d.kind) ?? 0) + 1)
        return true
    }

    line('heading', 'heading', { date }, 'heading')

    const island = deeds.filter(d => d.section === 'island')
    let headlines = 0
    for (const d of island) {
        if (headlines >= s.headline_max || d.score < s.headline_threshold) break
        if (tell(d, 'headline')) headlines++
    }
    let count = 0
    for (const d of island) { if (count >= s.island_lines) break; if (tell(d, 'island')) count++ }
    // Guild ballads (§9): paid for, so never scored and never crowded out; two
    // a page at most, oldest first, and a third waits for tomorrow.
    const { start: dayStart, end: dayEnd } = dayWindow(dayKey)
    const ballads = await db('chronicle_ballads')
        .whereNotNull('text')
        .where((q) => q.whereNull('day_key_sung').orWhere('day_key_sung', dayKey))
        .where('created_at', '<', dayEnd)
        .orderBy('created_at').limit(BALLADS_PER_PAGE)
        .select('id', 'guild_id', 'text')
    for (const b of ballads) {
        // The first stanza on the page; the book offers the rest (ballad_id).
        lines.push({ section: 'guilds', text: balladStanzas(b.text)[0] ?? b.text, deedKind: 'ballad', verseId: null, playerIds: [], guildIds: b.guild_id ? [b.guild_id] : [], balladId: b.id })
    }
    count = 0
    for (const d of deeds.filter(x => x.section === 'guilds')) { if (count >= s.guild_lines) break; if (tell(d, 'guilds')) count++ }
    count = 0
    for (const d of deeds.filter(x => x.section === 'fallen')) { if (count >= s.fallen_lines) break; if (tell(d, 'fallen')) count++ }

    // Word from the Maker (§7): one line per news post published that day.
    const news = await db('news_posts').where('published_at', '>=', dayStart).where('published_at', '<', dayEnd)
        .orderBy('published_at').select('id', 'chronicle_line')
    for (const post of news) {
        const own = String(post.chronicle_line ?? '').trim()
        if (own) lines.push({ section: 'maker', text: own, deedKind: 'maker', verseId: null, playerIds: [], guildIds: [] })
        else line('maker', 'maker_generic', {}, `maker:${post.id}`)
    }

    const scoring = deeds.filter(d => !ROLLED_UP.has(d.kind)).length
    // A day with a headline is never a quiet one, however few deeds it had:
    // "a quiet day" read oddly under a mastery (2026-11-08).
    const quiet = scoring < s.quiet_below && headlines === 0
    if (quiet) line('quiet', 'quiet', { date }, 'quiet')

    // The long roll (§3): everyone else who did something worth noting, best first.
    const rollIds: number[] = []
    for (const d of deeds) {
        if (d.playerId && !namedPlayers.has(d.playerId) && !rollIds.includes(d.playerId) && d.slots.player) rollIds.push(d.playerId)
    }
    if (rollIds.length) {
        const nameOf = new Map(deeds.filter(d => d.playerId).map(d => [d.playerId!, String(d.slots.player)]))
        line('roll', 'roll', { names: nameList(rollIds.map(id => nameOf.get(id)!), s.roll_max), date }, 'roll', rollIds.length, { rollPlayerIds: rollIds })
    }

    // A rumour (§15): only ever something true, never forced, at most one, and
    // not the same subject twice in rumour_cooldown_days.
    if (seededUnit(`${dayKey}:rumour`) * 100 < s.rumour_chance) {
        const recent = new Set((await db('chronicle_lines')
            .where('section', 'rumour').whereNotNull('subject')
            .where('day_key', '>=', addDays(dayKey, -s.rumour_cooldown_days)).where('day_key', '<', dayKey)
            .select('subject')).map((r: any) => r.subject))
        const candidates = (await trueRumours())
            .filter(r => !recent.has(r.subject))
            .sort((a, b) => seededUnit(`${dayKey}:${a.subject}`) - seededUnit(`${dayKey}:${b.subject}`))
        for (const r of candidates) {
            if (line('rumour', r.kind, { ...r.slots, date }, `rumour:${r.subject}`, 1, { subject: r.subject })) break
        }
    }

    line('signoff', 'signoff', { date }, 'signoff')

    const headline = lines.find(l => l.section === 'headline')?.text ?? null
    const scored: ScoredDeed[] = deeds.map(d => ({
        id: d.id, kind: d.kind, section: d.section,
        player: d.slots.player ? String(d.slots.player) : null,
        guild: d.slots.guild ? String(d.slots.guild) : null,
        subject: d.subject, score: Math.round(d.score * 10) / 10, told: told.has(d.id),
    }))
    return { dayKey, title: date, lines, headline, quiet, thin: [...verses.thin], scored }
}

// ── Today so far, with no names (§2, §8) ────────────────────────────────────

let todayCache: { at: number; dayKey: string; lines: string[] } | null = null

/**
 * The Wenna tab's tidings so far today: the best few deeds in `today:` verses,
 * which name nobody. Cached for a minute and shared by everyone (§10).
 */
export async function todaySoFar(max = 4): Promise<string[]> {
    const dayKey = gameDayKey()
    if (todayCache && todayCache.dayKey === dayKey && Date.now() - todayCache.at < 60_000) return todayCache.lines
    const s = await chronicleSettings()
    const { deeds } = await readDay(dayKey, s, false)
    const verses = new VersePicker(dayKey)
    await verses.load()
    const out: string[] = []
    const kindsSeen = new Set<string>()
    for (const d of deeds) {
        if (out.length >= max) break
        if (kindsSeen.has(d.kind)) continue
        const slots = { ...d.slots, player: null, guild: null, tag: null }
        const got = verses.pick(`today:${d.kind}`, slots, d.n, `${dayKey}:today:${d.id}`)
        if (got && !/\{(player|guild|tag)\}/.test(got.verse.text)) { out.push(got.text); kindsSeen.add(d.kind) }
    }
    if (!out.length) {
        const got = verses.pick('today:quiet', {}, 1, `${dayKey}:today:quiet`)
        if (got) out.push(got.text)
    }
    todayCache = { at: Date.now(), dayKey, lines: out }
    return out
}

// ── Writing a page down ─────────────────────────────────────────────────────

const hash = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * Compose a day and keep it. Only the caller that claims the day writes it
 * (the claim is the chronicle_days row); everything else is one transaction,
 * and a failure gives the claim back so the next try starts clean.
 * Returns false when the page already exists or another writer has it.
 */
export async function writePage(dayKey: string, opts: { quiet?: boolean } = {}): Promise<boolean> {
    // composed_at holds the claim's time until the page is done, so a claim
    // left by a process that died can be told from one being written now.
    const [claim] = await db('chronicle_days').insert({ day_key: dayKey, status: 'composing', composed_at: db.fn.now() })
        .onConflict('day_key').ignore().returning('day_key')
    if (!claim) return false
    try {
        const page = await composePage(dayKey)
        await db.transaction(async (trx) => {
            let position = 0
            for (const l of page.lines) {
                const [row] = await trx('chronicle_lines').insert({
                    day_key: dayKey, section: l.section, position: position++, text: l.text, deed_kind: l.deedKind, subject: l.subject ?? null, ballad_id: l.balladId ?? null,
                }).returning('id')
                const lineId = typeof row === 'object' ? row.id : row
                const mentions = [
                    ...l.playerIds.map(player_id => ({ day_key: dayKey, line_id: lineId, player_id, in_lines: true })),
                    ...l.guildIds.map(guild_id => ({ day_key: dayKey, line_id: lineId, guild_id, in_lines: true })),
                    ...(l.rollPlayerIds ?? []).map(player_id => ({ day_key: dayKey, line_id: lineId, player_id, in_lines: false })),
                ]
                if (mentions.length) await trx('chronicle_mentions').insert(mentions)
                if (l.verseId) await trx('chronicle_verse_uses').insert({ verse_id: l.verseId, day_key: dayKey, text_hash: hash(l.text) })
                if (l.balladId) await trx('chronicle_ballads').where({ id: l.balladId }).whereNull('day_key_sung').update({ day_key_sung: dayKey })
            }
            await trx('chronicle_days').where({ day_key: dayKey }).update({
                status: 'done', composed_at: trx.fn.now(), headline: page.headline, quiet: page.quiet,
            })
        })
        logger.info(`[chronicle] wrote the page for ${dayKey}: ${page.lines.length} lines${page.thin.length ? `, thin: ${page.thin.join(', ')}` : ''}`)
        if (!opts.quiet) await afterPageWritten(dayKey, page)
        return true
    } catch (err) {
        await db('chronicle_days').where({ day_key: dayKey, status: 'composing' }).delete().catch(() => {})
        logger.error(`[chronicle] could not write ${dayKey}: ${err}`)
        return false
    }
}

/**
 * After a page is kept (§2 Elsewhere, §13): a line in world chat that opens
 * it, a word to everyone named in its own lines (a socket push, which becomes
 * a notification for those who chose them), and their feats. Only for the
 * newest day: catching up after downtime writes the missed pages quietly.
 * Never fails the page.
 */
async function afterPageWritten(dayKey: string, page: Page): Promise<void> {
    try {
        if (dayKey !== addDays(gameDayKey(), -1)) return
        await announceServer(`${CHRONICLE_LINK}${dayKey}__Wenna has set down the tidings for the ${page.title}.`)
        const named = [...new Set(page.lines.flatMap(l => l.playerIds))]
        for (const playerId of named) {
            pushToPlayer(playerId, 'chronicle_named', { dayKey, title: page.title })
            for (const feat of await evaluateFeats(playerId)) pushToPlayer(playerId, 'feat_earned', feat)
        }
    } catch (err) {
        logger.warn(`[chronicle] after writing ${dayKey}: ${err}`)
    }
}

/** A chat line that opens a page of the book: `__CHRONICLE__<day>__<text>` (ChatMessageLine.tsx). */
export const CHRONICLE_LINK = '__CHRONICLE__'

/** Take a page out of the book so it can be written again (admin, before players can read it). */
export async function unwritePage(dayKey: string): Promise<void> {
    await db.transaction(async (trx) => {
        await trx('chronicle_verse_uses').where({ day_key: dayKey }).delete()
        // Ballads that page sang are sung again by whatever page is written next.
        await trx('chronicle_ballads').where({ day_key_sung: dayKey }).update({ day_key_sung: null })
        await trx('chronicle_days').where({ day_key: dayKey }).delete()   // lines and mentions cascade
    })
}

/** A written page as stored. Null when the day has none. */
export async function readPage(dayKey: string): Promise<{ dayKey: string; title: string; headline: string | null; quiet: boolean; composedAt: string | null; lines: { section: string; text: string; struck: boolean }[] } | null> {
    const day = await db('chronicle_days').where({ day_key: dayKey, status: 'done' }).first()
    if (!day) return null
    const lines = await db('chronicle_lines').where({ day_key: dayKey }).orderBy('position').select('section', 'text', 'struck_at')
    return {
        dayKey, title: dayTitle(dayKey), headline: day.headline, quiet: !!day.quiet,
        composedAt: day.composed_at ? new Date(day.composed_at).toISOString() : null,
        lines: lines.map((l: any) => ({
            section: l.section,
            text: l.struck_at ? 'A line here was struck from the book.' : l.text,
            struck: !!l.struck_at,
        })),
    }
}

// ── When pages are written ──────────────────────────────────────────────────

let lastChecked = ''
let busy = false

/**
 * Called each minute by the events scheduler. When writing is on and a day
 * has ended without a page, write it; on boot this catches up every day the
 * server missed (§12), oldest first, back as far as the journal goes. Also
 * clears a claim left by a process that died mid-write, and trims old deeds.
 */
export async function chronicleTick(): Promise<void> {
    if (busy) return
    const yesterday = addDays(gameDayKey(), -1)
    if (lastChecked === yesterday) return
    busy = true
    try {
        const s = await chronicleSettings()
        if (!s.composer_enabled) return
        await db('chronicle_days').where({ status: 'composing' })
            .where('composed_at', '<', new Date(Date.now() - 10 * 60_000))
            .delete()
        const first = await db('chronicle_deeds').min({ day: 'day_key' }).first()
        let day = first?.day ? String(first.day) : yesterday
        const oldest = addDays(yesterday, -s.deed_keep_days)
        if (day < oldest) day = oldest
        const done = new Set((await db('chronicle_days').where('day_key', '>=', day).select('day_key')).map((r: any) => r.day_key))
        for (; day <= yesterday; day = addDays(day, 1)) {
            if (!done.has(day)) await writePage(day)
        }
        await trimDeeds(s.deed_keep_days)
        lastChecked = yesterday
    } catch (err) {
        logger.error(`[chronicle] tick failed: ${err}`)
    } finally {
        busy = false
    }
}

/** Every kind's verse count against the target to launch with (§8), for the admin panel. */
export async function verseCounts(): Promise<{ kind: string; verses: number; target: number }[]> {
    const rows = await db('chronicle_verses').where({ enabled: true }).groupBy('kind').select('kind').count({ n: '*' })
    const COMMON = new Set(['drop_rare', 'level_milestone', 'death', 'strong_kill', 'heading', 'signoff'])
    const ONE_OFF = new Set(['level_max', 'exhibit_complete', 'world_first_item', 'server_first_level'])
    return rows.map((r: any) => ({
        kind: r.kind, verses: Number(r.n),
        target: COMMON.has(r.kind) ? 25 : ONE_OFF.has(r.kind) ? 10 : r.kind.startsWith('today:') || r.kind.startsWith('rumour_') || r.kind.startsWith('ballad_deed_') ? 3 : r.kind.startsWith('ballad_') ? 6 : 10,
    })).sort((a, b) => (a.verses / a.target) - (b.verses / b.target))
}
