// The Bestiary (docs/combat-spec.md §8; migration 20261012150000_bestiary).
//
// What a player knows about a creature grows with how many they have killed:
//
//      1  name, picture, description, level, where it lives
//     10  what it is weak to and what it shrugs off
//     50  its common and uncommon drops
//    250  every drop, rare weapon included (never the chances)
//  1,000  a line of lore, and a mastery mark
//
// It is the only place a creature's drops are shown: the Manual's item pages
// leave combat out (decided 2026-10-12).

import type { Knex } from 'knex'
import db from '../db'
import type { DamageType } from '../lib/combatMath'

export const BESTIARY_STEPS = { found: 1, stances: 10, commonDrops: 50, allDrops: 250, mastery: 1000 } as const

/** A drop this rare or rarer waits for the full list (BESTIARY_STEPS.allDrops). */
const UNCOMMON_LIMIT_ONE_IN = 100

const TYPES: DamageType[] = ['pierce', 'slash', 'crush']

export interface Stances { weak: DamageType[]; resists: DamageType[] }

export function stancesOf(creature: Record<string, unknown>): Stances {
    return {
        weak: TYPES.filter(t => creature[`stance_${t}`] === 'weak'),
        resists: TYPES.filter(t => creature[`stance_${t}`] === 'resistant'),
    }
}

/** Kills of one creature by one player. */
export async function killsOf(x: Knex | Knex.Transaction, playerId: number, creatureId: number): Promise<number> {
    const row = await x('player_creature_kills').where({ player_id: playerId, creature_id: creatureId }).first()
    return Number(row?.kills ?? 0)
}

export interface BestiaryEntry {
    id: number
    kills: number
    /** Steps passed, so the client never compares counts itself. */
    next: number | null
    name: string
    level: number
    description: string | null
    places: string[]
    stances: Stances | null
    drops: { name: string; where?: string }[] | null
    allDrops: boolean
    lore: string | null
    mastered: boolean
}

/**
 * Every creature this player has killed, told as far as their kills allow,
 * and how many are still to find. Nothing about an unfound creature is sent.
 */
export async function bestiaryFor(playerId: number): Promise<{ entries: BestiaryEntry[]; undiscovered: number; steps: typeof BESTIARY_STEPS }> {
    const creatures = await db('creatures').where({ is_active: true }).orderBy(['level', 'name'])
    const kills = new Map((await db('player_creature_kills').where({ player_id: playerId }))
        .map((r: any) => [r.creature_id, Number(r.kills)]))

    const homes = await db('fighting_spot_creatures')
        .join('fighting_spots', 'fighting_spots.id', 'fighting_spot_creatures.spot_id')
        .join('locations', 'locations.id', 'fighting_spots.location_id')
        .where('fighting_spots.is_active', true)
        .select('fighting_spot_creatures.creature_id', 'fighting_spots.key as spot_key', 'fighting_spots.name as spot', 'locations.name as place')

    const drops = await db('drop_table_entries')
        .join('items', 'items.id', 'drop_table_entries.item_id')
        .where('drop_table_entries.source_key', 'like', 'combat:%')
        .andWhere('drop_table_entries.is_active', true)
        .orderBy('drop_table_entries.chance_one_in')
        .select('drop_table_entries.source_key', 'drop_table_entries.chance_one_in', 'items.name')

    const steps = [BESTIARY_STEPS.found, BESTIARY_STEPS.stances, BESTIARY_STEPS.commonDrops, BESTIARY_STEPS.allDrops, BESTIARY_STEPS.mastery]
    const entries: BestiaryEntry[] = []
    for (const c of creatures) {
        const n = kills.get(c.id) ?? 0
        if (n < BESTIARY_STEPS.found) continue
        const mine = homes.filter((h: any) => h.creature_id === c.id)
        const placeOfSpot = new Map(mine.map((h: any) => [h.spot_key, h.place]))
        const showDrops = n >= BESTIARY_STEPS.commonDrops
        const allDrops = n >= BESTIARY_STEPS.allDrops
        const own = drops.filter((d: any) => String(d.source_key).split('@')[0] === `combat:${c.key}`)
        entries.push({
            id: c.id,
            kills: n,
            next: steps.find(s => s > n) ?? null,
            name: c.name,
            level: c.level,
            description: c.description,
            places: [...new Set(mine.map((h: any) => `${h.spot}, ${h.place}`))],
            stances: n >= BESTIARY_STEPS.stances ? stancesOf(c) : null,
            drops: showDrops
                ? own.filter((d: any) => allDrops || Number(d.chance_one_in) <= UNCOMMON_LIMIT_ONE_IN).map((d: any) => {
                    const spot = String(d.source_key).split('@')[1]
                    return spot ? { name: d.name, where: placeOfSpot.get(spot) } : { name: d.name }
                })
                : null,
            allDrops,
            lore: n >= BESTIARY_STEPS.mastery ? c.lore : null,
            mastered: n >= BESTIARY_STEPS.mastery,
        })
    }
    return { entries, undiscovered: creatures.length - entries.length, steps: BESTIARY_STEPS }
}
