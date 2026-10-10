import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('player_skills').del();
  await knex('skills').del();

  await knex('skills').insert([
    // Gathering
    { name: 'Woodcutting', type: 'gathering', display_order: 1, description: 'Fell trees and gather wood from forests.' },
    { name: 'Mining', type: 'gathering', display_order: 2, description: 'Extract ores and gems from the earth.' },
    { name: 'Fishing', type: 'gathering', display_order: 3, description: 'Catch fish from rivers, lakes, and the open sea.' },
    { name: 'Foraging', type: 'gathering', display_order: 4, description: 'Gather herbs, plants, mushrooms, and wild resources.' },
    { name: 'Hunting', type: 'gathering', display_order: 5, description: 'Track, trap, and harvest wild creatures for resources.' },
    // Crafting (processing)
    { name: 'Carpentry', type: 'crafting', display_order: 6, description: 'Build structures, furniture, and wooden equipment.' },
    { name: 'Smithing', type: 'crafting', display_order: 7, description: 'Forge metals into weapons, armor, and tools.' },
    { name: 'Cooking', type: 'crafting', display_order: 8, description: 'Prepare food that restores health and grants benefits.' },
    { name: 'Farming', type: 'crafting', display_order: 9, description: 'Cultivate crops and tend to the land.' },
    { name: 'Husbandry', type: 'crafting', display_order: 10, description: 'Raise and care for animals. Unlocks mounts and animal products.' },
    { name: 'Crafting', type: 'crafting', display_order: 11, description: 'Create armor, jewelry, and goods from raw materials.' },
    // Combat
    // Combat: three skills since 20261010120000_combat_skills (Attack became Melee, Strength retired).
    { name: 'Melee', type: 'combat', display_order: 12, description: "Fight at arm's length with blade, spear or hammer. The better your hand, the finer the weapon it can hold." },
    { name: 'Defense', type: 'combat', display_order: 13, description: 'Take the blow on your armour and not on yourself. The more you turn aside, the heavier the armour you can carry.' },
    { name: 'Constitution', type: 'combat', display_order: 14, description: 'Bear the blows that get through. A hardy body has more to lose before it falls.' },
    // Utility
    { name: 'Agility', type: 'utility', display_order: 16, description: 'Increases movement speed and unlocks shortcuts.' },
    { name: 'Equitation', type: 'utility', display_order: 17, description: 'The art of riding mounts. Higher levels increase mounted speed.' },
    { name: 'Sailing', type: 'utility', display_order: 18, description: 'Navigate the seas between islands and continents.' },
    { name: 'Thieving', type: 'utility', display_order: 19, description: "Pick pockets, unlock doors, and take what isn't yours." },
    { name: 'Exploration', type: 'utility', display_order: 20, description: 'Discover new locations, resources, and creatures. The world reveals itself to those who seek it.' },
    { name: 'Talar', type: 'utility', display_order: 21, description: 'The arcane art of magic. Enchant, conjure, and manipulate the world.' },
  ]);
}