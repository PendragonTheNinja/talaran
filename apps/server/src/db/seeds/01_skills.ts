import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('player_skills').del();
  await knex('skills').del();

  await knex('skills').insert([
    { name: 'Attack',      type: 'combat',    description: 'Determines your accuracy in melee combat, as well as what tier of weapon you can wield.' },
    { name: 'Strength',    type: 'combat',    description: 'Increases melee damage output.' },
    { name: 'Defense',     type: 'combat',    description: 'Reduces damage taken from enemies.' },
    { name: 'Constitution',type: 'combat',    description: 'Governs your maximum health points.' },
    { name: 'Talar',       type: 'combat',    description: 'The arcane art of magic. Enchant, conjure, and manipulate the world.' },
    { name: 'Mining',      type: 'gathering', description: 'Extract ores and gems from the earth.' },
    { name: 'Fishing',     type: 'gathering', description: 'Catch fish from rivers, lakes, and the open sea.' },
    { name: 'Woodcutting', type: 'gathering', description: 'Fell trees and gather wood from forests.' },
    { name: 'Foraging',    type: 'gathering', description: 'Gather herbs, plants, mushrooms, and wild resources.' },
    { name: 'Farming',     type: 'gathering', description: 'Cultivate crops and tend to the land.' },
    { name: 'Hunting',     type: 'gathering', description: 'Track, trap, and harvest wild creatures for resources.' },
    { name: 'Smithing',    type: 'crafting',  description: 'Forge metals into weapons, armor, and tools.' },
    { name: 'Cooking',     type: 'crafting',  description: 'Prepare food that restores health and grants benefits.' },
    { name: 'Crafting',    type: 'crafting',  description: 'Create armor, jewelry, and goods from raw materials.' },
    { name: 'Carpentry',   type: 'crafting',  description: 'Build structures, furniture, and wooden equipment.' },
    { name: 'Agility',     type: 'utility',   description: 'Increases movement speed and unlocks shortcuts.' },
    { name: 'Equitation',  type: 'utility',   description: 'The art of riding mounts. Higher levels increase mounted speed.' },
    { name: 'Sailing',     type: 'utility',   description: 'Navigate the seas between islands and continents.' },
    { name: 'Husbandry',   type: 'utility',   description: 'Raise and care for animals. Unlocks mounts and animal products.' },
    { name: 'Thieving',    type: 'utility',   description: 'Pick pockets, unlock doors, and take what isn\'t yours.' },
    { name: 'Exploration', type: 'utility',   description: 'Discover new locations, resources, and creatures. The world reveals itself to those who seek it.' },
  ]);
}