// Which skill an item's level_required is checked against when it is worn.
// Used by equipping (routes/equipment.ts), the item pages (routes/items.ts)
// and the level-up popup's list of what a level opens (services/unlocks.ts).

import { COMBAT_SKILLS } from './combat'

// Which skill gates an item's level_required, by subtype.
//
// This used to cover axe and pickaxe only, with a comment saying "we'll
// generalize later". Everything else with a level requirement equipped freely.
// Subtypes come from the services that check for equipped tools: foraging.ts
// (TOOL_SLOT_COLUMN) and farming.ts (BUILD_MALLET, hoe).
const SUBTYPE_SKILL: Record<string, string> = {
    axe: 'Woodcutting',
    pickaxe: 'Mining',
    bow: 'Hunting',
    hoe: 'Farming',
    scythe: 'Farming',
    mallet: 'Carpentry',
    foraging_knife: 'Foraging',
    foraging_gloves: 'Foraging',
    foraging_basket: 'Foraging',
    fishing_rod: 'Fishing',
    fishing_net: 'Fishing',
    // Mounts are raised in Husbandry but ridden on Wayfaring — the dual gate.
    // Without these the Palfrey's level_required would never be checked.
    horse: 'Wayfaring',
    pony: 'Wayfaring',
    // Jewelry is worn on Talar, the skill that fills it (docs/talar-spec.md §8).
    ring: 'Talar',
    amulet: 'Talar',
    // The sailor's set is worn on Wayfaring, the skill that sails (docs/islets-plan.md §6d).
    sailors_set: 'Wayfaring',
    // Walking gear is worn on Wayfaring, the skill it serves: the Lanai Staff
    // and Leather Boots ask level 1, the invaders' staff and boots more
    // (docs/invasions-spec.md §6). Boots with armour points are Defense's,
    // decided before the subtype is read.
    staff: 'Wayfaring',
    boots: 'Wayfaring',
}

/**
 * The skill an item's level_required is checked against.
 *
 * Combat gear goes by what the item IS, not its subtype (docs/combat-spec.md
 * §6, §7): anything with a weapon form needs Melee, anything with armour points
 * needs Defense. Subtypes would collide: the leatherworker's agility boots are
 * subtype 'boots' and must stay ungated by Defense.
 */
export function gateSkill(item: { weapon_form?: string | null; armour?: number | null; subtype?: string | null; aim?: number | null; power?: number | null }): string | null {
    // A ring that adds power or a charm that adds aim is Melee's, whatever its
    // subtype (docs/antura-plan.md §10): the Talar rings and amulets have neither.
    if (item.weapon_form || Number(item.aim) > 0 || Number(item.power) > 0) return COMBAT_SKILLS.melee
    if (item.armour) return COMBAT_SKILLS.defense
    return SUBTYPE_SKILL[item.subtype ?? ''] ?? null
}
