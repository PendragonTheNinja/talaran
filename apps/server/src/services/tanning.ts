import db from '../db'
import { levelFromXp } from './xp'
import { logger } from '../lib/logger'
import { incrementStats } from './stats'

// ── Tanning (docs/crafting-launch-spec.md) ────────────────────────
// Crafting's passive tempo. Mirrors the kiln: load a batch, fixed soak, collect.
// No tick sweep — the job simply becomes ready and waits.
// The rack is a workstation (type 'tanning'), built by Carpentry and set up at
// a location, exactly like the smithing anvil/sawhorse pattern.
// Recipes with mode='passive' + station='tanning' are soak jobs; their
// timer_seconds is the soak duration, xp is per hide, output_qty is per hide.

// A tannery is a rack (scraping, stretching) plus a barrel (the bark-liquor
// soak). Both are consumed on setup — same shape as smithing's anvil/hammer/tongs.
const STATION_ITEMS = ['Lanai Tanning Rack', 'Lanai Tanning Barrel']
const WORKSTATION_TYPE = 'tanning'
export const HIDES_PER_VAT = 10

/**
 * Vats by Crafting level. Each vat soaks its own hide type on its own timer,
 * so a tanner can stage several soaks at once and stagger collection.
 */
export function maxVatsForLevel(level: number): number {
    return level >= 40 ? 5
        : level >= 30 ? 4
            : level >= 20 ? 3
                : level >= 10 ? 2
                    : 1
}

async function craftingLevel(playerId: number): Promise<number> {
    const skill = await db('skills').where({ name: 'Crafting' }).first()
    if (!skill) return 1
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first()
    return ps ? levelFromXp(parseInt(ps.xp)) : 1
}

interface RecipeInput { itemName: string; qty: number }

function parseInputs(inputsJson: string): RecipeInput[] {
    try { return JSON.parse(inputsJson) } catch { return [] }
}

export async function getRack(playerId: number, locationId: number): Promise<any> {
    return db('workstations')
        .where({ player_id: playerId, location_id: locationId, type: WORKSTATION_TYPE })
        .first()
}

/** Set up a tanning rack here: consumes the rack item, creates the workstation. */
export async function setupRack(playerId: number, locationId: number): Promise<{ success: boolean; error?: string }> {
    try {
        const existing = await getRack(playerId, locationId)
        if (existing) return { success: false, error: 'You already have a tannery here.' }

        await db.transaction(async (trx) => {
            for (const itemName of STATION_ITEMS) {
                const item = await trx('items').where({ name: itemName }).first()
                if (!item) throw new Error(`MISSING:${itemName}`)
                const inv = await trx('player_inventory')
                    .where({ player_id: playerId, item_id: item.id }).forUpdate().first()
                if (!inv || inv.quantity < 1) throw new Error(`MISSING:${itemName}`)

                if (inv.quantity <= 1) {
                    await trx('player_inventory').where({ id: inv.id }).delete()
                } else {
                    await trx('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - 1 })
                }
            }

            await trx('workstations').insert({
                player_id: playerId,
                location_id: locationId,
                type: WORKSTATION_TYPE,
                tier: 1,
                is_active: true,
            })
        })

        logger.info(`Player ${playerId} set up a tannery at location ${locationId}`)
        return { success: true }
    } catch (err: any) {
        if (err.message?.startsWith('MISSING:')) {
            return { success: false, error: `You need a ${err.message.slice(8)} to set up a tannery.` }
        }
        logger.error('setupRack error: ' + err)
        return { success: false, error: 'Server error' }
    }
}

/** Every recipe the rack can run. */
export async function getTanRecipes() {
    // Grouped by what comes OUT, then by level. Ordering on level alone
    // interleaved the two material families (Cowhide sits at 9, between Boarhide
    // and Slothhide), so the wild buckskin line and the farmed leather line read
    // as one confusing ladder instead of two.
    return db('recipes')
        .where({ is_active: true, mode: 'passive', station: WORKSTATION_TYPE })
        .orderBy('output_item_name')
        .orderBy('required_level')
}

/** Load the rack: consumes inputs x hideCount, schedules the soak. Transactional. */
export async function loadRack(playerId: number, locationId: number, recipeId: number, hideCount: number): Promise<{ success: boolean; error?: string; readyAt?: Date }> {
    try {
        const rack = await getRack(playerId, locationId)
        if (!rack) return { success: false, error: 'You have no tanning rack here.' }

        const recipe = await db('recipes')
            .where({ id: recipeId, is_active: true, mode: 'passive', station: WORKSTATION_TYPE })
            .first()
        if (!recipe) return { success: false, error: 'That cannot be tanned.' }

        const level = await craftingLevel(playerId)
        if (level < recipe.required_level) {
            return { success: false, error: `You need Crafting level ${recipe.required_level} to tan that.` }
        }

        // Any count fits a vat — one hide is allowed, it's just a wasteful use of six hours.
        if (!Number.isInteger(hideCount) || hideCount <= 0 || hideCount > HIDES_PER_VAT) {
            return { success: false, error: `A vat holds 1 to ${HIDES_PER_VAT} hides.` }
        }

        const maxVats = maxVatsForLevel(level)
        const activeRow = await db('tanning_jobs')
            .where({ player_id: playerId, location_id: locationId, is_collected: false })
            .count('id as count').first()
        const inUse = activeRow ? parseInt(String(activeRow.count)) : 0
        if (inUse >= maxVats) {
            return { success: false, error: `All ${maxVats} of your vats are full. Collect one first.` }
        }

        const inputs = parseInputs(recipe.inputs)
        let readyAt = new Date()

        await db.transaction(async (trx) => {
            for (const input of inputs) {
                const needed = input.qty * hideCount
                const item = await trx('items').where({ name: input.itemName }).first()
                if (!item) throw new Error(`MISSING_ITEM:${input.itemName}`)
                const inv = await trx('player_inventory')
                    .where({ player_id: playerId, item_id: item.id }).forUpdate().first()
                if (!inv || inv.quantity < needed) throw new Error(`NEED:${needed}x ${input.itemName}`)

                if (inv.quantity === needed) {
                    await trx('player_inventory').where({ id: inv.id }).delete()
                } else {
                    await trx('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - needed })
                }
            }

            const now = new Date()
            readyAt = new Date(now.getTime() + recipe.timer_seconds * 1000)

            await trx('tanning_jobs').insert({
                player_id: playerId,
                location_id: locationId,
                recipe_id: recipe.id,
                hide_count: hideCount,
                buckskin_yield: recipe.output_qty * hideCount,
                xp_reward: recipe.xp * hideCount,
                started_at: now,
                ready_at: readyAt,
                is_collected: false,
            })
        })

        logger.info(`Player ${playerId} loaded rack: ${hideCount}x ${recipe.name}, ready at ${readyAt.toISOString()}`)
        return { success: true, readyAt }
    } catch (err: any) {
        if (err.message?.startsWith('NEED:')) return { success: false, error: `You need ${err.message.slice(5)}.` }
        if (err.message?.startsWith('MISSING_ITEM:')) return { success: false, error: `Required item not found: ${err.message.slice(13)}` }
        logger.error('loadRack error: ' + err)
        return { success: false, error: 'Server error' }
    }
}

/** Collect a finished soak. Transactional + row-locked (no double-collect). */
export async function collectRack(playerId: number, jobId: number): Promise<{
    success: boolean
    error?: string
    itemName?: string
    quantity?: number
    xpAwarded?: number
}> {
    try {
        let result: any = null

        await db.transaction(async (trx) => {
            const job = await trx('tanning_jobs')
                .where({ id: jobId, player_id: playerId, is_collected: false })
                .forUpdate().first()
            if (!job) throw new Error('NO_JOB')

            const now = new Date()
            if (now < new Date(job.ready_at)) {
                const remaining = Math.ceil((new Date(job.ready_at).getTime() - now.getTime()) / 60000)
                throw new Error(`NOT_READY:${remaining}`)
            }

            const recipe = await trx('recipes').where({ id: job.recipe_id }).first()
            if (!recipe) throw new Error('NO_JOB')

            const outputItem = await trx('items').where({ name: recipe.output_item_name }).first()
            if (outputItem) {
                const existing = await trx('player_inventory')
                    .where({ player_id: playerId, item_id: outputItem.id }).first()
                if (existing) {
                    await trx('player_inventory').where({ id: existing.id }).increment('quantity', job.buckskin_yield)
                } else {
                    await trx('player_inventory').insert({
                        player_id: playerId, item_id: outputItem.id, quantity: job.buckskin_yield,
                    })
                }
            }

            const craftingSkill = await trx('skills').where({ name: 'Crafting' }).first()
            if (craftingSkill) {
                const ps = await trx('player_skills')
                    .where({ player_id: playerId, skill_id: craftingSkill.id }).first()
                if (ps) {
                    await trx('player_skills')
                        .where({ player_id: playerId, skill_id: craftingSkill.id })
                        .increment('xp', job.xp_reward)
                } else {
                    await trx('player_skills').insert({
                        player_id: playerId, skill_id: craftingSkill.id, xp: job.xp_reward,
                    })
                }
            }

            await trx('tanning_jobs').where({ id: job.id }).update({ is_collected: true })

            result = {
                success: true,
                itemName: recipe.output_item_name,
                quantity: job.buckskin_yield,
                xpAwarded: job.xp_reward,
            }
        })

        if (result) {
            await incrementStats(playerId, { total_xp_earned: result.xpAwarded })
            logger.info(`Player ${playerId} collected ${result.quantity}x ${result.itemName} from the rack`)
        }
        return result
    } catch (err: any) {
        if (err.message === 'NO_JOB') return { success: false, error: 'You have nothing soaking here.' }
        if (err.message?.startsWith('NOT_READY:')) {
            return { success: false, error: `Your hides are still soaking. ${err.message.slice(10)} minutes remaining.` }
        }
        logger.error('collectRack error: ' + err)
        return { success: false, error: 'Server error' }
    }
}

/** Everything the tanning panel needs in one call. */
export async function getRackStatus(playerId: number, locationId: number) {
    const rack = await getRack(playerId, locationId)
    const level = await craftingLevel(playerId)
    const maxVats = maxVatsForLevel(level)

    const stationItems: { itemName: string; have: number }[] = []
    for (const itemName of STATION_ITEMS) {
        const item = await db('items').where({ name: itemName }).first()
        const inv = item
            ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first()
            : null
        stationItems.push({ itemName, have: inv ? inv.quantity : 0 })
    }
    const canSetup = stationItems.every(i => i.have >= 1)

    const activeJobs = await db('tanning_jobs')
        .where({ player_id: playerId, location_id: locationId, is_collected: false })
        .orderBy('ready_at')

    const now = new Date()
    const vats = []
    for (const job of activeJobs) {
        const recipe = await db('recipes').where({ id: job.recipe_id }).first()
        const isReady = now >= new Date(job.ready_at)
        vats.push({
            id: job.id,
            recipeName: recipe ? recipe.name : 'Unknown',
            hideCount: job.hide_count,
            yield: job.buckskin_yield,
            outputItemName: recipe ? recipe.output_item_name : '',
            readyAt: job.ready_at,
            isReady,
            minutesRemaining: isReady ? 0 : Math.ceil((new Date(job.ready_at).getTime() - now.getTime()) / 60000),
        })
    }

    const recipes = await getTanRecipes()
    const recipeInfo = []
    for (const r of recipes) {
        const inputs = parseInputs(r.inputs)
        const held: { itemName: string; perHide: number; have: number }[] = []
        for (const input of inputs) {
            const item = await db('items').where({ name: input.itemName }).first()
            const inv = item
                ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first()
                : null
            held.push({ itemName: input.itemName, perHide: input.qty, have: inv ? inv.quantity : 0 })
        }
        recipeInfo.push({
            id: r.id,
            name: r.name,
            outputItemName: r.output_item_name,
            yieldPerHide: r.output_qty,
            xpPerHide: r.xp,
            requiredLevel: r.required_level,
            soakSeconds: r.timer_seconds,
            inputs: held,
            locked: level < r.required_level,
        })
    }

    return {
        hasRack: !!rack,
        stationItems,
        canSetup,
        craftingLevel: level,
        hidesPerVat: HIDES_PER_VAT,
        maxVats,
        vatsInUse: vats.length,
        readyCount: vats.filter(v => v.isReady).length,
        vats,
        recipes: recipeInfo,
    }
}
