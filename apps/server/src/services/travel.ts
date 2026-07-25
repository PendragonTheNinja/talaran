import db from '../db'
import { levelFromXp } from './xp'

export const TRAVEL_FLOOR = 0.10            // never below 10% of base
export const AGILITY_PER_LEVEL = 0.01       // -1% of base per Agility level
export const EQUITATION_PER_LEVEL = 0.005   // -0.5% of base per Equitation level
export const AGILITY_XP_RATE = 0.7
export const EQUITATION_XP_RATE = 0.45

async function skillLevel(playerId: number, skillName: string): Promise<number> {
    const skill = await db('skills').where({ name: skillName }).first()
    if (!skill) return 1
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first()
    return ps ? levelFromXp(parseInt(ps.xp)) : 1
}

/**
 * Computes the actual travel time for a trip, given the player's mount/gear/levels.
 * On foot  → Agility level + staff/boots reductions.
 * Mounted  → mount modifier + Equitation level reduction.
 * XP (awarded elsewhere) is always based on baseTime, never this reduced value.
 */
export async function computeTravelTime(playerId: number, baseTime: number): Promise<{
    travelTime: number
    mounted: boolean
}> {
    const equipment = await db('player_equipment').where({ player_id: playerId }).first()
    const mountId = equipment?.mount_item_id
    const mounted = mountId !== null && mountId !== undefined

    // A mount may declare a fixed travel time, which bypasses TRAVEL_FLOOR entirely.
    // Only the Admin Horse uses this; the floor exists so ordinary gear and levels
    // can never trivialise the map, and a modifier alone cannot go below it.
    if (mounted) {
        const override = await db('items')
            .where({ id: mountId })
            .select('travel_time_override')
            .first()
        if (override?.travel_time_override !== null && override?.travel_time_override !== undefined) {
            return { travelTime: override.travel_time_override, mounted: true }
        }
    }

    let time: number

    if (mounted) {
        const mount = await db('items').where({ id: mountId }).first()
        const mountMod = mount?.travel_speed_modifier ?? 1.0
        const equiLevel = await skillLevel(playerId, 'Equitation')
        const equiReduction = baseTime * (equiLevel * EQUITATION_PER_LEVEL)
        time = baseTime * mountMod - equiReduction
    } else {
        const agiLevel = await skillLevel(playerId, 'Agility')
        let reduction = baseTime * (agiLevel * AGILITY_PER_LEVEL)

        // on-foot gear: mainhand (staff) + feet (boots) agility_reduction %
        const gearIds = [equipment?.mainhand_item_id, equipment?.feet_item_id].filter(Boolean)
        if (gearIds.length) {
            const gear = await db('items').whereIn('id', gearIds).select('agility_reduction')
            const gearPct = gear.reduce((sum, g) => sum + (g.agility_reduction || 0), 0)
            reduction += baseTime * gearPct
        }
        time = baseTime - reduction
    }

    const floor = baseTime * TRAVEL_FLOOR
    return { travelTime: Math.max(floor, Math.round(time)), mounted }
}