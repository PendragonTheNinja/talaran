import db from '../db'
import { logger } from '../lib/logger'
import { levelFromXp } from './xp'
import { awardXp } from './xp'
import { incrementStats } from './stats'
import { addItemToInventoryWithin, takeItemsWithin, notifyInventoryChanged } from './inventory'
import { SERVER_ERROR } from '../lib/serviceResult'

// Brewing ale in a cask (docs/antura-plan.md §11; Nathan, 2026-11-20). The
// kiln's shape (services/smithing.ts): load batches at the cask, walk away, and
// collect when the clock has run. A cask is the town's (locations.has_cask,
// Mettlefell alone), so it never wears and never needs building.
//
// A batch is 3 Barley and 1 Meadowsweet for 4 Ale. How many batches go in
// rises with Cooking, so a big brewer makes a big cask: 40 Ale at Cooking 20,
// 100 from 35. XP is paid per batch on collecting: the passive clock is free,
// the trips to load and collect are what it pays for (CLAUDE.md §8).

export const BREW_LEVEL = 20
export const BREW_SECONDS = 6 * 3600
export const BATCH_INPUTS = [
    { itemName: 'Barley', qty: 3 },
    { itemName: 'Meadowsweet', qty: 1 },
]
export const ALE_PER_BATCH = 4
export const XP_PER_BATCH = 60

/** Batches a cask takes at this Cooking level: 10 at 20, 15 at 25, 20 at 30, 25 from 35. */
export function maxBatchesFor(level: number): number {
    if (level < BREW_LEVEL) return 0
    return Math.min(25, 10 + 5 * Math.floor((level - BREW_LEVEL) / 5))
}

/** A refusal from inside a brewing transaction: a throw, so nothing spent stays spent. */
class BrewAbort extends Error {}

async function cookingLevel(playerId: number, x: any = db): Promise<number> {
    const row = await x('player_skills as ps').join('skills as s', 's.id', 'ps.skill_id')
        .where({ 'ps.player_id': playerId, 's.name': 'Cooking' }).first('ps.xp')
    return row ? levelFromXp(Number(row.xp)) : 1
}

async function held(playerId: number, name: string): Promise<number> {
    const row = await db('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
        .where({ 'pi.player_id': playerId, 'i.name': name }).first('pi.quantity')
    return Number(row?.quantity ?? 0)
}

/** Where the player stands, when a cask is there. */
async function caskHere(playerId: number, x: any = db) {
    const row = await x('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId).first('l.id', 'l.name', 'l.has_cask')
    return row?.has_cask ? { id: Number(row.id), name: String(row.name) } : null
}

/** What the cask panel shows: the brew running (anywhere), and what could go in now. */
export async function caskState(playerId: number) {
    const here = await caskHere(playerId)
    const level = await cookingLevel(playerId)
    const job = await db('brew_jobs as b').join('locations as l', 'l.id', 'b.location_id')
        .where({ 'b.player_id': playerId, 'b.is_collected': false })
        .first('b.id', 'b.batches', 'b.ale_yield', 'b.ready_at', 'b.location_id', 'l.name as location')
    const readyAt = job ? new Date(job.ready_at) : null
    const maxBatches = maxBatchesFor(level)
    const barley = await held(playerId, 'Barley')
    const meadowsweet = await held(playerId, 'Meadowsweet')
    return {
        atCask: !!here,
        cookingLevel: level,
        levelRequired: BREW_LEVEL,
        maxBatches,
        // As many as the pack can make, up to what the cask takes.
        canMake: Math.min(maxBatches, Math.floor(barley / 3), meadowsweet),
        held: { barley, meadowsweet },
        perBatch: { inputs: BATCH_INPUTS, ale: ALE_PER_BATCH, xp: XP_PER_BATCH },
        seconds: BREW_SECONDS,
        brew: job ? {
            batches: Number(job.batches),
            ale: Number(job.ale_yield),
            location: job.location,
            here: !!here && here.id === Number(job.location_id),
            readyAt: readyAt!.toISOString(),
            ready: readyAt!.getTime() <= Date.now(),
        } : null,
    }
}

/** Fill the cask here with `batchesRaw` batches. One brew at a time, anywhere. */
export async function startBrew(playerId: number, batchesRaw: unknown): Promise<{ success: boolean; error?: string; message?: string }> {
    const batches = Math.floor(Number(batchesRaw))
    if (!Number.isFinite(batches) || batches < 1) return { success: false, error: 'Put at least one batch in the cask.' }
    try {
        await db.transaction(async (trx) => {
            // The player row first: a first brew has no job row to lock (CLAUDE.md §4 rule 4).
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id')
            const here = await caskHere(playerId, trx)
            if (!here) throw new BrewAbort('There is no cask here.')
            const level = await cookingLevel(playerId, trx)
            if (level < BREW_LEVEL) throw new BrewAbort(`Brewing ale wants Cooking ${BREW_LEVEL}.`)
            const max = maxBatchesFor(level)
            if (batches > max) throw new BrewAbort(`The cask takes ${max} batches at your Cooking level.`)
            const open = await trx('brew_jobs').where({ player_id: playerId, is_collected: false }).first('id')
            if (open) throw new BrewAbort('You already have a brew working. Draw it off first.')

            const taken = await takeItemsWithin(trx, playerId, BATCH_INPUTS.map(i => ({ name: i.itemName, quantity: i.qty * batches })))
            if (!taken.ok) throw new BrewAbort(`${batches} batches want ${batches * 3} Barley and ${batches} Meadowsweet.`)

            const now = Date.now()
            await trx('brew_jobs').insert({
                player_id: playerId, location_id: here.id, batches,
                ale_yield: batches * ALE_PER_BATCH, xp_reward: batches * XP_PER_BATCH,
                started_at: new Date(now), ready_at: new Date(now + BREW_SECONDS * 1000), is_collected: false,
            })
        })
        notifyInventoryChanged(playerId)
        logger.info(`Player ${playerId} started a brew of ${batches} batches`)
        return { success: true, message: `You tip the barley and meadowsweet into the cask and knock the bung home. In six hours it will be ale, ${batches * ALE_PER_BATCH} of it.` }
    } catch (err: any) {
        if (err instanceof BrewAbort) return { success: false, error: err.message }
        // Two brews at once: the partial unique index refused the second.
        if (err?.code === '23505') return { success: false, error: 'You already have a brew working. Draw it off first.' }
        logger.error(`startBrew error: ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}

/** Draw off a finished brew at its cask. The flip of is_collected is the gate, so it pays once. */
export async function collectBrew(playerId: number): Promise<{ success: boolean; error?: string; message?: string; itemName?: string; quantity?: number; xp?: number }> {
    try {
        const job = await db.transaction(async (trx) => {
            const here = await caskHere(playerId, trx)
            const found = await trx('brew_jobs').where({ player_id: playerId, is_collected: false }).forUpdate().first()
            if (!found) throw new BrewAbort('You have no brew working.')
            if (!here || here.id !== Number(found.location_id)) throw new BrewAbort('Your brew is in another cask.')
            const left = new Date(found.ready_at).getTime() - Date.now()
            if (left > 0) throw new BrewAbort(`It is still working. ${Math.ceil(left / 60000)} minutes to go.`)

            const flipped = await trx('brew_jobs').where({ id: found.id, is_collected: false }).update({ is_collected: true })
            if (flipped !== 1) throw new BrewAbort('That brew has already been drawn off.')

            const ale = await trx('items').where({ name: 'Ale' }).first('id')
            if (!ale) throw new Error('Ale item row is missing')
            await addItemToInventoryWithin(trx, playerId, ale.id, Number(found.ale_yield))
            await awardXp(playerId, 'Cooking', Number(found.xp_reward), trx)
            await incrementStats(playerId, { total_actions_completed: 1 }, trx)
            return found
        })
        notifyInventoryChanged(playerId)
        logger.info(`Player ${playerId} drew off ${job.ale_yield} Ale`)
        return {
            success: true, itemName: 'Ale', quantity: Number(job.ale_yield), xp: Number(job.xp_reward),
            message: `You draw off ${job.ale_yield} Ale, cloudy and sweet.`,
        }
    } catch (err) {
        if (err instanceof BrewAbort) return { success: false, error: err.message }
        logger.error(`collectBrew error: ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}
