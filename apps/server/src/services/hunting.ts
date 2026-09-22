import db from '../db'

/** Ammunition. One is spent per shot, and may be recovered on the roll. */
export const HUNT_AMMO = 'Ambren Arrow';
import { levelFromXp } from './xp'

// ── Tuning constants ──────────────────────────────────────────────
const LEVEL_TIMER_REDUCTION = 0.005   // -0.5% timer per level over req (matches mining)
const MAX_TIMER_REDUCTION = 0.5       // capped 50% faster
const CATCH_PER_LEVEL = 0.5           // +0.5% catch chance per level over req
const CATCH_CAP = 95                  // max catch %
const BOW_TIER_CATCH_BONUS = 3        // +3% catch per bow tier above 1
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

    // At least one arrow in inventory
    const arrowItem = await db('items').where({ name: HUNT_AMMO }).first()
    const arrows = arrowItem
        ? await db('player_inventory').where({ player_id: playerId, item_id: arrowItem.id }).first()
        : null
    if (!arrows || arrows.quantity < 1) {
        return { allowed: false, reason: 'You have no arrows.' }
    }

    return { allowed: true, bowTier: bow.tier }
}

/** Hunt timer with level reduction (mirrors mining). */
export function calculateHuntTimer(baseTimer: number, minTimer: number, playerLevel: number, requiredLevel: number): number {
    const levelsOver = Math.max(0, playerLevel - requiredLevel)
    const reduction = Math.min(MAX_TIMER_REDUCTION, levelsOver * LEVEL_TIMER_REDUCTION)
    return Math.max(minTimer, Math.round(baseTimer * (1 - reduction)))
}

/** Catch chance %: base + level-over scaling + bow tier, capped. */
export function calculateCatchChance(baseCatch: number, playerLevel: number, requiredLevel: number, bowTier: number): number {
    const levelsOver = Math.max(0, playerLevel - requiredLevel)
    const fromLevel = levelsOver * CATCH_PER_LEVEL
    const fromBow = Math.max(0, bowTier - 1) * BOW_TIER_CATCH_BONUS
    return Math.min(CATCH_CAP, baseCatch + fromLevel + fromBow)
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
): { itemName: string; quantity: number; notable: boolean }[] {
    let table: DropEntry[]
    try { table = JSON.parse(dropTableJson) } catch { return [] }
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
    noBow?: boolean
    animalName: string
}> {
    const animal = await db('huntable_animals').where({ id: animalId }).first()
    if (!animal) return { success: false, xp: 0, drops: [], arrowRecovered: false, animalName: 'the animal' }

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
    const bowTier = bow.tier ?? 1

    const catchChance = calculateCatchChance(animal.base_catch_chance, level, animal.required_level, bowTier)
    const success = Math.random() * 100 < catchChance

    const xp = success ? animal.xp_success : animal.xp_failure
    const drops = success ? rollDrops(animal.drop_table, await babyFindMultiplier(playerId)) : []

    // Arrow consumed; maybe recovered
    const recoveryChance = calculateArrowRecovery(success, level, animal.required_level)
    const arrowRecovered = Math.random() < recoveryChance

    return { success, xp, drops, arrowRecovered, animalName: animal.name }
}