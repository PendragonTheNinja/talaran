// What a level opens (Nathan, 2026-10-13): the level-up popup lists it, so a
// player who reaches Defense 2 sees which armour they can now wear.
//
// Every level gate in the game, in one place, by the skill that owns it:
// gathering nodes, recipes, crops, fish, foraging spots, huntable animals and
// traps (Hunting), animals to raise, gear to wear (the skill gateSkill names:
// Melee for weapons, Defense for armour, Wayfaring for mounts, the trade for
// its tools), and roads that need a level. A new gated table belongs here, or
// its level-ups say nothing about it.

import db from '../db'
import { gateSkill } from './equipGates'
import { rungOfTier } from '../lib/tiers'

export interface Unlock {
    /** What the player sees. */
    name: string
    /** An item to draw the icon from, when there is one. */
    icon: string | null
}

/** Everything that opens at exactly `level` of `skill`, in a stable order, no repeats. */
export async function unlocksAt(skill: string, level: number): Promise<Unlock[]> {
    const s = skill.trim().toLowerCase()
    const out: Unlock[] = []
    const add = (name: string | null | undefined, icon: string | null | undefined) => {
        if (name && !out.some(u => u.name === name)) out.push({ name, icon: icon ?? null })
    }

    const nodes = await db('resource_nodes')
        .whereRaw('LOWER(skill) = ?', [s]).where({ required_level: level, is_active: true })
        .orderBy('name').select('name')
    for (const n of nodes) add(n.name, null)

    const recipes = await db('recipes')
        .whereRaw('LOWER(skill) = ?', [s]).where({ required_level: level, is_active: true })
        .orderBy('name').select('name', 'output_item_name')
    for (const r of recipes) add(r.output_item_name || r.name, r.output_item_name)

    if (s === 'farming') {
        const crops = await db('crops').where({ plant_level: level, is_active: true }).orderBy('name').select('name', 'produce_item_name')
        for (const c of crops) add(c.name, c.produce_item_name)
    }
    if (s === 'fishing') {
        const fish = await db('fish_species').where({ required_level: level, is_active: true, kind: 'fish' })
            .orderBy('name').select('name', 'item_name')
        for (const f of fish) add(f.name, f.item_name)
    }
    if (s === 'foraging') {
        const habitats = await db('foraging_habitats').where({ required_level: level, is_active: true }).orderBy('name').select('name')
        for (const h of habitats) add(h.name, null)
    }
    if (s === 'hunting') {
        const animals = await db('huntable_animals').where({ required_level: level, is_active: true }).orderBy('name').select('name')
        for (const a of animals) add(a.name, null)
        // Traps pay Hunting (services/trapping.ts).
        const traps = await db('trap_types').where({ required_level: level, is_active: true }).orderBy('name').select('name', 'item_name')
        for (const t of traps) add(t.name, t.item_name)
    }
    if (s === 'husbandry') {
        const species = await db('animal_species').where({ husbandry_level: level, is_active: true }).orderBy('name').select('name', 'baby_item_name')
        for (const a of species) add(a.name, a.baby_item_name)
    }

    if (s === 'talar') {
        // A gem is filled from the first level of its tier (services/talar.ts).
        const gems = await db('items').where({ type: 'gem', quality: 'cut', is_active: true })
            .whereNotNull('talar').orderBy('name').select('name', 'tier')
        for (const g of gems) {
            if (rungOfTier(Number(g.tier) || 1) === level) add(`Filling ${g.name.split(' ').slice(1).join(' ')}`, g.name)
        }
        // Spells, learned at a church from their level (services/spells.ts).
        const spells = await db('spells').where({ talar_level: level, is_active: true }).orderBy('display_order').select('name')
        for (const sp of spells) add(sp.name, null)
    }

    // Gear: whatever this skill gates (services/equipGates.ts).
    const gear = await db('items').where({ level_required: level, is_active: true })
        .orderBy('name').select('name', 'weapon_form', 'armour', 'subtype')
    for (const g of gear) {
        if ((gateSkill(g) ?? '').toLowerCase() === s) add(g.name, g.name)
    }

    // Roads that need a level of this skill.
    const roads = await db('location_connections as c')
        .join('locations as a', 'a.id', 'c.from_location_id')
        .join('locations as b', 'b.id', 'c.to_location_id')
        .whereRaw('LOWER(c.required_skill) = ?', [s]).where('c.required_level', level)
        .select('a.name as from', 'b.name as to')
    for (const r of roads) add(`The road from ${r.from} to ${r.to}`, null)

    return out
}
