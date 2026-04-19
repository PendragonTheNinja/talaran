import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('player_inventory').del();
  await knex('items').del();

  await knex('items').insert([
    // Axes
{ name: 'Ambren Hatchet',      type: 'tool', subtype: 'axe', tier: 1, quality: null, slot: 'mainhand', level_required: 1,  description: 'A hatchet forged from Ambren. Suitable for cutting Lanai trees.', stackable: false },
{ name: 'Serph Hatchet',       type: 'tool', subtype: 'axe', tier: 2, quality: null, slot: 'mainhand', level_required: 13, description: 'A hatchet forged from Serph.', stackable: false },
{ name: 'Azulyss Hatchet',     type: 'tool', subtype: 'axe', tier: 3, quality: null, slot: 'mainhand', level_required: 25, description: 'A hatchet forged from Azulyss.', stackable: false },
{ name: 'Pylerial Hatchet',    type: 'tool', subtype: 'axe', tier: 4, quality: null, slot: 'mainhand', level_required: 37, description: 'A hatchet forged from Pylerial.', stackable: false },
{ name: 'Midrath Hatchet',     type: 'tool', subtype: 'axe', tier: 5, quality: null, slot: 'mainhand', level_required: 50, description: 'A hatchet forged from Midrath.', stackable: false },
{ name: 'Thaeldavast Hatchet', type: 'tool', subtype: 'axe', tier: 6, quality: null, slot: 'mainhand', level_required: 62, description: 'A hatchet forged from Thaeldavast.', stackable: false },
{ name: 'Ghaal Hatchet',       type: 'tool', subtype: 'axe', tier: 7, quality: null, slot: 'mainhand', level_required: 75, description: 'A hatchet forged from Ghaal.', stackable: false },
{ name: 'Runafax Hatchet',     type: 'tool', subtype: 'axe', tier: 8, quality: null, slot: 'mainhand', level_required: 87, description: 'A hatchet forged from Runafax.', stackable: false },
{ name: 'Talamir Hatchet',     type: 'tool', subtype: 'axe', tier: 9, quality: null, slot: 'mainhand', level_required: 100, description: 'A hatchet forged from Talamir. The finest cutting edge known to Talaran.', stackable: false },

    // Lanai Logs
    { name: 'Poor Lanai Log',      type: 'log', subtype: 'lanai', tier: 1, quality: 'poor', slot: null, level_required: 1,          description: 'A Lanai log of poor quality. Likely from a dead or damaged tree.', stackable: true },
    { name: 'Fine Lanai Log',      type: 'log', subtype: 'lanai', tier: 1, quality: 'fine', slot: null, level_required: 1,          description: 'A solid Lanai log of decent quality.', stackable: true },
    { name: 'Excellent Lanai Log', type: 'log', subtype: 'lanai', tier: 1, quality: 'excellent', slot: null, level_required: 1,     description: 'A pristine Lanai log. Sought after by carpenters and craftsmen.', stackable: true },

    // Hatch Logs
    { name: 'Poor Hatch Log',      type: 'log', subtype: 'hatch', tier: 2, quality: 'poor', slot: null, level_required: 1,          description: 'A Hatch log of poor quality.', stackable: true },
    { name: 'Fine Hatch Log',      type: 'log', subtype: 'hatch', tier: 2, quality: 'fine', slot: null, level_required: 1,          description: 'A solid Hatch log of decent quality.', stackable: true },
    { name: 'Excellent Hatch Log', type: 'log', subtype: 'hatch', tier: 2, quality: 'excellent', slot: null, level_required: 1,     description: 'A pristine Hatch log.', stackable: true },

    // Bearn Logs
    { name: 'Poor Bearn Log',      type: 'log', subtype: 'bearn', tier: 3, quality: 'poor', slot: null, level_required: 1,          description: 'A Bearn log of poor quality.', stackable: true },
    { name: 'Fine Bearn Log',      type: 'log', subtype: 'bearn', tier: 3, quality: 'fine', slot: null, level_required: 1,          description: 'A solid Bearn log of decent quality.', stackable: true },
    { name: 'Excellent Bearn Log', type: 'log', subtype: 'bearn', tier: 3, quality: 'excellent', slot: null, level_required: 1,     description: 'A pristine Bearn log.', stackable: true },

    // Mirrith Logs
    { name: 'Poor Mirrith Log',      type: 'log', subtype: 'mirrith', tier: 4, quality: 'poor', slot: null, level_required: 1,      description: 'A Mirrith log of poor quality.', stackable: true },
    { name: 'Fine Mirrith Log',      type: 'log', subtype: 'mirrith', tier: 4, quality: 'fine', slot: null, level_required: 1,      description: 'A solid Mirrith log of decent quality.', stackable: true },
    { name: 'Excellent Mirrith Log', type: 'log', subtype: 'mirrith', tier: 4, quality: 'excellent', slot: null, level_required: 1, description: 'A pristine Mirrith log.', stackable: true },

    // Craxial Logs
    { name: 'Poor Craxial Log',      type: 'log', subtype: 'craxial', tier: 5, quality: 'poor', slot: null, level_required: 1,      description: 'A Craxial log of poor quality. Even poor Craxial wood is extraordinarily dense.', stackable: true },
    { name: 'Fine Craxial Log',      type: 'log', subtype: 'craxial', tier: 5, quality: 'fine', slot: null, level_required: 1,      description: 'A solid Craxial log. Remarkably heavy.', stackable: true },
    { name: 'Excellent Craxial Log', type: 'log', subtype: 'craxial', tier: 5, quality: 'excellent', slot: null, level_required: 1, description: 'A flawless Craxial log. Masters of Carpentry speak of these in reverent tones.', stackable: true },
  ]);
}