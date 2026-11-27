import db from '../db'
import { logger } from '../lib/logger'
import { cleanUsername, isUniqueViolation } from '../lib/credentials'
import { SERVER_ERROR } from '../lib/serviceResult'
import { namesRefusal } from './wordFilter'

// Name changes (docs/taler-perks-ideas.md; Nathan, 2026-11-27). Every player
// has one free change; more are bought in the store (players.name_change_tokens,
// sold as 'token:name_change'). A new name passes the same rules as a new
// account (cleanUsername, the language filter, unique without regard to case),
// and a change waits NAME_CHANGE_COOLDOWN_DAYS after the last. The profile says
// "formerly" for FORMERLY_DAYS, so friends are not lost and nobody can step
// into a name just given up to pass for its owner. Staff may put a name back.

export const NAME_CHANGE_COOLDOWN_DAYS = 30
export const FORMERLY_DAYS = 30
const DAY_MS = 86_400_000

class Refusal extends Error {}

export interface NameChangeState {
    name: string
    freeLeft: boolean
    tokens: number
    /** When the next change is allowed, if a change is waiting out its cooldown. */
    nextAt: string | null
}

/** What this player may do now, for the Settings card. */
export async function nameChangeState(playerId: number): Promise<NameChangeState | null> {
    const player = await db('players').where({ id: playerId }).first('username', 'name_change_tokens')
    if (!player) return null
    const free = await db('player_name_changes').where({ player_id: playerId, paid_with: 'free' }).whereNull('reverted_at').first('id')
    const last = await db('player_name_changes').where({ player_id: playerId }).whereNull('reverted_at').orderBy('changed_at', 'desc').first('changed_at')
    const nextAt = last ? new Date(new Date(last.changed_at).getTime() + NAME_CHANGE_COOLDOWN_DAYS * DAY_MS) : null
    return {
        name: player.username,
        freeLeft: !free,
        tokens: Number(player.name_change_tokens) || 0,
        nextAt: nextAt && nextAt.getTime() > Date.now() ? nextAt.toISOString() : null,
    }
}

/**
 * Change a player's name: one transaction on the locked player row, so two
 * requests cannot spend one free change or one token twice. The unique index
 * on lower(username) is the real gate against a name taken at the same moment.
 */
export async function changeName(playerId: number, raw: unknown): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
    const name = cleanUsername(raw)
    if (!name.ok) return { ok: false, error: name.error }
    const refused = await namesRefusal(name.value)
    if (refused) return { ok: false, error: refused }
    try {
        const old = await db.transaction(async (trx) => {
            const player = await trx('players').where({ id: playerId }).forUpdate().first('username', 'name_change_tokens', 'is_guest')
            if (!player) throw new Refusal('Player not found.')
            if (player.is_guest) throw new Refusal('Claim your account first.')
            if (player.username === name.value) throw new Refusal('That is already your name.')

            const last = await trx('player_name_changes').where({ player_id: playerId }).whereNull('reverted_at')
                .orderBy('changed_at', 'desc').first('changed_at')
            if (last && Date.now() - new Date(last.changed_at).getTime() < NAME_CHANGE_COOLDOWN_DAYS * DAY_MS) {
                throw new Refusal(`You may change your name once in ${NAME_CHANGE_COOLDOWN_DAYS} days.`)
            }
            // Someone else's name, whatever its case; your own in a new case is allowed.
            const taken = await trx('players').whereRaw('LOWER(username) = LOWER(?)', [name.value]).whereNot({ id: playerId }).first('id')
            if (taken) throw new Refusal('That name is taken.')

            const freeUsed = await trx('player_name_changes').where({ player_id: playerId, paid_with: 'free' }).whereNull('reverted_at').first('id')
            let paidWith: 'free' | 'token' = 'free'
            if (freeUsed) {
                const spent = await trx('players').where({ id: playerId }).where('name_change_tokens', '>', 0)
                    .decrement('name_change_tokens', 1)
                if (!spent) throw new Refusal('You have used your free name change. Another can be had in the store.')
                paidWith = 'token'
            }
            await trx('players').where({ id: playerId }).update({ username: name.value })
            await trx('player_name_changes').insert({ player_id: playerId, old_name: player.username, new_name: name.value, paid_with: paidWith })
            return player.username as string
        })
        logger.info(`[names] player ${playerId} is now ${name.value} (was ${old})`)
        return { ok: true, name: name.value }
    } catch (err) {
        if (err instanceof Refusal) return { ok: false, error: err.message }
        if (isUniqueViolation(err)) return { ok: false, error: 'That name is taken.' }
        logger.error(`[names] change for player ${playerId} failed: ${err}`)
        return { ok: false, error: SERVER_ERROR }
    }
}

/** The name a player went by until lately, for the profile; null when none. */
export async function formerName(playerId: number): Promise<string | null> {
    const row = await db('player_name_changes').where({ player_id: playerId }).whereNull('reverted_at')
        .where('changed_at', '>', new Date(Date.now() - FORMERLY_DAYS * DAY_MS))
        .orderBy('changed_at', 'desc').first('old_name')
    return row?.old_name ?? null
}

/** Every change a player has made, for staff. */
export async function nameHistory(playerId: number): Promise<any[]> {
    return db('player_name_changes as c').leftJoin('players as s', 's.id', 'c.reverted_by')
        .where('c.player_id', playerId).orderBy('c.changed_at', 'desc')
        .select('c.id', 'c.old_name', 'c.new_name', 'c.paid_with', 'c.changed_at', 'c.reverted_at', 's.username as reverted_by')
}

/**
 * Staff put a player's last change back: the old name again, if nobody has it
 * now. A reverted free change is given back; a reverted token is returned.
 */
export async function revertNameChange(staffId: number, playerId: number): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
    try {
        const name = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forUpdate().first('id')
            const last = await trx('player_name_changes').where({ player_id: playerId }).whereNull('reverted_at')
                .orderBy('changed_at', 'desc').forUpdate().first()
            if (!last) throw new Refusal('There is no change to put back.')
            const taken = await trx('players').whereRaw('LOWER(username) = LOWER(?)', [last.old_name]).whereNot({ id: playerId }).first('id')
            if (taken) throw new Refusal(`Someone else is called ${last.old_name} now.`)
            await trx('players').where({ id: playerId }).update({ username: last.old_name })
            if (last.paid_with === 'token') await trx('players').where({ id: playerId }).increment('name_change_tokens', 1)
            await trx('player_name_changes').where({ id: last.id }).update({ reverted_at: trx.fn.now(), reverted_by: staffId })
            return last.old_name as string
        })
        logger.info(`[names] staff ${staffId} put player ${playerId}'s name back to ${name}`)
        return { ok: true, name }
    } catch (err) {
        if (err instanceof Refusal) return { ok: false, error: err.message }
        if (isUniqueViolation(err)) return { ok: false, error: 'That name has been taken.' }
        logger.error(`[names] revert for player ${playerId} failed: ${err}`)
        return { ok: false, error: SERVER_ERROR }
    }
}
