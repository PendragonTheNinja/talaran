import db from '../db'
import { levelFromXp } from './xp'

// ── The travel curve ────────────────────────────────────────────────────────
// Every mode approaches a floor asymptotically rather than subtracting a flat
// share of base per level:
//
//     fraction(level) = floor + (start - floor) * rate^level
//
// Nothing can cross its floor, so there is no clamp to collide with. The old
// model subtracted Agility/Equitation levels straight off base and then clamped
// at 10%, which meant a maxed runner hit the clamp with no mount at all and
// every mount tier above the third was invisible. Here the mount decides where
// you end up and Equitation decides how fast you get there, so both stay
// legible for the whole game.
//
// Deliberately unbounded above level 100: skills level past the cap, and this
// keeps paying (ever less) instead of flattening to nothing.
//
// On foot  → start 1.00, floor FOOT_FLOOR, tuned so Agility 100 lands on
//            FOOT_AT_100. Gear closes a share of whatever gap is left.
// Mounted  → start and floor are per-mount columns (travel_speed_modifier and
//            travel_floor); Equitation closes the gap between them.

export const FOOT_START = 1.0
export const FOOT_FLOOR = 0.10              // asymptote on foot; approached, never reached
export const FOOT_AT_100 = 0.30             // where Agility 100 actually lands
export const MOUNT_GAP_LEFT_AT_100 = 0.03   // Equitation 100 closes 97% of a mount's gap
export const DEFAULT_MOUNT_FLOOR = 0.40     // for a mount row with no travel_floor set
export const MIN_TRAVEL_SECONDS = 1         // a 5s hop must not round to nothing

export const AGILITY_RATE = Math.pow((FOOT_AT_100 - FOOT_FLOOR) / (FOOT_START - FOOT_FLOOR), 1 / 100)
export const EQUITATION_RATE = Math.pow(MOUNT_GAP_LEFT_AT_100, 1 / 100)

export const AGILITY_XP_RATE = 0.7
export const EQUITATION_XP_RATE = 0.45

/** floor + (start - floor) * rate^level */
function approach(start: number, floor: number, rate: number, level: number): number {
    return floor + (start - floor) * Math.pow(rate, level)
}

async function skillLevel(playerId: number, skillName: string): Promise<number> {
    const skill = await db('skills').where({ name: skillName }).first()
    if (!skill) return 1
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first()
    return ps ? levelFromXp(parseInt(ps.xp)) : 1
}

/**
 * Computes the actual travel time for a trip, given the player's mount/gear/levels.
 * On foot  → Agility level, then staff/boots close a share of the remaining gap.
 * Mounted  → the mount's start/floor pair, closed by Equitation level.
 * XP (awarded elsewhere) is always based on baseTime, never this reduced value.
 */
export async function computeTravelTime(playerId: number, baseTime: number): Promise<{
    travelTime: number
    mounted: boolean
}> {
    const equipment = await db('player_equipment').where({ player_id: playerId }).first()
    const mountId = equipment?.mount_item_id
    const mounted = mountId !== null && mountId !== undefined

    // A mount may declare a fixed travel time, which bypasses the curve entirely.
    // Only the Admin Horse uses this.
    if (mounted) {
        const override = await db('items')
            .where({ id: mountId })
            .select('travel_time_override')
            .first()
        if (override?.travel_time_override !== null && override?.travel_time_override !== undefined) {
            return { travelTime: override.travel_time_override, mounted: true }
        }
    }

    let fraction: number

    if (mounted) {
        const mount = await db('items').where({ id: mountId }).first()
        // pg hands back numeric columns as strings; coerce before any arithmetic.
        const floor = mount?.travel_floor !== null && mount?.travel_floor !== undefined
            ? Number(mount.travel_floor)
            : DEFAULT_MOUNT_FLOOR
        const start = mount?.travel_speed_modifier !== null && mount?.travel_speed_modifier !== undefined
            ? Number(mount.travel_speed_modifier)
            : 1.0
        const equiLevel = await skillLevel(playerId, 'Equitation')
        fraction = approach(Math.max(start, floor), floor, EQUITATION_RATE, equiLevel)
    } else {
        const agiLevel = await skillLevel(playerId, 'Agility')
        fraction = approach(FOOT_START, FOOT_FLOOR, AGILITY_RATE, agiLevel)

        // On-foot gear (staff mainhand, boots feet) closes a share of the gap
        // that is still open. A flat cut off base would have pushed past the
        // floor at high Agility; this keeps the staff worth carrying forever.
        const gearIds = [equipment?.mainhand_item_id, equipment?.feet_item_id].filter(Boolean)
        if (gearIds.length) {
            const gear = await db('items').whereIn('id', gearIds).select('agility_reduction')
            const gearPct = gear.reduce((sum, g) => sum + Number(g.agility_reduction || 0), 0)
            fraction = FOOT_FLOOR + (fraction - FOOT_FLOOR) * (1 - Math.min(gearPct, 1))
        }
    }

    return { travelTime: Math.max(MIN_TRAVEL_SECONDS, Math.round(baseTime * fraction)), mounted }
}
