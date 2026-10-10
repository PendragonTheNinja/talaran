// Combat (docs/combat-spec.md). Step 1: a player's standing, read from their
// skill levels and hp_missing. The formulas live in lib/combatMath.ts; this is
// where they meet the database's skill names.

import { combatLevel, maxHp } from '../lib/combatMath'

/** The skill rows combat reads, by name (skills.name). */
export const COMBAT_SKILLS = { melee: 'Melee', defense: 'Defense', constitution: 'Constitution' } as const

export interface CombatStanding {
    combatLevel: number
    hp: { current: number; max: number }
}

/**
 * Combat level and HP from a player's skill levels by name. A missing skill
 * reads as level 1 (a row is created the first time a skill pays XP).
 * Current HP is max HP less the damage not yet healed, never below 0.
 */
export function combatStanding(levelsByName: Map<string, number>, hpMissing: number): CombatStanding {
    const level = (name: string) => levelsByName.get(name) ?? 1
    const max = maxHp(level(COMBAT_SKILLS.constitution))
    return {
        combatLevel: combatLevel({
            melee: level(COMBAT_SKILLS.melee),
            defense: level(COMBAT_SKILLS.defense),
            constitution: level(COMBAT_SKILLS.constitution),
        }),
        hp: { current: Math.max(0, max - Math.max(0, hpMissing)), max },
    }
}
