import db from '../db'
import { levelFromXp } from './xp'
import { logger } from '../lib/logger'
import { incrementStats } from './stats'
import { updateQuestObjectiveProgress } from '../routes/quests'

// ── Generic recipe executor (docs/trapping-spec.md §4) ────────────
// Recipes are rows in the `recipes` table; this service runs any of them.
// First tenants: Fletch Arrows (Smithing), Tie Snare (Crafting).
// Inputs are consumed at completion (house pattern, matches woodworking).

export interface RecipeResult {
    success: boolean
    error?: string
    itemName?: string
    quantity?: number
    xpAwarded?: number
    skillName?: string
    ingredientsRemaining?: { name: string; quantity: number }[]
    outputTotal?: number
}

interface RecipeInput { itemName: string; qty: number }

function parseInputs(inputsJson: string): RecipeInput[] {
    try { return JSON.parse(inputsJson) } catch { return [] }
}

async function skillInfo(playerId: number, skillName: string): Promise<{ skillId: number | null; level: number }> {
    const skill = await db('skills').where({ name: skillName }).first()
    if (!skill) return { skillId: null, level: 1 }
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first()
    return { skillId: skill.id, level: ps ? levelFromXp(parseInt(ps.xp)) : 1 }
}

/**
 * Station rule, matching the legacy carpentry behaviour exactly:
 * an ACTIVE workstation of the recipe's type at your location = full speed,
 * otherwise you're making do at the public bench and it takes twice as long.
 */
export async function stationMultiplier(playerId: number, recipe: any): Promise<number> {
    if (!recipe.station) return 1
    const player = await db('players').where({ id: playerId }).first()
    if (!player) return 2
    const ws = await db('workstations')
        .where({ player_id: playerId, location_id: player.current_location_id, type: recipe.station })
        .first()
    return ws?.is_active ? 1 : 2
}

/** Effective timer for a recipe, station penalty included. */
export async function recipeTimerFor(playerId: number, recipe: any): Promise<number> {
    const mult = await stationMultiplier(playerId, recipe)
    return recipe.timer_seconds * mult
}

async function hasInputs(playerId: number, inputs: RecipeInput[]): Promise<{ ok: boolean; error?: string }> {
    for (const input of inputs) {
        const item = await db('items').where({ name: input.itemName }).first()
        const inv = item
            ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first()
            : null
        if (!inv || inv.quantity < input.qty) {
            return { ok: false, error: `You need ${input.qty}x ${input.itemName}.` }
        }
    }
    return { ok: true }
}

async function inputsRemaining(playerId: number, inputs: RecipeInput[]): Promise<{ name: string; quantity: number }[]> {
    const remaining: { name: string; quantity: number }[] = []
    for (const input of inputs) {
        const item = await db('items').where({ name: input.itemName }).first()
        const inv = item
            ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first()
            : null
        remaining.push({ name: input.itemName, quantity: inv ? inv.quantity : 0 })
    }
    return remaining
}

export async function getActiveRecipes() {
    // mode='passive' recipes (tanning soaks) are run by their station, not the executor
    const recipes = await db('recipes').where({ is_active: true, mode: 'active' }).orderBy(['skill', 'required_level'])
    return recipes.map((r: any) => ({
        id: r.id,
        skill: r.skill,
        name: r.name,
        outputItemName: r.output_item_name,
        outputQty: r.output_qty,
        inputs: parseInputs(r.inputs),
        requiredLevel: r.required_level,
        timerSeconds: r.timer_seconds,
        xp: r.xp,
        station: r.station,
        forSkill: r.for_skill || r.skill,
    }))
}

export async function canStartRecipe(playerId: number, recipeId: number): Promise<{ allowed: boolean; reason?: string; recipe?: any }> {
    const recipe = await db('recipes').where({ id: recipeId, is_active: true }).first()
    if (!recipe) return { allowed: false, reason: 'Unknown recipe.' }
    if (recipe.mode === 'passive') {
        return { allowed: false, reason: `${recipe.name} is done at a ${recipe.station}, not at the bench.` }
    }

    const { level } = await skillInfo(playerId, recipe.skill)
    if (level < recipe.required_level) {
        return { allowed: false, reason: `You need ${recipe.skill} level ${recipe.required_level}.` }
    }

    const check = await hasInputs(playerId, parseInputs(recipe.inputs))
    if (!check.ok) return { allowed: false, reason: check.error }

    return { allowed: true, recipe }
}

/** Resolve one completed craft: consume inputs, award output + XP. Called by the tick. */
export async function resolveRecipe(playerId: number, recipeId: number): Promise<RecipeResult> {
    try {
        const recipe = await db('recipes').where({ id: recipeId, is_active: true }).first()
        if (!recipe) return { success: false, error: 'Unknown recipe.' }
        if (recipe.mode === 'passive') return { success: false, error: 'That is not a bench craft.' }

        const inputs = parseInputs(recipe.inputs)
        const { skillId, level } = await skillInfo(playerId, recipe.skill)
        if (level < recipe.required_level) {
            return { success: false, error: `You need ${recipe.skill} level ${recipe.required_level}.` }
        }

        const check = await hasInputs(playerId, inputs)
        if (!check.ok) return { success: false, error: check.error }

        // Consume inputs
        for (const input of inputs) {
            const item = await db('items').where({ name: input.itemName }).first()
            if (!item) return { success: false, error: `Required item not found: ${input.itemName}` }
            const inv = await db('player_inventory')
                .where({ player_id: playerId, item_id: item.id }).first()
            if (!inv || inv.quantity < input.qty) return { success: false, error: `You need ${input.qty}x ${input.itemName}.` }
            if (inv.quantity === input.qty) {
                await db('player_inventory').where({ id: inv.id }).delete()
            } else {
                await db('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - input.qty })
            }
        }

        // Award output
        const outputItem = await db('items').where({ name: recipe.output_item_name }).first()
        if (outputItem) {
            const existing = await db('player_inventory')
                .where({ player_id: playerId, item_id: outputItem.id }).first()
            if (existing) {
                await db('player_inventory').where({ id: existing.id }).increment('quantity', recipe.output_qty)
            } else {
                await db('player_inventory').insert({ player_id: playerId, item_id: outputItem.id, quantity: recipe.output_qty })
            }
        }

        // Award XP — creating the player_skills row if it doesn't exist yet
        // (Crafting XP banks against the hidden skill until it launches)
        if (skillId) {
            const ps = await db('player_skills').where({ player_id: playerId, skill_id: skillId }).first()
            if (ps) {
                await db('player_skills').where({ player_id: playerId, skill_id: skillId }).increment('xp', recipe.xp)
            } else {
                await db('player_skills').insert({ player_id: playerId, skill_id: skillId, xp: recipe.xp })
            }
        }

        await updateQuestObjectiveProgress(playerId, 'craft', recipe.output_item_name, 1)
        await incrementStats(playerId, { total_actions_completed: 1, total_xp_earned: recipe.xp })

        logger.info(`Player ${playerId} crafted ${recipe.output_qty}x ${recipe.output_item_name} (${recipe.name})`)

        const remaining = await inputsRemaining(playerId, inputs)
        const totalRow = outputItem
            ? await db('player_inventory').where({ player_id: playerId, item_id: outputItem.id }).first()
            : null

        return {
            success: true,
            itemName: recipe.output_item_name,
            quantity: recipe.output_qty,
            xpAwarded: recipe.xp,
            skillName: recipe.skill,
            ingredientsRemaining: remaining,
            outputTotal: totalRow ? totalRow.quantity : recipe.output_qty,
        }
    } catch (err) {
        logger.error(`resolveRecipe error: ${err}`)
        return { success: false, error: 'Server error' }
    }
}
