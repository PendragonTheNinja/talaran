import db from '../db'
import { isLiquid, liquidTotal, consumeLiquid } from './liquids'
import { levelFromXp } from './xp'
import { logger } from '../lib/logger'
import { incrementStats } from './stats'
import { updateQuestObjectiveProgress } from '../routes/quests'
import { checkStation, parseRequiredTools } from './workstations'
import { buffTimerBonus, timerCut } from './buffs'
import { awardXp } from './xp';

// ── Generic recipe executor (docs/trapping-spec.md §4) ────────────
// Recipes are rows in the `recipes` table; this service runs any of them.
// First tenants: Fletch Arrows (Smithing), Tie Snare (Crafting).
// Inputs are consumed at completion (house pattern, matches woodworking).

export interface RecipeResult {
    success: boolean
    error?: string
    /** True when the dish was ruined. The action still succeeded and still paid
        XP, just half of it, and the output is a burnt item. */
    burnt?: boolean
    itemName?: string
    quantity?: number
    xpAwarded?: number
    skillName?: string
    ingredientsRemaining?: { name: string; quantity: number }[]
    outputTotal?: number
    /**
     * A second output the recipe leaves behind, such as straw from threshing.
     *
     * Also pushed onto `drops`, which is the channel every other action already
     * uses: gameTick reads it for the pickup flourish and the loot log, and the
     * client reads it for the extra "You gained…" line. Reporting it only in a
     * field of its own meant the straw really did arrive and nothing anywhere
     * said so, which is indistinguishable from a bug.
     */
    byproduct?: { itemName: string; quantity: number } | null
    drops?: { name: string; quantity: number; notable?: boolean }[]
}

/**
 * A recipe input is either a named item or a subtype wildcard.
 *
 * The wildcard exists for dishes that do not care which one you use: a fish
 * stew wants two cooked fish, not two cooked perch. Without it every such dish
 * would have to name a single species and make the other seventeen useless in
 * composites.
 *
 * { itemName: 'Onion', qty: 2 }
 * { subtype: 'cooked_fish', qty: 2, label: 'cooked fish' }
 */
interface RecipeInput {
    itemName?: string
    subtype?: string
    label?: string
    qty: number
}

/** What to call an input in a message, whether it is named or a wildcard. */
function inputLabel(input: RecipeInput): string {
    return input.itemName ?? input.label ?? input.subtype ?? 'something'
}

/**
 * Every stack in the pack matching a wildcard, cheapest first.
 *
 * Cheapest first so a stew eats your tiddles and leaves the sabreling alone.
 * Ordering by heal_amount then tier means the player is never quietly charged
 * their best ingredient for a dish that could not tell the difference.
 */
async function wildcardStacks(playerId: number, subtype: string) {
    return db('player_inventory as pi')
        .join('items as i', 'i.id', 'pi.item_id')
        .where('pi.player_id', playerId)
        .where('i.subtype', subtype)
        .where('pi.quantity', '>', 0)
        .orderBy([{ column: 'i.heal_amount', order: 'asc' }, { column: 'i.tier', order: 'asc' }])
        .select('pi.id as invId', 'pi.quantity as quantity', 'i.id as itemId', 'i.name as name')
}

// Liquid inputs are volume, not inventory rows. A recipe still writes
// { itemName: 'Milk', qty: 3 } and knows nothing about buckets; these three
// helpers route it through services/liquids so partial containers work for every
// skill — Husbandry now, Cooking later — without either one being aware.
/**
 * Recipe inputs, from either shape they arrive in.
 *
 * The column is JSON, so a row read straight from the database gives a string
 * — but getActiveRecipes() parses it before handing recipes on, so anything
 * working from that list already holds an array. Calling JSON.parse on the
 * array coerces it to "[object Object]", throws, and returns an empty list,
 * which reads as "this recipe needs nothing". That is exactly how the new
 * affordability check came out saying every dish was affordable.
 *
 * Accepting both is the honest fix: the function's job is "give me the inputs",
 * and there is no version of that job where silently returning none is right.
 */
function parseInputs(inputs: unknown): RecipeInput[] {
    if (Array.isArray(inputs)) return inputs as RecipeInput[]
    if (typeof inputs === 'string') {
        try {
            const parsed = JSON.parse(inputs)
            return Array.isArray(parsed) ? parsed : []
        } catch { return [] }
    }
    return []
}

async function skillInfo(playerId: number, skillName: string): Promise<{ skillId: number | null; level: number }> {
    const skill = await db('skills').where({ name: skillName }).first()
    if (!skill) return { skillId: null, level: 1 }
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first()
    return { skillId: skill.id, level: ps ? levelFromXp(parseInt(ps.xp)) : 1 }
}

/**
 * Station rule, now driven by socketed tools rather than a boolean.
 *
 * Was: an active workstation of the recipe's type = full speed, otherwise
 * double. That could not express "this dish needs a cauldron" or "a crude
 * hammer works, slowly", so it moved to services/workstations.
 *
 * Kept as a thin wrapper because gameTick and routes/recipes both call
 * recipeTimerFor, and a repeat action must re-derive its timer the same way
 * the first one did. If they ever disagree, a repeating craft silently changes
 * speed on its second lap.
 */
export async function stationMultiplier(playerId: number, recipe: any): Promise<number> {
    const check = await checkStation(playerId, recipe, false)
    return check.multiplier
}

/** Effective timer for a recipe, station and tool tier included. */
export async function recipeTimerFor(playerId: number, recipe: any): Promise<number> {
    // Read only. canStartRecipe already lit the fire if it needed lighting.
    const check = await checkStation(playerId, recipe, false)
    // Applied to the station-adjusted timer, not the base one. Borrowing
    // Geoffrey's slow forge doubles the job, and a percentage buff should come
    // off what you are actually standing there for.
    const buff = await buffTimerBonus(playerId, recipe.skill)
    const base = Math.round(recipe.timer_seconds * check.multiplier)
    return Math.max(1, base - timerCut(base, buff))
}

/**
 * Does the player hold everything this recipe needs?
 *
 * Exported because the tick's repeat check MUST ask this and nothing else. It
 * used to carry its own copy that read `input.itemName` directly, which is
 * undefined for a wildcard input, so `where({ name: undefined })` threw
 * "Undefined binding(s)" every time a Fish Stew finished — see the note in
 * gameTick's recipe restart block for what that cost.
 */
export async function hasInputs(playerId: number, inputs: RecipeInput[]): Promise<{ ok: boolean; error?: string }> {
    for (const input of inputs) {
        if (input.subtype) {
            const stacks = await wildcardStacks(playerId, input.subtype)
            const total = stacks.reduce((n: number, r: any) => n + r.quantity, 0)
            if (total < input.qty) {
                return { ok: false, error: `You need ${input.qty} ${inputLabel(input)}.` }
            }
            continue
        }
        if (isLiquid(input.itemName!)) {
            if ((await liquidTotal(playerId, input.itemName!)) < input.qty) {
                return { ok: false, error: `You need ${input.qty} ${input.itemName!.toLowerCase()}.` }
            }
            continue
        }
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
        if (input.subtype) {
            const stacks = await wildcardStacks(playerId, input.subtype)
            remaining.push({
                name: inputLabel(input),
                quantity: stacks.reduce((n: number, r: any) => n + r.quantity, 0),
            })
            continue
        }
        if (isLiquid(input.itemName!)) {
            remaining.push({ name: input.itemName!, quantity: await liquidTotal(playerId, input.itemName!) })
            continue
        }
        const item = await db('items').where({ name: input.itemName }).first()
        const inv = item
            ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first()
            : null
        remaining.push({ name: input.itemName!, quantity: inv ? inv.quantity : 0 })
    }
    return remaining
}

/**
 * Which recipes the player can actually make right now, and what is short.
 *
 * The cookhouse listed every recipe identically, so a player read the menu,
 * got excited, and only found out what they were missing by clicking each one.
 * The station side of that was already answered per recipe by the route; this
 * is the materials side.
 *
 * Done as ONE pass over the pack rather than a check per recipe. hasInputs is
 * the right function for a single recipe and the wrong one for a hundred:
 * three queries each would be three hundred round trips to draw one list.
 * Liquids are volume rather than inventory rows, so the few liquid names that
 * appear across the whole list are totalled once each.
 */
export async function affordability(
    playerId: number,
    recipes: any[],
): Promise<Map<number, { canAfford: boolean; missingInputs: { name: string; need: number; have: number }[] }>> {
    // The pack, once: by item name and by subtype, for wildcard inputs.
    const rows = await db('player_inventory as pi')
        .join('items as i', 'i.id', 'pi.item_id')
        .where('pi.player_id', playerId)
        .where('pi.quantity', '>', 0)
        .select('i.name as name', 'i.subtype as subtype', 'pi.quantity as quantity')

    const byName = new Map<string, number>()
    const bySubtype = new Map<string, number>()
    for (const r of rows as any[]) {
        const qty = Number(r.quantity)
        byName.set(r.name, (byName.get(r.name) ?? 0) + qty)
        if (r.subtype) bySubtype.set(r.subtype, (bySubtype.get(r.subtype) ?? 0) + qty)
    }

    // Liquid volumes, once per distinct liquid across the whole list.
    const liquidNames = new Set<string>()
    for (const recipe of recipes) {
        for (const input of parseInputs(recipe.inputs)) {
            if (input.itemName && isLiquid(input.itemName)) liquidNames.add(input.itemName)
        }
    }
    const liquids = new Map<string, number>()
    for (const name of liquidNames) liquids.set(name, await liquidTotal(playerId, name))

    const out = new Map<number, { canAfford: boolean; missingInputs: { name: string; need: number; have: number }[] }>()
    for (const recipe of recipes) {
        const missingInputs: { name: string; need: number; have: number }[] = []
        for (const input of parseInputs(recipe.inputs)) {
            const need = input.qty
            let have: number
            if (input.subtype) {
                have = bySubtype.get(input.subtype) ?? 0
            } else if (isLiquid(input.itemName!)) {
                have = liquids.get(input.itemName!) ?? 0
            } else {
                have = byName.get(input.itemName!) ?? 0
            }
            if (have < need) missingInputs.push({ name: inputLabel(input), need, have })
        }
        out.set(recipe.id, { canAfford: missingInputs.length === 0, missingInputs })
    }
    return out
}

export async function getActiveRecipes() {
    // mode='passive' recipes (tanning soaks) are run by their station, not the executor
    // Left join for the output's buff, so a provision can be told apart from a
    // heal. buff_effect lives on items, not recipes, so reading r.buff_effect
    // off a bare recipes row was always undefined.
    const recipes = await db('recipes as r')
        .leftJoin('items as out', 'out.name', 'r.output_item_name')
        .where({ 'r.is_active': true, 'r.mode': 'active' })
        .orderBy(['r.skill', 'r.required_level'])
        .select('r.*', 'out.buff_effect as output_buff_effect')
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
        // Both spellings on purpose. checkStation reads the raw column, and the
        // list endpoint feeds it these mapped objects: without required_tools
        // every dish looked tool-less, so the menu showed it as available and
        // then the click refused it.
        required_tools: r.required_tools,
        requiredTools: parseRequiredTools(r),
        // Whether the output carries a buff, so the cookhouse can give
        // provisions their own tab rather than burying them among the heals.
        isProvision: !!r.output_buff_effect,
        // So a refresh can recover the scene text for a running craft. The
        // start endpoint returns it; the list did not, which left a reloaded
        // cook with a generic line and no fire.
        flavorText: r.flavor_text ?? null,
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

    // Tools before ingredients: being told you lack a cauldron is more useful
    // than being told you lack onions when both are true.
    const station = await checkStation(playerId, recipe)
    if (!station.ok) return { allowed: false, reason: station.error }

    const check = await hasInputs(playerId, parseInputs(recipe.inputs))
    if (!check.ok) return { allowed: false, reason: check.error }

    return { allowed: true, recipe }
}

/** Resolve one completed craft: consume inputs, award output + XP. Called by the tick. */
/**
 * Burn chance for a recipe at a given skill level.
 *
 * burn_base is the chance at the recipe's own level; burn_stop is the level
 * where it bottoms out at 1%. Linear between the two, and it never quite
 * reaches zero, so there is always a reason to pay attention.
 *
 * Below the recipe's own level cannot happen (the level gate refuses first),
 * so the curve only ever runs upward from base.
 */
export function burnChance(recipe: any, level: number): number {
    const base = Number(recipe?.burn_base ?? 0)
    if (base <= 0) return 0
    const stop = Number(recipe?.burn_stop ?? 0)
    const start = Number(recipe?.required_level ?? 1)
    if (!stop || stop <= start) return base
    if (level >= stop) return 1
    const progress = Math.max(0, (level - start)) / (stop - start)
    return base + (1 - base) * progress
}

/** The burnt counterpart of a cooked output, by what it was made from. */
function burntNameFor(recipe: any, outputSubtype: string | null): string | null {
    if (recipe.skill !== 'Cooking') return null
    switch (outputSubtype) {
        case 'cooked_fish': return 'Burnt Fish'
        case 'cooked_meat': return 'Burnt Meat'
        case 'baked': return 'Burnt Pastry'
        case 'dish': return 'Burnt Pottage'
        // Provisions burn as whatever they were built from. The recipe carries
        // no burn columns for the ones that cannot burn (infusions), so
        // burnChance returns 0 and this is never reached for them.
        case 'provision': return 'Burnt Pottage'
        default: return null
    }
}

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
            if (input.subtype) {
                // Cheapest stacks first, so a stew eats the tiddles and leaves
                // the sabreling alone. Spans stacks when one is not enough.
                let owed = input.qty
                for (const stack of await wildcardStacks(playerId, input.subtype)) {
                    if (owed <= 0) break
                    const take = Math.min(owed, stack.quantity)
                    if (take >= stack.quantity) {
                        await db('player_inventory').where({ id: stack.invId }).delete()
                    } else {
                        await db('player_inventory').where({ id: stack.invId })
                            .update({ quantity: stack.quantity - take })
                    }
                    owed -= take
                }
                if (owed > 0) return { success: false, error: `You need ${input.qty} ${inputLabel(input)}.` }
                continue
            }
            if (isLiquid(input.itemName!)) {
                // Draws from the open container first, cracks a sealed bucket if
                // it runs dry, and hands back the empty when one is drained.
                if (!(await consumeLiquid(playerId, input.itemName!, input.qty))) {
                    return { success: false, error: `You need ${input.qty} ${input.itemName!.toLowerCase()}.` }
                }
                continue
            }
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

        // Burn roll. Inputs are already gone by this point, which is the whole
        // cost of a burn: you keep the time and lose the fish.
        const intendedItem = await db('items').where({ name: recipe.output_item_name }).first()
        const burntName = burntNameFor(recipe, intendedItem?.subtype ?? null)
        const burnt = !!burntName && Math.random() * 100 < burnChance(recipe, level)

        // Award output
        const outputItem = burnt
            ? await db('items').where({ name: burntName }).first()
            : intendedItem
        if (outputItem) {
            const existing = await db('player_inventory')
                .where({ player_id: playerId, item_id: outputItem.id }).first()
            const awardedQty = burnt ? 1 : recipe.output_qty
            if (existing) {
                await db('player_inventory').where({ id: existing.id }).increment('quantity', awardedQty)
            } else {
                await db('player_inventory').insert({ player_id: playerId, item_id: outputItem.id, quantity: awardedQty })
            }
        }

        // Award the byproduct, if the recipe has one.
        //
        // Threshing is the case this exists for: beating grain off the stalk
        // leaves straw, and it was previously a separate craft because the
        // schema could not express two outputs. Anything else that drops a
        // remainder gets it for free now.
        let byproduct: { itemName: string; quantity: number } | null = null
        if (recipe.byproduct_item_name && recipe.byproduct_qty > 0) {
            const byItem = await db('items').where({ name: recipe.byproduct_item_name }).first()
            if (byItem) {
                const existingBy = await db('player_inventory')
                    .where({ player_id: playerId, item_id: byItem.id }).first()
                if (existingBy) {
                    await db('player_inventory').where({ id: existingBy.id }).increment('quantity', recipe.byproduct_qty)
                } else {
                    await db('player_inventory').insert({ player_id: playerId, item_id: byItem.id, quantity: recipe.byproduct_qty })
                }
                byproduct = { itemName: recipe.byproduct_item_name, quantity: recipe.byproduct_qty }
            }
        }

        // Half XP on a burn. recipes.xp is already set expecting this, so the
        // expected payout at the recipe's own level still lands on band.
        const xpAwarded = burnt ? Math.max(1, Math.round(recipe.xp / 2)) : recipe.xp

        // Award XP (Crafting XP banks against the hidden skill until it launches)
        if (skillId) {
            await awardXp(playerId, skillId, xpAwarded)
        }

        // A ruined dish does not count. Geomima asked for six cooked properly.
        if (!burnt) {
            await updateQuestObjectiveProgress(playerId, 'craft', recipe.output_item_name, 1)
            // Also a skill-specific type, so a quest can ask for cooking or
            // smithing in particular rather than any craft at all.
            if (recipe.skill) {
                await updateQuestObjectiveProgress(playerId, String(recipe.skill).toLowerCase(), recipe.output_item_name, 1)
            }
        }
        // Per-skill counters, so Cooking and Crafting have something to build
        // feats on. Burns count separately: ruining a hundred dinners is its own
        // kind of achievement.
        const tally: Record<string, number> = { total_actions_completed: 1}
        if (recipe.skill === 'Cooking') {
            if (burnt) tally.total_meals_burnt = 1
            else tally.total_meals_cooked = 1
        } else if (recipe.skill === 'Crafting') {
            tally.total_items_crafted = 1
        }
        await incrementStats(playerId, tally)

        logger.info(burnt
            ? `Player ${playerId} burnt ${recipe.output_item_name} (${recipe.name})`
            : `Player ${playerId} crafted ${recipe.output_qty}x ${recipe.output_item_name} (${recipe.name})`)

        const remaining = await inputsRemaining(playerId, inputs)
        const totalRow = outputItem
            ? await db('player_inventory').where({ player_id: playerId, item_id: outputItem.id }).first()
            : null

        return {
            success: true,
            burnt,
            itemName: burnt ? burntName! : recipe.output_item_name,
            quantity: burnt ? 1 : recipe.output_qty,
            xpAwarded,
            skillName: recipe.skill,
            ingredientsRemaining: remaining,
            outputTotal: totalRow ? totalRow.quantity : recipe.output_qty,
            byproduct,
            drops: byproduct
                ? [{ name: byproduct.itemName, quantity: byproduct.quantity }]
                : undefined,
        }
    } catch (err) {
        logger.error(`resolveRecipe error: ${err}`)
        return { success: false, error: 'Server error' }
    }
}
