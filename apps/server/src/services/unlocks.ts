// What a level opens (Nathan, 2026-10-13): the level-up popup lists it, so a
// player who reaches Defense 2 sees which armour they can now wear.
//
// Every level gate in the game, in one place, by the skill that owns it:
// gathering nodes, recipes, crops, fish, foraging spots, huntable animals and
// traps (Hunting), animals to raise, gear to wear (the skill gateSkill names:
// Melee for weapons, Defense for armour, Wayfaring for mounts, the trade for
// its tools), roads that need a level, buildings by tier (homesteads, shops,
// guild halls), the better pay for sawing a wood's second tier, and brewing
// and its bigger casks. A new gated table belongs here, or its level-ups say
// nothing about it.

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

    // Boats (docs/sailing-spec.md §5): Carpentry builds them, Wayfaring sails them.
    if (s === 'carpentry' || s === 'wayfaring') {
        const column = s === 'carpentry' ? 'build_level' : 'sail_level'
        const boats = await db('vessel_types').where({ [column]: level, is_active: true }).orderBy('name').select('name')
        for (const b of boats) add(s === 'carpentry' ? `Build a ${b.name}` : `Sail a ${b.name}`, null)
    }
    if (s === 'carpentry') {
        // Buildings by tier (services/farming.ts, services/shops.ts, services/guildHall.ts).
        const { HOMESTEAD_TIERS } = await import('./farming')
        for (const t of HOMESTEAD_TIERS) if (t.tier > 1 && t.carpentry === level) add(`A tier ${t.tier} homestead`, null)
        const { SHOP_TIERS } = await import('./shops')
        for (const [n, t] of Object.entries(SHOP_TIERS)) if (Number(n) > 1 && t.carpentry === level) add(`A tier ${n} shop`, null)
        const halls = await db('guild_hall_tiers').where({ build_level: level }).where('tier', '>', 1).orderBy('tier').select('tier')
        for (const h of halls) add(`Building a guild hall's tier ${h.tier}`, null)
        // A wood's second tier pays more to saw (services/carpentry.ts sawXpFor).
        const { SAW_RECIPES } = await import('./carpentry')
        for (const r of Object.values(SAW_RECIPES)) {
            if (r.xpSteps.some(st => st.level === level)) add(`Better pay for sawing ${r.output}`, r.output)
        }
    }
    if (s === 'cooking') {
        // Ale in Mettlefell's cask, and a bigger cask every few levels (services/brewing.ts).
        const { BREW_LEVEL, maxBatchesFor } = await import('./brewing')
        if (level === BREW_LEVEL) add('Brewing Ale', 'Ale')
        else if (level > BREW_LEVEL && maxBatchesFor(level) > maxBatchesFor(level - 1)) add(`A cask of ${maxBatchesFor(level)} batches`, 'Ale')
    }
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
        .orderBy('name').select('name', 'weapon_form', 'armour', 'subtype', 'aim', 'power')
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
