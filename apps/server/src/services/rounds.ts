import db from '../db'
import { logger } from '../lib/logger'
import { isConnected } from '../lib/presence'
import { pushToPlayerAfterCommit } from '../lib/realtime'
import { takeItemsWithin, notifyInventoryChanged } from './inventory'
import { listWords } from '../lib/listWords'
import { SERVER_ERROR } from '../lib/serviceResult'

// Standing a round (docs/antura-plan.md §11; Nathan, 2026-11-20). At a tavern,
// a player with enough Ale gives one to everyone there, themselves included,
// and everyone gets the round's buff: every skill 1% faster for six hours. It
// takes at least three people, because the point of ale is company. The buff
// lives in its own row (player_round_buffs), apart from provisions, so it never
// displaces one and the two run together; buffTimerBonus in services/buffs.ts
// adds both. A second round restarts the six hours; it never stacks.

export const ROUND_MIN_PLAYERS = 3
export const ROUND_MAGNITUDE = 1
export const ROUND_SECONDS = 6 * 3600
export const ALE_ITEM = 'Ale'

class RoundAbort extends Error {}

/** The tavern where the player stands, or null. */
async function tavernHere(playerId: number, x: any = db) {
    const row = await x('players as p').join('taverns as t', 't.location_id', 'p.current_location_id')
        .where('p.id', playerId).first('t.id', 't.name', 't.location_id')
    return row ?? null
}

/** Everyone connected and standing at this place, never a guest who has lapsed (ordered by id for the locks). */
async function presentAt(locationId: number, x: any = db): Promise<{ id: number; username: string }[]> {
    const rows = await x('players').where({ current_location_id: locationId }).orderBy('id').select('id', 'username')
    return rows.filter((r: { id: number }) => isConnected(Number(r.id))).map((r: any) => ({ id: Number(r.id), username: String(r.username) }))
}

/** The player's live round buff, or null. */
export async function roundBuff(playerId: number): Promise<{ magnitude: number; secondsLeft: number; stoodBy: string | null } | null> {
    const row = await db('player_round_buffs as r').leftJoin('players as p', 'p.id', 'r.stood_by')
        .where('r.player_id', playerId).first('r.magnitude', 'r.expires_at', 'p.username')
    if (!row) return null
    const left = Math.round((new Date(row.expires_at).getTime() - Date.now()) / 1000)
    if (left <= 0) return null
    return { magnitude: Number(row.magnitude), secondsLeft: left, stoodBy: row.username ?? null }
}

/** Percent off every action timer from a round, 0 when none is running. */
export async function roundTimerBonus(playerId: number): Promise<number> {
    return (await roundBuff(playerId))?.magnitude ?? 0
}

/** What the tavern shows before a round: who is here, what it costs, and whether it can be stood. */
export async function roundOffer(playerId: number) {
    const tavern = await tavernHere(playerId)
    if (!tavern) return null
    const present = await presentAt(Number(tavern.location_id))
    const held = await db('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
        .where({ 'pi.player_id': playerId, 'i.name': ALE_ITEM }).first('pi.quantity')
    const ale = Number(held?.quantity ?? 0)
    return {
        tavern: String(tavern.name),
        present: present.length,
        need: ROUND_MIN_PLAYERS,
        ale,
        canStand: present.length >= ROUND_MIN_PLAYERS && ale >= present.length,
        hours: ROUND_SECONDS / 3600,
        magnitude: ROUND_MAGNITUDE,
        mine: await roundBuff(playerId),
    }
}

/** Stand a round: one Ale for everyone here, and the round's buff for each. */
export async function standRound(playerId: number): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
        const result = await db.transaction(async (trx) => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id')
            const tavern = await tavernHere(playerId, trx)
            if (!tavern) throw new RoundAbort('There is no tavern here to stand a round in.')
            const present = await presentAt(Number(tavern.location_id), trx)
            if (present.length < ROUND_MIN_PLAYERS) {
                throw new RoundAbort(`A round wants at least ${ROUND_MIN_PLAYERS} people to drink it. There ${present.length === 1 ? 'is 1' : `are ${present.length}`} here.`)
            }
            // One Ale a head, all or nothing (CLAUDE.md §4 rule 13).
            const took = await takeItemsWithin(trx, playerId, [{ name: ALE_ITEM, quantity: present.length }])
            if (!took.ok) throw new RoundAbort(`A round for ${present.length} wants ${present.length} Ale.`)

            const expires = new Date(Date.now() + ROUND_SECONDS * 1000)
            const buyer = present.find(p => p.id === playerId)?.username ?? 'Someone'
            for (const p of present) {
                await trx('player_round_buffs')
                    .insert({ player_id: p.id, stood_by: playerId, magnitude: ROUND_MAGNITUDE, expires_at: expires })
                    .onConflict('player_id').merge(['stood_by', 'magnitude', 'expires_at', 'created_at'])
                const line = p.id === playerId
                    ? `You stand a round at ${tavern.name}. Everyone here works a little quicker for ${ROUND_SECONDS / 3600} hours.`
                    : `${buyer} stands a round at ${tavern.name}. You work a little quicker for ${ROUND_SECONDS / 3600} hours.`
                pushToPlayerAfterCommit(trx, p.id, 'round_stood', { message: line })
            }
            return { count: present.length, names: present.filter(p => p.id !== playerId).map(p => p.username), tavern: String(tavern.name) }
        })
        notifyInventoryChanged(playerId)
        logger.info(`Player ${playerId} stood a round for ${result.count} at ${result.tavern}`)
        return { success: true, message: `You stand a round for ${listWords([...result.names, 'yourself'])}: ${result.count} Ale.` }
    } catch (err) {
        if (err instanceof RoundAbort) return { success: false, error: err.message }
        logger.error(`standRound error: ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}
