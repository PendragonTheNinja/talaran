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
// The words are made when it is paid for, from the guild's own numbers, so the
// Ballads tab shows them at once; the next page sings it under From the guilds
// (services/chronicleComposer.ts, two a page at most).
//
// Gold moves, so it is one transaction: the commissioner's row, then the guild
// row (the gate: a second commission waits on it and then finds the first),
// then the storehouse; race:check 'ballad'.

class BalladAbort extends Error {
    constructor(message: string, readonly status = 400) { super(message) }
}

/** The guild's numbers a ballad can sing. */
async function guildSlots(trx: any, guildId: number, hall: any): Promise<Slots> {
    const [guild, members, best] = await Promise.all([
        trx('guilds').where({ id: guildId }).first('name', 'tag'),
        trx('guild_members').where({ guild_id: guildId }).count({ n: '*' }).first(),
        trx('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
            .join('guild_members as gm', 'gm.player_id', 'ps.player_id')
            .where('gm.guild_id', guildId).where('s.is_active', true)
            .groupBy('s.name').orderByRaw('sum(ps.xp) desc').first('s.name'),
    ])
    const place = hall ? await trx('locations').where({ id: hall.location_id }).first('name') : null
    return {
        guild: guild?.name ?? null,
        tag: guild?.tag ?? null,
        members: countWord(Number(members?.n ?? 0)),
        skill: best?.name ?? null,
        place: place?.name ?? null,
        n: hall && Number(hall.tier) > 0 ? countWord(Number(hall.tier)) : null,
    }
}

/** The words: one of the ballad verses the guild's numbers can fill, least sung first. */
async function balladWords(trx: any, slots: Slots, seed: string): Promise<string> {
    const verses = await trx('chronicle_verses').where({ kind: 'ballad', enabled: true }).select('id', 'text')
    const fit = verses.filter((v: any) => canFill(v.text, slots))
    if (!fit.length) throw new BalladAbort('Wenna cannot find the words for that guild just now.')
    const sung = new Map((await trx('chronicle_ballads').whereNotNull('text').select('text')).map((r: any) => [r.text, true]))
    // Not the same words another guild already had, where she can help it.
    const fresh = fit.filter((v: any) => !sung.has(renderVerse(v.text, slots, `${seed}:${v.id}`)))
    const pool = (fresh.length ? fresh : fit).sort((a: any, b: any) => seededUnit(`${seed}:${a.id}`) - seededUnit(`${seed}:${b.id}`))
    return renderVerse(pool[0].text, slots, `${seed}:${pool[0].id}`)!
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
            const words = await balladWords(trx, await guildSlots(trx, guildId, hall), `ballad:${id}`)
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
