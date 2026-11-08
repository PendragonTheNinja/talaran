import db from '../db'
import { logger } from '../lib/logger'
import { SERVER_ERROR } from '../lib/serviceResult'
import { canFill, renderVerse, seededUnit, countWord, Slots } from '../lib/chronicleVerse'
import { debitGoldWithin } from './gold'
import { membershipOf } from './guildRanks'
import { ledger as storehouseLedger, announce as announceHall } from './guildHall'
import { chronicleSettings } from './chronicleComposer'

// ── Guild ballads (docs/chronicle-spec.md §9, step 6) ────────────────────────
//
// A guild pays Wenna to sing of it. Commissioned at the Salty Sloth by a member
// whose rank may post guild news. A guild with a storehouse pays from it (the
// rank must also be allowed to take gold from it); one without pays from the
// commissioner's purse, so small guilds are not shut out. One ballad a guild
// every ballad_cooldown_days, at ballad_price (chronicle_settings, 10,000).
//
// The words are made when it is paid for, from the guild's own record: four
// stanzas (opening, numbers, one deed, send-off; migration 20261108190000), so
// the Ballads tab shows them at once. The next page prints the first stanza
// under From the guilds (services/chronicleComposer.ts, two a page at most) and
// the book offers the rest.
//
// Gold moves, so it is one transaction: the commissioner's row, then the guild
// row (the gate: a second commission waits on it and then finds the first),
// then the storehouse; race:check 'ballad'.

class BalladAbort extends Error {
    constructor(message: string, readonly status = 400) { super(message) }
}

/** How long ago, in words a singer would use: "nine days", "three weeks", "two months". */
function ageWords(since: Date | string | null | undefined): string | null {
    if (!since) return null
    const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400_000)
    const say = (n: number, unit: string) => `${countWord(n)} ${unit}${n === 1 ? '' : 's'}`
    if (days < 2) return null
    if (days < 14) return say(days, 'day')
    if (days < 60) return say(Math.round(days / 7), 'week')
    if (days < 730) return say(Math.round(days / 30), 'month')
    return say(Math.round(days / 365), 'year')
}

/** "Windthrow" and "The Herd Passes" both read after "the": the event without its own article. */
function eventName(name: string | null | undefined): string | null {
    return name ? name.replace(/^the\s+/i, '') : null
}

/**
 * The guild's record, as a ballad can sing it. Every number is the guild's
 * own, counted over its members now. A slot is left out where it would read
 * wrong ("one names on the roll"), so the stanzas that need it are not used.
 */
async function guildSlots(trx: any, guildId: number, hall: any, by: string): Promise<Slots> {
    // One after another: these run on the commission's transaction, one connection.
    const memberIds = trx('guild_members').where({ guild_id: guildId }).select('player_id')
    const guild = await trx('guilds as g').leftJoin('players as p', 'p.id', 'g.leader_id').where('g.id', guildId)
        .first('g.name', 'g.tag', 'g.created_at', 'p.username as leader')
    const members = await trx('guild_members').where({ guild_id: guildId }).count({ n: '*' }).first()
    const skills = await trx('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
        .whereIn('ps.player_id', memberIds).where('s.is_active', true)
        .groupBy('s.name').orderByRaw('sum(ps.xp) desc').limit(2).select('s.name')
    const stats = await trx('player_stats').whereIn('player_id', memberIds)
        .sum({ kills: 'total_creatures_killed', deaths: 'total_combat_deaths', actions: 'total_actions_completed' }).first()
    const wins = await trx('chronicle_deeds').where({ kind: 'event_winner_guild', guild_id: guildId }).count({ n: '*' }).first()
    const lastWin = await trx('chronicle_deeds').where({ kind: 'event_winner_guild', guild_id: guildId }).orderBy('created_at', 'desc').first('subject')
    const firsts = await trx('item_firsts').whereIn('player_id', memberIds).count({ n: '*' }).first()
    // The finest thing they were first to find, not the latest log.
    const bestFirst = await trx('item_firsts as f').join('items as i', 'i.id', 'f.item_id').whereIn('f.player_id', memberIds)
        .orderByRaw('coalesce(i.value, 0) desc').orderBy('f.first_at').first('i.name')
    const creature = await trx('player_creature_kills as k').join('creatures as c', 'c.id', 'k.creature_id').whereIn('k.player_id', memberIds)
        .groupBy('c.name').orderByRaw('sum(k.kills) desc').first('c.name')
    const roads = await trx('road_firsts').whereIn('player_id', memberIds).count({ n: '*' }).first()
    const place = hall ? await trx('locations').where({ id: hall.location_id }).first('name') : null
    const n = (v: any) => Number(v ?? 0)
    const kills = n(stats?.kills)
    const deaths = n(stats?.deaths)
    const actions = n(stats?.actions)
    return {
        guild: guild?.name ?? null,
        tag: guild?.tag ?? null,
        by,
        leader: guild?.leader ?? null,
        members: n(members?.n) >= 2 ? countWord(n(members?.n)) : null,
        age: ageWords(guild?.created_at),
        place: place?.name ?? null,
        n: hall && n(hall.tier) > 0 ? countWord(n(hall.tier)) : null,
        skill: skills[0]?.name ?? null,
        skill2: skills[1]?.name ?? null,
        event: eventName(lastWin?.subject),
        wins: n(wins?.n) === 2 ? 'twice' : n(wins?.n) > 2 ? `${countWord(n(wins?.n))} times` : null,
        item: bestFirst?.name ?? null,
        firsts: n(firsts?.n) >= 2 ? countWord(n(firsts?.n)) : null,
        kills: kills >= 25 ? countWord(kills) : null,
        creature: kills >= 25 ? creature?.name ?? null : null,
        roads: n(roads?.n) >= 2 ? countWord(n(roads?.n)) : null,
        deaths: deaths >= 5 ? countWord(deaths) : null,
        actions: actions >= 100 ? countWord(actions) : null,
    }
}

/** The deeds a ballad tells, one drawn at random from those the guild has; the fallen only when it has none of these, and plain work last of all. */
const DEED_KINDS = ['ballad_deed_win', 'ballad_deed_first', 'ballad_deed_hunt', 'ballad_deed_road']
const DEED_FALLBACKS = ['ballad_deed_fallen', 'ballad_deed_work']

/** One stanza of a kind: one this guild's record can fill, not sung before where she can help it. */
function pickStanza(verses: any[], kind: string, slots: Slots, seed: string, sung: string[]): string | null {
    const fit = verses.filter((v) => v.kind === kind && canFill(v.text, slots))
    if (!fit.length) return null
    const render = (v: any) => renderVerse(v.text, slots, `${seed}:${v.id}`)!
    const fresh = fit.filter((v) => !sung.some((t) => t.includes(render(v))))
    const pool = (fresh.length ? fresh : fit).sort((a, b) => seededUnit(`${seed}:${a.id}`) - seededUnit(`${seed}:${b.id}`))
    return render(pool[0])
}

/**
 * The words: four stanzas, blank lines between (opening, the guild's numbers,
 * one deed, the send-off). The deed is drawn from what the guild has done,
 * a different one each time where it has several.
 */
async function balladWords(trx: any, slots: Slots, seed: string): Promise<string> {
    const verses = await trx('chronicle_verses').where('kind', 'like', 'ballad\\_%').where({ enabled: true }).select('id', 'kind', 'text')
    const sung: string[] = (await trx('chronicle_ballads').whereNotNull('text').select('text')).map((r: any) => r.text)
    const can = (k: string) => verses.some((v: any) => v.kind === k && canFill(v.text, slots))
    const deeds = DEED_KINDS.filter(can)
    const deedKind = deeds.length
        ? [...deeds].sort((a, b) => seededUnit(`${seed}:${a}`) - seededUnit(`${seed}:${b}`))[0]
        : DEED_FALLBACKS.find(can) ?? 'ballad_deed_work'
    const stanzas = ['ballad_open', 'ballad_numbers', deedKind, 'ballad_close'].map((k) => pickStanza(verses, k, slots, seed, sung))
    if (stanzas.some((st) => !st)) throw new BalladAbort('Wenna cannot find the words for that guild just now.')
    // A line that starts a sentence starts with a capital, whatever slot opens it.
    const capitalised = (st: string) => st.split('\n')
        .map((line, i, all) => i === 0 || /[.?!]$/.test(all[i - 1]) ? line.charAt(0).toUpperCase() + line.slice(1) : line)
        .join('\n')
    return (stanzas as string[]).map(capitalised).join('\n\n')
}

/** A ballad for a guild as it stands, without paying or keeping it: for checking the words. */
export async function previewBallad(trx: any, guildId: number, by: string, seed: string): Promise<string> {
    return balladWords(trx, await guildSlots(trx, guildId, await storehouseOf(trx, guildId), by), seed)
}

/** The guild's storehouse a ballad is paid from: its hall with a storehouse, the fullest if several. */
async function storehouseOf(trx: any, guildId: number, lock = false) {
    const q = trx('guild_halls').where({ guild_id: guildId }).where('tier', '>=', 1).orderBy('gold', 'desc').orderBy('id')
    return (lock ? q.forUpdate() : q).first()
}

/** Whether the player stands at a tavern. Ballads are ordered from Wenna in person. */
async function atTavern(trx: any, playerId: number): Promise<boolean> {
    const p = await trx('players').where({ id: playerId }).first('current_location_id')
    return !!p && !!(await trx('taverns').where({ location_id: p.current_location_id }).first('id'))
}

export interface BalladsView {
    price: number
    cooldownDays: number
    inGuild: boolean
    guild: string | null
    /** Why this player cannot commission one now, or null when they can. */
    blocked: string | null
    payFrom: 'storehouse' | 'purse' | null
    storehouseGold: number | null
    nextAllowedAt: string | null
    ballads: { id: number; text: string; sung: string | null; by: string | null; paidFrom: string; at: string }[]
}

/** The Ballads tab: the price, whether this player may commission one, and the guild's ballads. */
export async function balladsFor(playerId: number): Promise<BalladsView> {
    const s = await chronicleSettings()
    const price = s.ballad_price
    const cooldownDays = s.ballad_cooldown_days
    const me = await membershipOf(playerId)
    if (!me) return { price, cooldownDays, inGuild: false, guild: null, blocked: 'Ballads are for guilds. Join one first.', payFrom: null, storehouseGold: null, nextAllowedAt: null, ballads: [] }
    const [hall, rows, last] = await Promise.all([
        storehouseOf(db, me.guildId),
        db('chronicle_ballads as b').leftJoin('players as p', 'p.id', 'b.commissioned_by')
            .where('b.guild_id', me.guildId).orderBy('b.created_at', 'desc').limit(50)
            .select('b.id', 'b.text', 'b.day_key_sung', 'b.paid_from', 'b.created_at', 'p.username'),
        db('chronicle_ballads').where({ guild_id: me.guildId }).orderBy('created_at', 'desc').first('created_at'),
    ])
    const next = last ? new Date(new Date(last.created_at).getTime() + cooldownDays * 86400_000) : null
    let blocked: string | null = null
    if (!me.can('post_news')) blocked = 'Your rank cannot commission a ballad.'
    else if (hall && !me.can('withdraw_gold')) blocked = 'Ballads are paid from the storehouse, and your rank cannot take gold from it.'
    else if (next && next.getTime() > Date.now()) blocked = 'Wenna sang of your guild lately. Give her a while.'
    else if (!(await atTavern(db, playerId))) blocked = 'Order it from Wenna in person, at the Salty Sloth.'
    return {
        price, cooldownDays, inGuild: true, guild: me.guild.name, blocked,
        payFrom: hall ? 'storehouse' : 'purse',
        storehouseGold: hall ? Number(hall.gold) : null,
        nextAllowedAt: next && next.getTime() > Date.now() ? next.toISOString() : null,
        ballads: rows.map((r: any) => ({
            id: r.id, text: r.text, sung: r.day_key_sung, by: r.username ?? null, paidFrom: r.paid_from,
            at: new Date(r.created_at).toISOString(),
        })),
    }
}

/** Commission one. Returns the words, or a refusal. */
export async function commissionBallad(playerId: number): Promise<{ ok: true; text: string; paidFrom: string } | { error: string }> {
    try {
        const s = await chronicleSettings()
        const price = s.ballad_price
        const cooldownDays = s.ballad_cooldown_days
        let guildId = 0
        let paidFrom = ''
        const text = await db.transaction(async (trx) => {
            const me = await trx('players').where({ id: playerId }).forUpdate().first('id', 'username')
            if (!me) throw new BalladAbort('Who are you?')
            if (!(await atTavern(trx, playerId))) throw new BalladAbort('Order it from Wenna in person, at the Salty Sloth.')
            const member = await membershipOf(playerId, trx, true)
            if (!member) throw new BalladAbort('Ballads are for guilds. Join one first.')
            guildId = member.guildId
            if (!member.can('post_news')) throw new BalladAbort('Your rank cannot commission a ballad.', 403)

            // The gate: one commission at a time per guild, and one per cooldown.
            await trx('guilds').where({ id: guildId }).forUpdate().first('id')
            const last = await trx('chronicle_ballads').where({ guild_id: guildId }).orderBy('created_at', 'desc').first('created_at')
            if (last && new Date(last.created_at).getTime() + cooldownDays * 86400_000 > Date.now()) {
                throw new BalladAbort('Wenna sang of your guild lately. Give her a while.')
            }

            const hall = await storehouseOf(trx, guildId, true)
            if (hall) {
                if (!member.can('withdraw_gold')) throw new BalladAbort('Ballads are paid from the storehouse, and your rank cannot take gold from it.', 403)
                const [row] = await trx('guild_halls').where({ id: hall.id }).where('gold', '>=', price)
                    .update({ gold: trx.raw('gold - ?', [price]), updated_at: trx.fn.now() }).returning('gold')
                if (!row) throw new BalladAbort(`The storehouse does not hold ${price.toLocaleString('en-US')} gold.`)
                await storehouseLedger(trx, hall.id, playerId, me.username, null, -price)
                paidFrom = 'storehouse'
            } else {
                const paid = await debitGoldWithin(trx, { playerId, amount: price, reason: 'chronicle_ballad', refType: 'guild', refId: guildId })
                if (!paid.ok) throw new BalladAbort(`A ballad costs ${price.toLocaleString('en-US')} gold, and you do not have it.`)
                paidFrom = 'purse'
            }

            const [row] = await trx('chronicle_ballads').insert({
                guild_id: guildId, commissioned_by: playerId, paid_gold: price, paid_from: paidFrom,
            }).returning('id')
            const id = typeof row === 'object' ? row.id : row
            const words = await balladWords(trx, await guildSlots(trx, guildId, hall, me.username), `ballad:${id}`)
            await trx('chronicle_ballads').where({ id }).update({ text: words })
            return words
        })
        if (paidFrom === 'storehouse') announceHall(guildId)
        logger.info(`[chronicle] player ${playerId} commissioned a ballad for guild ${guildId} (${paidFrom})`)
        return { ok: true, text, paidFrom }
    } catch (err) {
        if (err instanceof BalladAbort) return { error: err.message }
        logger.error(`[chronicle] ballad for player ${playerId} failed: ${err}`)
        return { error: SERVER_ERROR }
    }
}
