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
    mallet: 'Carpentry',
    foraging_knife: 'Foraging',
    foraging_gloves: 'Foraging',
    foraging_basket: 'Foraging',
    fishing_rod: 'Fishing',
    fishing_net: 'Fishing',
    // Mounts are raised in Husbandry but ridden on Equitation — the dual gate.
    // Without these the Palfrey's level_required would never be checked.
    horse: 'Equitation',
    pony: 'Equitation',
}

/**
 * The skill an item's level_required is checked against.
 *
 * Combat gear goes by what the item IS, not its subtype (docs/combat-spec.md
 * §6, §7): anything with a weapon form needs Melee, anything with armour points
 * needs Defense. Subtypes would collide: the leatherworker's agility boots are
 * subtype 'boots' and must stay ungated by Defense.
 */
export function gateSkill(item: { weapon_form?: string | null; armour?: number | null; subtype?: string | null }): string | null {
    if (item.weapon_form) return COMBAT_SKILLS.melee
    if (item.armour) return COMBAT_SKILLS.defense
    return SUBTYPE_SKILL[item.subtype ?? ''] ?? null
}
