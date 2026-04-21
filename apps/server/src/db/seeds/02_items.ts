import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Only delete items that aren't referenced by player data
await knex('player_inventory').del();
await knex('player_equipment').del();
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
    
    // Pickaxes
{ name: 'Ambren Pickaxe',      type: 'tool', subtype: 'pickaxe', tier: 1, quality: null, slot: 'mainhand', level_required: 1,   description: 'A pickaxe forged from Ambren. Suitable for mining basic ores.', stackable: false },
{ name: 'Serph Pickaxe',       type: 'tool', subtype: 'pickaxe', tier: 2, quality: null, slot: 'mainhand', level_required: 13,  description: 'A pickaxe forged from Serph.', stackable: false },
{ name: 'Azulyss Pickaxe',     type: 'tool', subtype: 'pickaxe', tier: 3, quality: null, slot: 'mainhand', level_required: 25,  description: 'A pickaxe forged from Azulyss.', stackable: false },
{ name: 'Pylerial Pickaxe',    type: 'tool', subtype: 'pickaxe', tier: 4, quality: null, slot: 'mainhand', level_required: 37,  description: 'A pickaxe forged from Pylerial.', stackable: false },
{ name: 'Midrath Pickaxe',     type: 'tool', subtype: 'pickaxe', tier: 5, quality: null, slot: 'mainhand', level_required: 50,  description: 'A pickaxe forged from Midrath.', stackable: false },
{ name: 'Thaeldavast Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 6, quality: null, slot: 'mainhand', level_required: 62,  description: 'A pickaxe forged from Thaeldavast.', stackable: false },
{ name: 'Ghaal Pickaxe',       type: 'tool', subtype: 'pickaxe', tier: 7, quality: null, slot: 'mainhand', level_required: 75,  description: 'A pickaxe forged from Ghaal.', stackable: false },
{ name: 'Runafax Pickaxe',     type: 'tool', subtype: 'pickaxe', tier: 8, quality: null, slot: 'mainhand', level_required: 87,  description: 'A pickaxe forged from Runafax.', stackable: false },
{ name: 'Talamir Pickaxe',     type: 'tool', subtype: 'pickaxe', tier: 9, quality: null, slot: 'mainhand', level_required: 100, description: 'A pickaxe forged from Talamir. The finest mining tool in Talaran.', stackable: false },

// Rocks
{ name: 'Granite',   type: 'rock', subtype: 'granite',   tier: 1, quality: null, slot: null, level_required: 1,   description: 'A chunk of rough granite. Useful in construction.', stackable: true },
{ name: 'Limestone', type: 'rock', subtype: 'limestone',  tier: 2, quality: null, slot: null, level_required: 25,  description: 'A block of limestone. Widely used in building.', stackable: true },
{ name: 'Sandstone', type: 'rock', subtype: 'sandstone',  tier: 3, quality: null, slot: null, level_required: 50,  description: 'A piece of sandstone. Easy to shape.', stackable: true },
{ name: 'Marble',    type: 'rock', subtype: 'marble',     tier: 4, quality: null, slot: null, level_required: 75,  description: 'A slab of marble. Prized for its beauty.', stackable: true },
{ name: 'Basalt',    type: 'rock', subtype: 'basalt',     tier: 5, quality: null, slot: null, level_required: 100, description: 'Dense volcanic basalt. Incredibly durable.', stackable: true },

// Ores
{ name: 'Ambren Ore',   type: 'ore', subtype: 'ambren',   tier: 1, quality: null, slot: null, level_required: 1,  description: 'A component ore used in Ambren alloy.', stackable: true },
{ name: 'Burgh Ore',    type: 'ore', subtype: 'burgh',    tier: 1, quality: null, slot: null, level_required: 1,  description: 'A component ore used in Ambren alloy.', stackable: true },
{ name: 'Serph Ore',    type: 'ore', subtype: 'serph',    tier: 2, quality: null, slot: null, level_required: 13, description: 'A single ore that smelts into Serph.', stackable: true },
{ name: 'Azulyss Ore',  type: 'ore', subtype: 'azulyss',  tier: 3, quality: null, slot: null, level_required: 25, description: 'A single ore that smelts into Azulyss.', stackable: true },
{ name: 'Ore 3',        type: 'ore', subtype: 'ore3',     tier: 4, quality: null, slot: null, level_required: 37, description: 'An alloy component ore.', stackable: true },
{ name: 'Ore 4',        type: 'ore', subtype: 'ore4',     tier: 4, quality: null, slot: null, level_required: 37, description: 'An alloy component ore.', stackable: true },
{ name: 'Midrath Ore',  type: 'ore', subtype: 'midrath',  tier: 5, quality: null, slot: null, level_required: 50, description: 'A single ore that smelts into Midrath.', stackable: true },
{ name: 'Ore 5',        type: 'ore', subtype: 'ore5',     tier: 6, quality: null, slot: null, level_required: 62, description: 'An alloy component ore.', stackable: true },
{ name: 'Ore 6',        type: 'ore', subtype: 'ore6',     tier: 6, quality: null, slot: null, level_required: 62, description: 'An alloy component ore.', stackable: true },
{ name: 'Ghaal Ore',    type: 'ore', subtype: 'ghaal',    tier: 7, quality: null, slot: null, level_required: 75, description: 'A single ore that smelts into Ghaal.', stackable: true },
{ name: 'Runafax Ore',  type: 'ore', subtype: 'runafax',  tier: 8, quality: null, slot: null, level_required: 87, description: 'A single ore that smelts into Runafax.', stackable: true },
{ name: 'Ore 7',        type: 'ore', subtype: 'ore7',     tier: 9, quality: null, slot: null, level_required: 100, description: 'An alloy component ore.', stackable: true },

// Dense ores
{ name: 'Dense Ambren Ore',  type: 'ore', subtype: 'ambren',  tier: 1, quality: 'dense', slot: null, level_required: 1,  description: 'A dense Mallis ore. Smelts into extra bars.', stackable: true },
{ name: 'Dense Burgh Ore',   type: 'ore', subtype: 'burgh',   tier: 1, quality: 'dense', slot: null, level_required: 1,  description: 'A dense Stren ore. Smelts into extra bars.', stackable: true },
{ name: 'Dense Serph Ore',   type: 'ore', subtype: 'serph',   tier: 2, quality: 'dense', slot: null, level_required: 13, description: 'A dense Serph ore. Smelts into extra bars.', stackable: true },
{ name: 'Dense Azulyss Ore', type: 'ore', subtype: 'azulyss', tier: 3, quality: 'dense', slot: null, level_required: 25, description: 'A dense Azulyss ore. Smelts into extra bars.', stackable: true },
{ name: 'Dense Midrath Ore', type: 'ore', subtype: 'midrath', tier: 5, quality: 'dense', slot: null, level_required: 50, description: 'A dense Midrath ore. Smelts into extra bars.', stackable: true },
{ name: 'Dense Ghaal Ore',   type: 'ore', subtype: 'ghaal',   tier: 7, quality: 'dense', slot: null, level_required: 75, description: 'A dense Ghaal ore. Smelts into extra bars.', stackable: true },
{ name: 'Dense Runafax Ore', type: 'ore', subtype: 'runafax', tier: 8, quality: 'dense', slot: null, level_required: 87, description: 'A dense Runafax ore. Smelts into extra bars.', stackable: true },
]);
}

