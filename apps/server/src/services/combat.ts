// Combat (docs/combat-spec.md). A player's standing (combat level and HP, from
// their skill levels and hp_missing) and their fighting profile (aim, defence,
// max hit and armour, from what they wear). The formulas live in
// lib/combatMath.ts; this is where they meet the database's rows.

import db from '../db'
import { levelFromXp } from './xp'
import {
    absorption, combatLevel, CombatLevels, DamageType, Form, FORMS, levelTerm, maxHp, playerMaxHit,
    UNARMED, unarmedWeapon,
} from '../lib/combatMath'

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

/** Each combat skill's level for a player, 1 where no row exists yet. */
export async function combatLevels(playerId: number): Promise<CombatLevels> {
    const rows = await db('player_skills')
        .join('skills', 'skills.id', 'player_skills.skill_id')
        .where('player_skills.player_id', playerId)
        .whereIn('skills.name', Object.values(COMBAT_SKILLS))
        .select<{ name: string; xp: string | number }[]>('skills.name', 'player_skills.xp')
    const byName = new Map(rows.map(r => [r.name, levelFromXp(Number(r.xp) || 0)]))
    return {
        melee: byName.get(COMBAT_SKILLS.melee) ?? 1,
        defense: byName.get(COMBAT_SKILLS.defense) ?? 1,
        constitution: byName.get(COMBAT_SKILLS.constitution) ?? 1,
    }
}

/** The combat columns of a worn item (migration 20261010130000_ambren_combat_gear). */
export interface WornCombatItem {
    name: string
    weapon_form?: string | null
    damage_type?: string | null
    aim?: number | null
    power?: number | null
    armour?: number | null
}

export interface CombatProfile {
    /**
     * What the player fights with: the weapon in the main hand, or bare hands
     * when it holds none (empty, or a tool). `unarmed` marks the fallback.
     */
    weapon: { name: string; form: Form; damageType: DamageType; swingSeconds: number; unarmed: boolean }
    /** Accuracy: the weapon's aim plus the Melee level term (§4). */
    aim: number
    /** The most one swing can do before armour (§5). */
    maxHit: number
    /** Armour points plus the Defense level term (§4). */
    defence: number
    /** Armour points of everything worn (§7). */
    armour: number
    /** Average damage armour takes off each hit that lands (§5). */
    absorb: number
}

export function isForm(x: unknown): x is Form {
    return typeof x === 'string' && x in FORMS
}

/** Dual and two-hand weapons fill both hands: nothing can be held in the offhand beside them (§6). */
export function holdsBothHands(item: { weapon_form?: string | null } | null | undefined): boolean {
    return !!item && isForm(item.weapon_form) && !FORMS[item.weapon_form].shield
}

/**
 * A player's fighting numbers from their combat levels and what they wear,
 * slot by slot. The same arithmetic a fight will use (step 4); shown on the
 * equipment panel so the client never works it out.
 */
export function combatProfile(levels: CombatLevels, worn: Record<string, WornCombatItem | null | undefined>): CombatProfile {
    const armour = Object.values(worn).reduce((sum, item) => sum + (Number(item?.armour) || 0), 0)
    const defence = armour + levelTerm(levels.defense)

    const main = worn.mainhand
    let form: Form, damageType: DamageType, aim: number, power: number, name: string
    const unarmed = !(main && isForm(main.weapon_form) && main.aim != null && main.power != null)
    if (!unarmed) {
        form = main!.weapon_form as Form
        damageType = main!.damage_type as DamageType
        aim = Number(main!.aim)
        power = Number(main!.power)
        name = main!.name
    } else {
        // Bare hands (lib/combatMath.ts UNARMED): one hand beside a shield,
        // a pair otherwise.
        form = Number(worn.offhand?.armour) > 0 ? 'onehand' : 'dual'
        ;({ aim, power } = unarmedWeapon(form))
        damageType = UNARMED.damageType
        name = UNARMED.name
    }
    const swingSeconds = FORMS[form].swingSeconds

    return {
        weapon: { name, form, damageType, swingSeconds, unarmed },
        aim: Math.round(aim + levelTerm(levels.melee)),
        maxHit: Math.round(playerMaxHit(power, levels.melee, swingSeconds)),
        defence: Math.round(defence),
        armour,
        absorb: Math.round(absorption(armour) * 10) / 10,
    }
}
