import db from '../db'
import { logger } from '../lib/logger'
import { pushToPlayerAfterCommit } from '../lib/realtime'
import { SERVER_ERROR } from '../lib/serviceResult'
import { addItemToInventoryWithin, notifyInventoryChanged, takeItemsWithin } from './inventory'
import { awardXp, playerSkillLevel } from './xp'
import { incrementStats } from './stats'
import { activeXpForSeconds } from './farming'
import { rungOfTier } from '../lib/tiers'
import { GRADE_FILL_SPEED, chargedNameFor, cutGradeOf } from '../lib/gemGrades'
import { updateQuestObjectiveProgress } from '../routes/quests'

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
 * Take `hundredths` of Talar out of the reservoir inside the caller's
 * transaction (a spell's cost). Locked, relative, and conditional on there
 * being enough: returns the state after, or null when the reservoir is short,
 * having changed nothing. The caller throws on null, so its own writes roll
 * back with it (CLAUDE.md §4 rule 3). The push waits for the commit.
 */
export async function spendTalarWithin(trx: any, playerId: number, hundredths: number): Promise<TalarState | null> {
    const n = Math.ceil(hundredths)
    if (!Number.isFinite(n) || n < 0) throw new Error(`spendTalarWithin: bad amount ${hundredths} for player ${playerId}`)
    await lockReservoir(trx, playerId)
    const [row] = await trx('player_talar')
        .where({ player_id: playerId })
        .where('hundredths', '>=', n)
        .update({ hundredths: trx.raw('hundredths - ?', [n]), updated_at: trx.fn.now() })
        .returning('hundredths')
    if (!row) return null
    const state = stateOf(Number(row.hundredths), reservoirCapacity(await playerSkillLevel(playerId, 'Talar', trx)))
    pushToPlayerAfterCommit(trx, playerId, 'talar_changed', state)
    return state
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
        // After the commit: quest progress writes through the global connection.
        await updateQuestObjectiveProgress(playerId, 'talar_absorb', item.name, 1)
        logger.info(`[talar] player ${playerId} absorbed ${item.name} (+${poured}), now ${talar.current}/${talar.max}`)
        return { success: true, itemName: item.name, poured, talar }
    } catch (err) {
        if (err instanceof TalarAbort) return { success: false, error: err.message }
        logger.error(`absorbGem error (player ${playerId}): ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}

// ── Filling at a rift (docs/talar-spec.md §3) ────────────────────────────────
//
// One repeating action. Each cycle pours Talar into the open gem and pays a
// slice of XP at the gem's own band (gathering x1.0, the level its tier opens
// at), so a quartz pays the T1 band at Talar 20 as a lower node would. A full
// gem becomes its charged form in the pack and the next of the same kind is
// opened, until none are left.
//
// The open gem has LEFT the pack (player_talar_open_gem), as an open bucket has
// (services/liquids.ts): never held twice, never traded or dropped, and kept on
// death because it has no pack row to drop. Stopping keeps it; the next start
// resumes it.

export const FILL_CYCLE_SECONDS = 60

/**
 * Hundredths of Talar one cycle pours into a gem of this rate and grade.
 * Rounded up, so a gem never takes a cycle longer than its rate says
 * (200 an hour is 333.3 a minute; rounding down left a 30-minute quartz at 31).
 */
export function pourPerCycle(talarPerHour: number, grade: number): number {
    return Math.ceil(talarPerHour * GRADE_FILL_SPEED[grade] * HUNDREDTHS * FILL_CYCLE_SECONDS / 3600)
}

/** Whole minutes to fill a gem from empty. */
export function minutesToFill(talar: number, talarPerHour: number, grade: number): number {
    return Math.ceil((talar * HUNDREDTHS) / pourPerCycle(talarPerHour, grade)) * FILL_CYCLE_SECONDS / 60
}

/** The level a gem can first be filled at: the level its tier opens at. */
function fillLevel(tier: number): number {
    return rungOfTier(Number(tier) || 1)
}

async function atRift(playerId: number): Promise<boolean> {
    const row = await db('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId).first('l.is_rift')
    return !!row?.is_rift
}

const CUT_GEM_COLUMNS = ['i.id', 'i.name', 'i.quality', 'i.tier', 'i.talar', 'i.talar_per_hour']

export interface FillOption {
    itemId: number
    name: string
    quantity: number
    talar: number
    minutes: number
    level: number
    canFill: boolean
}

/** What the fill menu shows: the gem already open, and every cut gem in the pack. */
export async function fillOptions(playerId: number): Promise<{
    atRift: boolean
    open: { itemId: number; name: string; filled: number; talar: number } | null
    gems: FillOption[]
}> {
    const [rift, level, openRow, packRows] = await Promise.all([
        atRift(playerId),
        playerSkillLevel(playerId, 'Talar'),
        db('player_talar_open_gem as o').join('items as i', 'i.id', 'o.item_id')
            .where('o.player_id', playerId).first('i.id', 'i.name', 'i.talar', 'o.filled_hundredths'),
        db('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
            .where('pi.player_id', playerId).where('pi.quantity', '>', 0)
            .where('i.type', 'gem').whereNotNull('i.talar_per_hour')
            .orderBy([{ column: 'i.tier' }, { column: 'i.talar' }])
            .select(...CUT_GEM_COLUMNS, 'pi.quantity'),
    ])
    return {
        atRift: rift,
        open: openRow ? {
            itemId: openRow.id, name: openRow.name, talar: Number(openRow.talar),
            filled: Math.floor(Number(openRow.filled_hundredths) / HUNDREDTHS),
        } : null,
        gems: packRows.map((g: any) => ({
            itemId: g.id, name: g.name, quantity: Number(g.quantity), talar: Number(g.talar),
            minutes: minutesToFill(Number(g.talar), Number(g.talar_per_hour), Math.max(0, cutGradeOf(g.quality))),
            level: fillLevel(g.tier),
            canFill: level >= fillLevel(g.tier),
        })),
    }
}

/**
 * Start filling: resume the open gem, or open `itemId` from the pack. The gem
 * moves and the action is inserted in one transaction, so a refused start
 * (another action already running) leaves the pack as it was.
 */
export async function startFill(
    playerId: number,
    itemId: number | null,
): Promise<{ ok: true; timerSeconds: number; gemName: string } | { ok: false; error: string; status: number }> {
    try {
        if (!(await atRift(playerId))) return { ok: false, status: 400, error: 'Gems are filled at a rift, where the light comes up out of the ground.' }
        const level = await playerSkillLevel(playerId, 'Talar')

        const gemName = await db.transaction(async trx => {
            const player = await trx('players').where({ id: playerId }).forNoKeyUpdate().first('current_location_id')
            const open = await trx('player_talar_open_gem as o').join('items as i', 'i.id', 'o.item_id')
                .where('o.player_id', playerId).forUpdate('o').first('i.name')
            let name: string
            if (open) {
                name = open.name
            } else {
                const id = Math.floor(Number(itemId))
                const gem = Number.isFinite(id) && id > 0
                    ? await trx('items as i').where('i.id', id).first(...CUT_GEM_COLUMNS)
                    : null
                if (!gem || !gem.talar_per_hour || cutGradeOf(gem.quality) < 0) throw new TalarAbort('That stone will not take any light.')
                if (level < fillLevel(gem.tier)) throw new TalarAbort(`You need Talar level ${fillLevel(gem.tier)} to fill that.`)
                const taken = await takeItemsWithin(trx, playerId, [{ name: gem.name, quantity: 1 }])
                if (!taken.ok) throw new TalarAbort(`You have no ${gem.name}.`)
                await trx('player_talar_open_gem').insert({ player_id: playerId, item_id: gem.id, filled_hundredths: 0 })
                name = gem.name
            }

            const now = new Date()
            await trx('player_actions').insert({
                player_id: playerId,
                action_type: 'talar_fill',
                action_data: null,
                location_id: player.current_location_id,
                started_at: now,
                completes_at: new Date(now.getTime() + FILL_CYCLE_SECONDS * 1000),
                auto_restart: true,
                last_timer_seconds: FILL_CYCLE_SECONDS,
                last_bot_check: now,
                bot_check_pending: false,
            })
            return name
        })

        notifyInventoryChanged(playerId)
        return { ok: true, timerSeconds: FILL_CYCLE_SECONDS, gemName }
    } catch (err: any) {
        if (err instanceof TalarAbort) return { ok: false, status: 400, error: err.message }
        // The unique index on player_actions.player_id is the real guard (CLAUDE.md §9).
        if (err?.code === '23505') return { ok: false, status: 409, error: 'You are already performing an action' }
        logger.error(`startFill error (player ${playerId}): ${err}`)
        return { ok: false, status: 500, error: SERVER_ERROR }
    }
}

export interface FillCycleResult {
    success: boolean
    error?: string
    xpAwarded?: number
    skillName?: string
    /** Set when a gem filled: the charged stone that went into the pack. */
    itemName?: string
    quantity?: number
    message?: string
    /** Whether there is a gem open to go on filling. */
    carryOn?: boolean
}

/** One cycle at the rift, for the tick. Re-checks where the player stands every time. */
export async function resolveFillCycle(playerId: number): Promise<FillCycleResult> {
    try {
        if (!(await atRift(playerId))) return { success: false, error: 'You have left the Rift.' }

        const outcome = await db.transaction(async trx => {
            const open = await trx('player_talar_open_gem as o').join('items as i', 'i.id', 'o.item_id')
                .where('o.player_id', playerId).forUpdate('o')
                .first('o.filled_hundredths', ...CUT_GEM_COLUMNS)
            if (!open) throw new TalarAbort('There is no stone in your hand to fill.')

            const grade = Math.max(0, cutGradeOf(open.quality))
            const capacity = Number(open.talar) * HUNDREDTHS
            const filled = Math.min(capacity, Number(open.filled_hundredths) + pourPerCycle(Number(open.talar_per_hour), grade))

            const xp = activeXpForSeconds(fillLevel(open.tier), FILL_CYCLE_SECONDS)
            await awardXp(playerId, 'Talar', xp, trx)
            await incrementStats(playerId, { total_actions_completed: 1 }, trx)

            const gemWord = String(open.name).split(' ').slice(1).join(' ').toLowerCase()
            if (filled < capacity) {
                await trx('player_talar_open_gem').where({ player_id: playerId })
                    .update({ filled_hundredths: filled, updated_at: trx.fn.now() })
                return {
                    xp, carryOn: true, itemName: undefined as string | undefined,
                    message: `The ${gemWord} takes in a little more light. ${Math.floor(filled / HUNDREDTHS)} of ${open.talar}.`,
                }
            }

            // Full: the charged stone goes into the pack, and the next of the
            // same kind is opened if there is one.
            const chargedName = chargedNameFor(open.name, grade)
            const charged = await trx('items').where({ name: chargedName }).first('id')
            if (!charged) throw new Error(`no charged item ${chargedName}`)
            await trx('player_talar_open_gem').where({ player_id: playerId }).delete()
            await addItemToInventoryWithin(trx, playerId, charged.id, 1)

            const next = await takeItemsWithin(trx, playerId, [{ name: open.name, quantity: 1 }])
            if (next.ok) {
                await trx('player_talar_open_gem').insert({ player_id: playerId, item_id: open.id, filled_hundredths: 0 })
            }
            return {
                xp, carryOn: next.ok, itemName: chargedName,
                message: next.ok
                    ? `The ${gemWord} is full and glowing. You take up the next.`
                    : `The ${gemWord} is full and glowing. That was your last ${open.name}.`,
            }
        })

        notifyInventoryChanged(playerId)
        if (outcome.itemName) await updateQuestObjectiveProgress(playerId, 'talar_fill', outcome.itemName, 1)
        return {
            success: true,
            xpAwarded: outcome.xp,
            skillName: 'Talar',
            itemName: outcome.itemName,
            quantity: outcome.itemName ? 1 : undefined,
            message: outcome.message,
            carryOn: outcome.carryOn,
        }
    } catch (err) {
        if (err instanceof TalarAbort) return { success: false, error: err.message }
        logger.error(`resolveFillCycle error (player ${playerId}): ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}
