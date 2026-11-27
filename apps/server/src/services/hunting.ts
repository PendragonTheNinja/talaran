import db from '../db'

/** The first ammunition, and still what a hunt names when nothing better is carried. */
export const HUNT_AMMO = 'Ambren Arrow';
import { levelFromXp } from './xp'
import { levelTimerFactor, toolTierSpeedFactor } from '../lib/actionTimers'
import { standsAt } from '../lib/whereabouts'
import { doubleYield } from './buffs'
import { noteJewelry } from './jewelry'
import { isletFindHere, spendIsletFind } from './isletFinds'
import { tierOfLevel, workingTier } from '../lib/tiers'

/**
 * The arrow a hunt shoots: the best carried (ammunition of subtype 'arrow', the
 * highest tier first). Null when the pack holds none. Each shot reads it again,
 * so running out of Serph falls back to Ambren.
 */
export async function bestArrow(x: any, playerId: number): Promise<{ id: number; name: string; tier: number } | null> {
    const row = await x('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
        .where({ 'pi.player_id': playerId, 'i.subtype': 'arrow', 'i.is_active': true })
        .where('pi.quantity', '>', 0)
        .orderBy('i.tier', 'desc').orderBy('i.id', 'asc')
        .first('i.id', 'i.name', 'i.tier')
    return row ? { id: Number(row.id), name: row.name, tier: Number(row.tier) || 1 } : null
}

/** An animal's tier, from the level it is hunted at. */
export function animalTier(requiredLevel: number): number {
    return tierOfLevel(Math.max(1, Number(requiredLevel) || 1))
}

/** Catch points the arrow gives or takes against this animal (0 when the tiers match). */
export function arrowCatchShift(arrowTier: number, requiredLevel: number): number {
    const gap = arrowTier - animalTier(requiredLevel)
    return gap < 0 ? gap * ARROW_TIER_CATCH_PENALTY : gap * ARROW_TIER_CATCH_BONUS
}

// ── Tuning constants ──────────────────────────────────────────────
const CATCH_PER_LEVEL = 0.5           // +0.5% catch chance per level over req
const CATCH_CAP = 95                  // max catch %
// An arrow against the animal's tier (Nathan, 2026-11-17): a weaker point lowers
// the catch, never lengthens the hunt; a better one helps it. Arrows are for
// the catch, bows for the pace (Nathan, 2026-11-27).
const ARROW_TIER_CATCH_PENALTY = 10   // -10% catch per tier the arrow is below the animal
const ARROW_TIER_CATCH_BONUS = 3      // +3% catch per tier the arrow is above it
const RECOVERY_BASE = 0.80            // 80% arrow recovery on success at req level
const RECOVERY_PER_2_LEVELS = 0.01    // +1% recovery per 2 levels over req
const RECOVERY_CAP = 0.95
const RECOVERY_FAILURE = 0.30         // flat 30% recovery on a failed hunt

interface DropEntry { itemName: string; min: number; max: number; chance: number; notable?: boolean }

async function huntingLevel(playerId: number): Promise<number> {
    const skill = await db('skills').where({ name: 'Hunting' }).first()
    if (!skill) return 1
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first()
    return ps ? levelFromXp(parseInt(ps.xp)) : 1
}

/** Can the player hunt this animal? Checks level + equipped bow + arrows. */
export async function canHunt(playerId: number, animalId: number): Promise<{
    allowed: boolean; reason?: string; bowTier?: number
}> {
    const animal = await db('huntable_animals').where({ id: animalId }).first()
    if (!animal) return { allowed: false, reason: 'That animal cannot be found here.' }
    // A game trail on an islet counts as this animal's ground while it has hunts left (services/isletFinds.ts).
    if (!(await standsAt(playerId, animal.location_id)) && !(await isletFindHere(playerId, 'trail', animal.id))) {
        return { allowed: false, reason: 'That animal cannot be found here.' }
    }

    const level = await huntingLevel(playerId)
    if (level < animal.required_level) {
        return { allowed: false, reason: `You need Hunting level ${animal.required_level} to hunt ${animal.name}.` }
    }

    // Bow equipped (mainhand, subtype 'bow')
    const equipment = await db('player_equipment').where({ player_id: playerId }).first()
    const bowId = equipment?.mainhand_item_id
    if (!bowId) return { allowed: false, reason: 'You need a hunting bow equipped.' }
    const bow = await db('items').where({ id: bowId, subtype: 'bow' }).first()
    if (!bow) return { allowed: false, reason: 'You need a hunting bow equipped.' }

    // At least one arrow of any kind in the pack.
    if (!(await bestArrow(db, playerId))) {
        return { allowed: false, reason: 'You have no arrows.' }
    }

    return { allowed: true, bowTier: workingTier(bow) }
}

/**
 * Hunt timer: levels over the animal, then the bow (Nathan, 2026-11-27): a
 * bow above the animal's tier makes the hunt quicker, by the gathering tools'
 * rule (toolTierSpeedFactor). The arrow decides the catch, the bow the pace.
 */
export function calculateHuntTimer(baseTimer: number, minTimer: number, playerLevel: number, requiredLevel: number, bowTier = 1): number {
    const bow = toolTierSpeedFactor(bowTier, animalTier(requiredLevel))
    return Math.max(minTimer, Math.round(baseTimer * levelTimerFactor(playerLevel, requiredLevel) * bow))
}

/** The equipped bow's working tier, or 1 with none (a hunt with no bow is refused before this matters). */
export async function equippedBowTier(playerId: number): Promise<number> {
    const equipment = await db('player_equipment').where({ player_id: playerId }).first()
    const bow = equipment?.mainhand_item_id
        ? await db('items').where({ id: equipment.mainhand_item_id, subtype: 'bow' }).first()
        : null
    return bow ? workingTier(bow) : 1
}

/** Catch chance %: base + level-over scaling, capped. The arrow's tier shifts it (arrowCatchShift); the bow no longer does. */
export function calculateCatchChance(baseCatch: number, playerLevel: number, requiredLevel: number): number {
    const levelsOver = Math.max(0, playerLevel - requiredLevel)
    return Math.min(CATCH_CAP, baseCatch + levelsOver * CATCH_PER_LEVEL)
}

/** The names of a drop table's notable entries (trophies). */
function parseNotable(dropTableJson: string): string[] {
    try { return (JSON.parse(dropTableJson) as DropEntry[]).filter(d => d.notable).map(d => d.itemName) } catch { return [] }
}

/** Arrow recovery chance for this outcome. */
export function calculateArrowRecovery(success: boolean, playerLevel: number, requiredLevel: number): number {
    if (!success) return RECOVERY_FAILURE
    const levelsOver = Math.max(0, playerLevel - requiredLevel)
    return Math.min(RECOVERY_CAP, RECOVERY_BASE + Math.floor(levelsOver / 2) * RECOVERY_PER_2_LEVELS)
}

/**
 * Roll the drop table on a successful hunt → list of { itemName, quantity }.
 *
 * `multipliers` scales individual entries by item name, as a proportion of
 * their stored chance. Used for live young: see babyFindMultiplier below.
 * Proportional rather than additive, so a rarer young animal stays rarer than
 * a common one however high the bonus goes.
 */
export function rollDrops(
    dropTableJson: string,
    multipliers?: Map<string, number>,
    /** Roll only these entries (a missed hunt's young animals). */
    only?: Set<string>,
): { itemName: string; quantity: number; notable: boolean }[] {
    let table: DropEntry[]
    try { table = JSON.parse(dropTableJson) } catch { return [] }
    if (only) table = table.filter(d => only.has(d.itemName))
    const drops: { itemName: string; quantity: number; notable: boolean }[] = []
    for (const d of table) {
        const chance = d.chance * (multipliers?.get(d.itemName) ?? 1)
        if (Math.random() * 100 < chance) {
            const qty = d.min + Math.floor(Math.random() * (d.max - d.min + 1))
            if (qty > 0) drops.push({ itemName: d.itemName, quantity: qty, notable: d.notable === true })
        }
    }
    return drops
}

// Finding a calf gets easier as a stockman learns his trade.
//
// A calf was a flat 1.5% per hunt, which is roughly 67 hunts expected for one
// and 200 for a full paddock, and a coin flip with a tail that long is variance
// rather than difficulty: two players with identical play can differ by a
// hundred hunts. Milk sits behind it, and butter and cheese behind that, so the
// whole dairy chain was gated on a roll nothing could improve.
//
// Husbandry now helps, because knowing cattle is exactly the skill that would
// help you spot a strayed calf. Only CALVES scale: foals are meant to stay rare.
const BABY_SCALING: Record<string, { fromLevel: number; perLevel: number; cap: number }> = {
    Calf: { fromLevel: 9, perLevel: 0.03, cap: 2 },
};

/** Per-item chance multipliers for the live young in a hunt table. */
async function babyFindMultiplier(playerId: number): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    const skill = await db('skills').where({ name: 'Husbandry' }).first()
    if (!skill) return out
    const ps = await db('player_skills')
        .where({ player_id: playerId, skill_id: skill.id }).first()
    const level = ps ? levelFromXp(parseInt(ps.xp)) : 1

    for (const [itemName, rule] of Object.entries(BABY_SCALING)) {
        const over = Math.max(0, level - rule.fromLevel)
        out.set(itemName, Math.min(rule.cap, 1 + over * rule.perLevel))
    }
    return out
}

/**
 * Resolve a completed hunt: decide success, roll drops, handle arrow consume/recovery.
 * Returns everything the tick needs to award XP, add items, and narrate.
 */
export async function resolveHunt(playerId: number, animalId: number): Promise<{
    success: boolean
    xp: number
    drops: { itemName: string; quantity: number }[]
    arrowRecovered: boolean
    /** The arrow this shot used (bestArrow); spent or recovered by the tick. */
    arrowName?: string
    /** Said on a miss when the arrow was too weak for the animal (huntable_animals.weak_arrow_text). */
    weakArrowLine?: string
    noBow?: boolean
    /** The player no longer stands where the animal lives; the hunt stops. */
    notHere?: boolean
    animalName: string
}> {
    const animal = await db('huntable_animals').where({ id: animalId }).first()
    if (!animal) return { success: false, xp: 0, drops: [], arrowRecovered: false, animalName: 'the animal' }
    // Re-checked each cycle (CLAUDE.md §5 item 5). No shot is fired, so no
    // arrow is spent, and the tick stops the loop.
    const atGround = await standsAt(playerId, animal.location_id)
    const trail = atGround ? null : await isletFindHere(playerId, 'trail', animal.id)
    if (!atGround && !trail) {
        return { success: false, xp: 0, drops: [], arrowRecovered: true, notHere: true, animalName: animal.name }
    }

    const level = await huntingLevel(playerId)

    // Bow must still be equipped — re-validated every cycle, subtype-checked like canHunt.
    // No bow means no shot was fired: no arrow spent, and the tick stops the loop.
    const equipment = await db('player_equipment').where({ player_id: playerId }).first()
    const bow = equipment?.mainhand_item_id
        ? await db('items').where({ id: equipment.mainhand_item_id, subtype: 'bow' }).first()
        : null
    if (!bow) {
        return { success: false, xp: 0, drops: [], arrowRecovered: true, noBow: true, animalName: animal.name }
    }

    // A game trail on an islet: the hunt comes off the trail first, in one
    // conditional statement, so two hunts never share its last one; a miss is
    // `boost` times less likely and trophies `boost` times likelier.
    if (!atGround && (await spendIsletFind(playerId, 'trail', animal.id)) === null) {
        return { success: false, xp: 0, drops: [], arrowRecovered: true, notHere: true, animalName: animal.name }
    }
    const boost = trail?.boost ?? 1

    const arrow = await bestArrow(db, playerId)
    if (!arrow) return { success: false, xp: 0, drops: [], arrowRecovered: true, animalName: animal.name }
    const shift = arrowCatchShift(arrow.tier, animal.required_level)
    const baseCatch = Math.max(1, Math.min(CATCH_CAP, calculateCatchChance(animal.base_catch_chance, level, animal.required_level) + shift))
    const catchChance = boost > 1 ? Math.min(CATCH_CAP, 100 - (100 - baseCatch) / boost) : baseCatch
    const success = Math.random() * 100 < catchChance

    const xp = success ? animal.xp_success : animal.xp_failure
    // A young animal can be found whether or not the hunt itself succeeds
    // (Nathan, 2026-10-30, from the forum): the quarry gets away, and a calf is
    // standing in the bracken. Everything else, trophies included, still comes
    // only from a kill. Young are whatever a husbandry species is raised from.
    const young = new Set<string>(await db('animal_species').whereNotNull('baby_item_name').pluck('baby_item_name'))
    const multipliers = await babyFindMultiplier(playerId)
    if (boost > 1) {
        for (const d of parseNotable(animal.drop_table)) multipliers.set(d, (multipliers.get(d) ?? 1) * boost)
    }
    let drops = rollDrops(animal.drop_table, multipliers, success ? undefined : young)

    // A double-yield provision doubles what a kill gives (meat, hide, bones,
    // trophies), never a young animal found by the way. The hunt never asked,
    // so the Poacher's Supper did nothing (audit 2026-11-09).
    if (success) {
        const twice = await doubleYield(playerId, 'Hunting')
        if (twice) {
            drops = drops.map(d => (young.has(d.itemName) ? d : { ...d, quantity: d.quantity * 2 }))
            noteJewelry(db, playerId, `Your ${twice} doubled the kill.`)
        }
    }

    // Arrow consumed; maybe recovered
    const recoveryChance = calculateArrowRecovery(success, level, animal.required_level)
    const arrowRecovered = Math.random() < recoveryChance

    const weakArrowLine = !success && shift < 0 && animal.weak_arrow_text ? String(animal.weak_arrow_text) : undefined
    return { success, xp, drops, arrowRecovered, arrowName: arrow.name, weakArrowLine, animalName: animal.name }
}