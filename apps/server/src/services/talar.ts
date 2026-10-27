import db from '../db'
import { logger } from '../lib/logger'
import { pushToPlayerAfterCommit } from '../lib/realtime'
import { SERVER_ERROR } from '../lib/serviceResult'
import { notifyInventoryChanged, takeItemsWithin } from './inventory'
import { playerSkillLevel } from './xp'

// The reservoir (docs/talar-spec.md §4). Every player carries Talar inside
// them: poured in from charged gems, spent on spells, drawn on by jewelry.
//
// Rules this module enforces, as services/gold.ts does for gold:
//  - player_talar.hundredths is the only store, written here and nowhere else.
//  - Every write is inside a transaction, on a locked row, and relative.
//  - Nothing pours past capacity: a gem that would overflow is refused whole.
//  - Never leaks, kept on death (it is inside you, like gold).

/** Stored in hundredths, so jewelry's fraction-per-action draw is exact. */
export const HUNDREDTHS = 100

/** Capacity: RESERVOIR_BASE + RESERVOIR_PER_LEVEL per Talar level (knob, §4). */
export const RESERVOIR_BASE = 300
export const RESERVOIR_PER_LEVEL = 25

/** The most Talar a player at this Talar level can hold. */
export function reservoirCapacity(talarLevel: number): number {
    return RESERVOIR_BASE + RESERVOIR_PER_LEVEL * Math.max(1, talarLevel)
}

export interface TalarState {
    /** Whole Talar for display; the exact figure is `hundredths`. */
    current: number
    max: number
    hundredths: number
}

/** A refusal from inside the transaction. Thrown, never returned (CLAUDE.md §4 rule 3). */
class TalarAbort extends Error {}

function stateOf(hundredths: number, max: number): TalarState {
    return { current: Math.floor(hundredths / HUNDREDTHS), max, hundredths }
}

/** The reservoir as it stands, for the bar. */
export async function getTalarState(playerId: number): Promise<TalarState> {
    const [row, level] = await Promise.all([
        db('player_talar').where({ player_id: playerId }).first('hundredths'),
        playerSkillLevel(playerId, 'Talar'),
    ])
    return stateOf(Number(row?.hundredths ?? 0), reservoirCapacity(level))
}

/**
 * Lock this player's reservoir row, creating it empty first if they have none.
 * forUpdate on a missing row locks nothing (CLAUDE.md §4 rule 4), so the row is
 * made to exist before it is read.
 */
async function lockReservoir(trx: any, playerId: number): Promise<number> {
    await trx('player_talar').insert({ player_id: playerId, hundredths: 0 }).onConflict('player_id').ignore()
    const row = await trx('player_talar').where({ player_id: playerId }).forUpdate().first('hundredths')
    return Number(row.hundredths)
}

/**
 * Absorb one charged gem into the reservoir: the gem is used up, its Talar
 * poured in. Refused whole if it would overflow (no partial pours), so a
 * player tops up only when there is room for the stone.
 */
export async function absorbGem(
    playerId: number,
    itemId: number,
): Promise<{ success: true; itemName: string; poured: number; talar: TalarState } | { success: false; error: string }> {
    try {
        const id = Math.floor(Number(itemId))
        if (!Number.isFinite(id) || id <= 0) return { success: false, error: 'Unknown item.' }

        const item = await db('items').where({ id }).first('id', 'name', 'type', 'quality', 'talar')
        if (!item || item.type !== 'gem' || !(Number(item.talar) > 0) || !['lit', 'bright', 'radiant'].includes(item.quality)) {
            return { success: false, error: 'There is no light in that to take.' }
        }
        const poured = Number(item.talar)

        const talar = await db.transaction(async trx => {
            const max = reservoirCapacity(await playerSkillLevel(playerId, 'Talar', trx))
            const held = await lockReservoir(trx, playerId)
            if (held + poured * HUNDREDTHS > max * HUNDREDTHS) {
                const room = Math.floor((max * HUNDREDTHS - held) / HUNDREDTHS)
                throw new TalarAbort(room > 0
                    ? `That stone holds ${poured} Talar and you have room for ${room}.`
                    : 'You are full. There is no room for more.')
            }

            const taken = await takeItemsWithin(trx, playerId, [{ name: item.name, quantity: 1 }])
            if (!taken.ok) throw new TalarAbort(`You have no ${item.name}.`)

            const [row] = await trx('player_talar')
                .where({ player_id: playerId })
                .update({ hundredths: trx.raw('hundredths + ?', [poured * HUNDREDTHS]), updated_at: trx.fn.now() })
                .returning('hundredths')
            const state = stateOf(Number(row.hundredths), max)
            pushToPlayerAfterCommit(trx, playerId, 'talar_changed', state)
            return state
        })

        notifyInventoryChanged(playerId)
        logger.info(`[talar] player ${playerId} absorbed ${item.name} (+${poured}), now ${talar.current}/${talar.max}`)
        return { success: true, itemName: item.name, poured, talar }
    } catch (err) {
        if (err instanceof TalarAbort) return { success: false, error: err.message }
        logger.error(`absorbGem error (player ${playerId}): ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}
