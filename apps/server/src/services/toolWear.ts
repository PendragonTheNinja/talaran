// Tools wear out (Nathan, 2026-11-07; migration 20261108100000_tool_wear).
//
// Two kinds, two behaviours:
//
//   HAND TOOLS (a pickaxe, a rod, a bow, a mallet) are worn in a slot. They
//   wear only on an action that uses them, and a break takes the tool out of
//   its slot and stops the action, as a weapon breaking ends a fight; the
//   player equips another to carry on. Wear is silent until the break.
//
//   BENCH TOOLS (tongs, a saw, a mortar and pestle) sit in a workstation slot.
//   They wear only on a recipe that names their slot in required_tools, and
//   only at the player's own bench (a public bench never wears). A break
//   leaves the tool in its slot marked broken: the bench makes do at half
//   speed (services/workstations.ts, checkStation) and says so, on the result
//   card, the recipe list and the bench panel, until a new tool goes in.
//
// The numbers are lib/toolWear.ts: a guarantee per tier, then a chance per use
// from the action's own timer. Wear runs in the tick straight after an action
// resolves (wearToolsAfter), before its next timer is set, so a broken bench
// tool slows the very next lap. What happened rides out on the result card
// (takeToolWear, read by emitActionComplete, keyed by the action).

import type { Knex } from 'knex'
import db from '../db'
import { logger } from '../lib/logger'
import { toolBreakChancePct, toolTierRule, ToolTierRule } from '../lib/toolWear'
import { wearItemByRule, WearableItem, DurabilityRule } from './durability'
import { incrementStats } from './stats'
import { playerSkillLevel } from './xp'
import { gateSkill } from './equipGates'
import { takeItemsWithin } from './inventory'
import { isLiquid } from './liquids'
import { parseTable } from './foraging'

/** The slots a hand tool may be worn in. */
const HAND_COLUMNS = ['mainhand_item_id', 'offhand_item_id', 'hands_item_id'] as const

type ToolList = string[] | ((action: any, result: any) => Promise<string[]> | string[])

interface HandToolSpec {
    /** The skill the action pays: an override row in tool_break_overrides is keyed by it. */
    skill: string
    /** Subtypes of the hand tools this action actually uses. */
    tools: ToolList
    /** Where `tools` is worked out per action: every subtype it can name (Wearsight reads it). */
    can?: string[]
}

const BUILD = ['mallet', 'saw']

/**
 * Which hand tools each action uses. A tool is worn only when it is in hand
 * AND the action used it: milking wants the pail, gathering eggs does not;
 * gloves are needed only in a habitat with something prickly in it.
 */
export const HAND_TOOLS_BY_ACTION: Record<string, HandToolSpec> = {
    woodcutting: { skill: 'Woodcutting', tools: ['axe'] },
    mining_rock: { skill: 'Mining', tools: ['pickaxe'] },
    mining_vein: { skill: 'Mining', tools: ['pickaxe'] },
    fishing_rod: { skill: 'Fishing', tools: ['fishing_rod'] },
    fishing_net: { skill: 'Fishing', tools: ['fishing_net'] },
    fishing_cut_bait: { skill: 'Fishing', tools: ['butcher_knife'] },
    hunting: { skill: 'Hunting', tools: ['bow'] },
    foraging: {
        skill: 'Foraging',
        can: ['foraging_knife', 'foraging_basket', 'foraging_gloves'],
        // The knife speeds every pick and the basket adds to every yield, so
        // both are in use whenever worn. Gloves only where the habitat has
        // something that needs them.
        tools: async (action) => {
            const used = ['foraging_knife', 'foraging_basket']
            const habitatId = parseInt(action.action_data)
            if (habitatId) {
                const habitat = await db('foraging_habitats').where({ id: habitatId }).first('drop_table')
                if (parseTable(habitat?.drop_table).some(e => e.requiresGloves)) used.push('foraging_gloves')
            }
            return used
        },
    },
    // The saw in hand, at your own workshop or Geossica's bench (Nathan, 2026-11-09).
    sawing: {
        skill: 'Carpentry',
        can: ['saw'],
        tools: async (action) => {
            const { canSawHere } = await import('./carpentry')
            const at = await canSawHere(action.player_id, action.location_id)
            return at.allowed ? ['saw'] : []
        },
    },
    farm_till: { skill: 'Farming', tools: ['hoe'] },
    farm_establish: { skill: 'Carpentry', tools: BUILD },
    farm_build_plot: { skill: 'Carpentry', tools: BUILD },
    shop_establish: { skill: 'Carpentry', tools: BUILD },
    husbandry_build_pen: { skill: 'Carpentry', tools: BUILD },
    husbandry_demolish_pen: { skill: 'Carpentry', tools: BUILD },
    guild_build: { skill: 'Carpentry', tools: BUILD },
    cooking_build_hearth: { skill: 'Crafting', tools: ['mallet'] },
    husbandry_feed: { skill: 'Husbandry', tools: ['pail'] },
    husbandry_feed_all: { skill: 'Husbandry', tools: ['pail'] },
    husbandry_muck: { skill: 'Husbandry', tools: ['fork'] },
    husbandry_muck_all: { skill: 'Husbandry', tools: ['fork'] },
    husbandry_slaughter: { skill: 'Husbandry', tools: ['butcher_knife'] },
    husbandry_slaughter_all: { skill: 'Husbandry', tools: ['butcher_knife'] },
    husbandry_tame: { skill: 'Husbandry', tools: ['halter'] },
    // Milk goes into the pail; eggs and truffles are gathered by hand.
    husbandry_collect: { skill: 'Husbandry', can: ['pail'], tools: (_a, r) => (r?.itemName && isLiquid(r.itemName) ? ['pail'] : []) },
    husbandry_collect_all: { skill: 'Husbandry', can: ['pail'], tools: (_a, r) => (r?.itemName && isLiquid(r.itemName) ? ['pail'] : []) },
}

/**
 * The skill whose work wears a hand tool of this subtype (the first that uses
 * it), or null when no action wears it: it is not a hand tool.
 */
export function handToolSkill(subtype: string | null | undefined): string | null {
    if (!subtype) return null
    for (const spec of Object.values(HAND_TOOLS_BY_ACTION)) {
        const names = Array.isArray(spec.tools) ? spec.tools : spec.can ?? []
        if (names.includes(subtype)) return spec.skill
    }
    return null
}

// ── The numbers ────────────────────────────────────────────────────

export interface ToolRules {
    tiers: Map<number, ToolTierRule>
    /** `${skill}:${tier}` to a fixed break chance in percent. */
    overrides: Map<string, number>
}

export async function loadToolRules(x: Knex | Knex.Transaction): Promise<ToolRules> {
    // One after another: every wear path calls this inside a transaction, whose
    // one connection cannot run two queries at once (pg queues them and warns).
    const tiers = await x('tool_durability_tiers').select('tier', 'guaranteed_uses', 'life_hours')
    const overrides = await x('tool_break_overrides').select('skill', 'tier', 'break_chance_pct')
    return {
        tiers: new Map(tiers.map((r: any) => [Number(r.tier), { guaranteedUses: Number(r.guaranteed_uses), lifeHours: Number(r.life_hours) }])),
        overrides: new Map(overrides.map((r: any) => [`${r.skill}:${Number(r.tier)}`, Number(r.break_chance_pct)])),
    }
}

/**
 * One tool's rule for one use: the item's own override where it has one, else
 * an override row for this skill and tier, else worked out from the timer.
 */
export function toolRule(item: WearableItem, skill: string, timerSeconds: number, rules: ToolRules): DurabilityRule {
    const tier = Number(item.tier) || 1
    const tierRule = toolTierRule(rules.tiers, tier)
    const guaranteedUses = item.durability_uses ?? tierRule.guaranteedUses
    const breakChancePct = item.durability_break_pct
        ?? rules.overrides.get(`${skill}:${tier}`)
        ?? toolBreakChancePct({ guaranteedUses, lifeHours: tierRule.lifeHours }, timerSeconds)
    return { guaranteedUses, breakChancePct }
}

// ── What happened, for the result card ────────────────────────────

export interface ToolWearOutcome {
    /** Hand tools that broke: the action stops. */
    handBroken: string[]
    /** Lines for the result card. */
    notes: string[]
}

// Keyed by the action's id, never the player's: a note left behind by a path
// that did not send a result must not stop a later action (a fight).
const pending = new Map<number, ToolWearOutcome>()
const PENDING_MAX = 2000

function note(actionId: number, add: Partial<ToolWearOutcome>): void {
    const cur = pending.get(actionId) ?? { handBroken: [], notes: [] }
    cur.handBroken.push(...(add.handBroken ?? []))
    cur.notes.push(...(add.notes ?? []))
    pending.set(actionId, cur)
    // Notes nobody collected (a path that ended without a result) are dropped, oldest first.
    while (pending.size > PENDING_MAX) pending.delete(pending.keys().next().value as number)
}

/** What wore out during this action, once. */
export function takeToolWear(actionId: number): ToolWearOutcome | null {
    const out = pending.get(actionId) ?? null
    pending.delete(actionId)
    return out
}

function listNames(names: string[]): string {
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** What hand wear leaves on the card: a break with no spare stops the work; a spared one is a line. */
function noteHandWear(actionId: number, wear: HandWear): void {
    const stopped = wear.broken.filter((name, i) => wear.broken.indexOf(name) === i && !wear.spared.includes(name))
    if (stopped.length) note(actionId, { handBroken: stopped })
    if (wear.spared.length) note(actionId, { notes: [spareMessage(wear.spared)] })
}

/** The sentence a broken hand tool stops the action with. */
export function handBreakMessage(names: string[]): string {
    const one = names.length === 1
    return `Your ${listNames(names)} ${one ? 'breaks' : 'break'} in your hands. You will need ${one ? 'another' : 'new ones'} to carry on.`
}

/** The sentence a broken bench tool leaves on the card. */
export function benchBreakMessage(names: string[]): string {
    const one = names.length === 1
    return `Your ${listNames(names)} ${one ? 'gives' : 'give'} out. The bench makes do at half speed until you fit ${one ? 'a new one' : 'new ones'}.`
}

// ── Wearing ────────────────────────────────────────────────────────

/**
 * Wear whatever this finished action used. Called by the tick once an action
 * has resolved and before its next timer is set. Never fails the action: a
 * fault here is logged and the work stands.
 */
export async function wearToolsAfter(action: any, result: any): Promise<void> {
    try {
        if (!result || result.success === false) return
        const timer = Number(action.last_timer_seconds) || 0
        if (action.action_type === 'recipe') {
            const recipeId = parseInt(action.action_data)
            const broken = await wearBenchTools(action.player_id, recipeId, timer)
            if (broken.length) note(action.id, { notes: [benchBreakMessage(broken)] })
            // A held tool the recipe needs (the saw) wears in hand wherever the
            // job ran, and a break stops the job as any hand tool does.
            if (recipeId) {
                const { handHeldToolsOf } = await import('./workstations')
                const recipe = await db('recipes').where({ id: recipeId }).first('required_tools', 'skill')
                const held = handHeldToolsOf(recipe)
                if (held.length) noteHandWear(action.id, await wearHandToolsWithSpares(action.player_id, recipe.skill, held, timer))
            }
            return
        }
        const spec = HAND_TOOLS_BY_ACTION[action.action_type]
        if (!spec) return
        const subtypes = typeof spec.tools === 'function' ? await spec.tools(action, result) : spec.tools
        if (!subtypes.length) return
        noteHandWear(action.id, await wearHandToolsWithSpares(action.player_id, spec.skill, subtypes, timer))
    } catch (err) {
        logger.error(`wearToolsAfter error (player ${action?.player_id}, ${action?.action_type}): ${err}`)
    }
}

/**
 * A spare from the pack for a broken hand tool (Nathan, 2026-11-12): once the
 * player is this many levels past what the tool asks, an identical one goes
 * straight into the hand and the work carries on. Below it, a break stops the
 * work as before. Only the same item, never a "best other" one, so what goes
 * on is never a surprise. Not in a fight: a broken weapon is re-equipped by
 * hand (combat, Nathan 2026-10-13).
 */
export const SPARE_TOOL_LEVELS = 7

/** The skill whose level earns a tool's spare: the one its level is checked against, else the work's own. */
function spareSkill(item: { subtype?: string | null; weapon_form?: string | null; armour?: number | null }, workSkill: string): string {
    return gateSkill(item) ?? workSkill
}

export interface HandWear {
    /** Every tool that broke. */
    broken: string[]
    /** Of those, the ones a spare from the pack replaced: the work goes on. */
    spared: string[]
}

/** One use of each hand tool of these subtypes that is in hand. A broken one leaves its slot, or a spare takes it. */
export async function wearHandToolsWithSpares(playerId: number, skill: string, subtypes: string[], timerSeconds: number): Promise<HandWear> {
    const out: HandWear = { broken: [], spared: [] }
    await db.transaction(async trx => {
        // The equipment row first, then the pack: the equip button's order.
        const eq = await trx('player_equipment').where({ player_id: playerId }).forUpdate().first()
        if (!eq) return
        const ids = HAND_COLUMNS.map(c => eq[c]).filter(Boolean)
        if (!ids.length) return
        const items = await trx('items').whereIn('id', ids)
            .select('id', 'name', 'tier', 'subtype', 'level_required', 'durability_uses', 'durability_break_pct')
        const byId = new Map(items.map((i: any) => [Number(i.id), i]))
        const rules = await loadToolRules(trx)
        const done = new Set<string>()
        for (const subtype of subtypes) {
            const column = HAND_COLUMNS.find(c => !done.has(c) && byId.get(Number(eq[c]))?.subtype === subtype)
            if (!column) continue
            done.add(column)
            const item = byId.get(Number(eq[column]))
            if (!(await wearItemByRule(trx, playerId, item, toolRule(item, skill, timerSeconds, rules), Math.random))) continue
            out.broken.push(item.name)
            const level = await playerSkillLevel(playerId, spareSkill(item, skill), trx)
            const earned = level >= (Number(item.level_required) || 1) + SPARE_TOOL_LEVELS
            if (earned && (await takeItemsWithin(trx, playerId, [{ name: item.name, quantity: 1 }])).ok) {
                // The spare goes where the broken one was: the slot keeps its item.
                out.spared.push(item.name)
                continue
            }
            await trx('player_equipment').where({ player_id: playerId }).update({ [column]: null })
        }
        if (out.broken.length) await incrementStats(playerId, { total_tools_broken: out.broken.length }, trx)
    })
    return out
}

/** wearHandToolsWithSpares, for a caller that only wants what broke. */
export async function wearHandTools(playerId: number, skill: string, subtypes: string[], timerSeconds: number): Promise<string[]> {
    return (await wearHandToolsWithSpares(playerId, skill, subtypes, timerSeconds)).broken
}

/** The line a spare leaves on the card. */
export function spareMessage(names: string[]): string {
    const one = names.length === 1
    return `Your ${listNames(names)} ${one ? 'breaks' : 'break'}. You take ${one ? 'a spare' : 'spares'} from your pack and carry on.`
}

/**
 * One use of each bench tool a recipe names, at the player's own bench where
 * they stand. Only when the craft ran at that bench: every slot the recipe
 * names is filled there (a broken tool counts; it is making do). Otherwise it
 * ran at a public bench, whose tools never wear.
 */
export async function wearBenchTools(playerId: number, recipeId: number, timerSeconds: number): Promise<string[]> {
    if (!recipeId) return []
    const recipe = await db('recipes').where({ id: recipeId }).first('station', 'required_tools', 'skill')
    if (!recipe?.station) return []
    const { parseRequiredTools, HAND_HELD_BENCH_TOOLS } = await import('./workstations')
    // Held tools (the saw) wear in hand (wearToolsAfter), never as a slot.
    const needed = parseRequiredTools(recipe).filter(t => t !== 'hearth' && !(t in HAND_HELD_BENCH_TOOLS))
    if (!needed.length) return []
    const player = await db('players').where({ id: playerId }).first('current_location_id')
    if (!player) return []

    const broken: string[] = []
    await db.transaction(async trx => {
        // Station, then its slots: socketTool's order.
        const station = await trx('workstations')
            .where({ player_id: playerId, location_id: player.current_location_id, type: recipe.station })
            .forUpdate().first()
        if (!station || station.expires_at) return
        const slots = await trx('workstation_slots')
            .where({ workstation_id: station.id }).whereIn('slot', needed).forUpdate()
        const filled = new Set(slots.map((s: any) => s.slot))
        if (!needed.every(slot => filled.has(slot))) return

        const wearing = new Set((await trx('workstation_slot_types')
            .where({ station_type: recipe.station, wears: true }).whereIn('slot', needed)
            .select('slot')).map((r: any) => r.slot))
        const live = slots.filter((s: any) => !s.broken_at && wearing.has(s.slot))
        if (!live.length) return

        const items = await trx('items').whereIn('name', live.map((s: any) => s.item_name))
            .select('id', 'name', 'tier', 'durability_uses', 'durability_break_pct')
        const byName = new Map(items.map((i: any) => [i.name, i]))
        const rules = await loadToolRules(trx)
        for (const slot of live) {
            const item = byName.get(slot.item_name)
            if (!item) continue
            if (!(await wearItemByRule(trx, playerId, item, toolRule(item, recipe.skill, timerSeconds, rules), Math.random))) continue
            await trx('workstation_slots').where({ id: slot.id }).update({ broken_at: trx.fn.now() })
            broken.push(item.name)
        }
        if (broken.length) await incrementStats(playerId, { total_tools_broken: broken.length }, trx)
    })
    return broken
}
