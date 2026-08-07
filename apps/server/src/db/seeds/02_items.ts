import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Only delete items that aren't referenced by player data
  await knex('player_inventory').del();
  await knex('player_equipment').del();
  await knex('items').del();

  await knex('items').insert([
    // Axes
    { name: 'Ambren Hatchet', type: 'tool', subtype: 'axe', tier: 1, quality: null, slot: 'mainhand', level_required: 1, description: 'A hatchet forged from Ambren. Suitable for cutting Lanai trees.' },
    { name: 'Serph Hatchet', type: 'tool', subtype: 'axe', tier: 2, quality: null, slot: 'mainhand', level_required: 13, description: 'A hatchet forged from Serph.' },
    { name: 'Azulyss Hatchet', type: 'tool', subtype: 'axe', tier: 3, quality: null, slot: 'mainhand', level_required: 25, description: 'A hatchet forged from Azulyss.' },
    { name: 'Pylerial Hatchet', type: 'tool', subtype: 'axe', tier: 4, quality: null, slot: 'mainhand', level_required: 37, description: 'A hatchet forged from Pylerial.' },
    { name: 'Midrath Hatchet', type: 'tool', subtype: 'axe', tier: 5, quality: null, slot: 'mainhand', level_required: 50, description: 'A hatchet forged from Midrath.' },
    { name: 'Thaeldavast Hatchet', type: 'tool', subtype: 'axe', tier: 6, quality: null, slot: 'mainhand', level_required: 62, description: 'A hatchet forged from Thaeldavast.' },
    { name: 'Ghaal Hatchet', type: 'tool', subtype: 'axe', tier: 7, quality: null, slot: 'mainhand', level_required: 75, description: 'A hatchet forged from Ghaal.' },
    { name: 'Runafax Hatchet', type: 'tool', subtype: 'axe', tier: 8, quality: null, slot: 'mainhand', level_required: 87, description: 'A hatchet forged from Runafax.' },
    { name: 'Talamir Hatchet', type: 'tool', subtype: 'axe', tier: 9, quality: null, slot: 'mainhand', level_required: 100, description: 'A hatchet forged from Talamir. The finest cutting edge known to Talaran.' },

    // Lanai Logs
    { name: 'Poor Lanai Log', type: 'log', subtype: 'lanai', tier: 1, quality: 'poor', slot: null, level_required: 1, description: 'A Lanai log of poor quality. Likely from a dead or damaged tree.' },
    { name: 'Fine Lanai Log', type: 'log', subtype: 'lanai', tier: 1, quality: 'fine', slot: null, level_required: 1, description: 'A solid Lanai log of decent quality.' },
    { name: 'Excellent Lanai Log', type: 'log', subtype: 'lanai', tier: 1, quality: 'excellent', slot: null, level_required: 1, description: 'A pristine Lanai log. Sought after by carpenters and craftsmen.' },

    // Hatch Logs
    { name: 'Poor Hatch Log', type: 'log', subtype: 'hatch', tier: 2, quality: 'poor', slot: null, level_required: 1, description: 'A Hatch log of poor quality.' },
    { name: 'Fine Hatch Log', type: 'log', subtype: 'hatch', tier: 2, quality: 'fine', slot: null, level_required: 1, description: 'A solid Hatch log of decent quality.' },
    { name: 'Excellent Hatch Log', type: 'log', subtype: 'hatch', tier: 2, quality: 'excellent', slot: null, level_required: 1, description: 'A pristine Hatch log.' },

    // Bearn Logs
    { name: 'Poor Bearn Log', type: 'log', subtype: 'bearn', tier: 3, quality: 'poor', slot: null, level_required: 1, description: 'A Bearn log of poor quality.' },
    { name: 'Fine Bearn Log', type: 'log', subtype: 'bearn', tier: 3, quality: 'fine', slot: null, level_required: 1, description: 'A solid Bearn log of decent quality.' },
    { name: 'Excellent Bearn Log', type: 'log', subtype: 'bearn', tier: 3, quality: 'excellent', slot: null, level_required: 1, description: 'A pristine Bearn log.' },

    // Mirrith Logs
    { name: 'Poor Mirrith Log', type: 'log', subtype: 'mirrith', tier: 4, quality: 'poor', slot: null, level_required: 1, description: 'A Mirrith log of poor quality.' },
    { name: 'Fine Mirrith Log', type: 'log', subtype: 'mirrith', tier: 4, quality: 'fine', slot: null, level_required: 1, description: 'A solid Mirrith log of decent quality.' },
    { name: 'Excellent Mirrith Log', type: 'log', subtype: 'mirrith', tier: 4, quality: 'excellent', slot: null, level_required: 1, description: 'A pristine Mirrith log.' },

    // Craxial Logs
    { name: 'Poor Craxial Log', type: 'log', subtype: 'craxial', tier: 5, quality: 'poor', slot: null, level_required: 1, description: 'A Craxial log of poor quality. Even poor Craxial wood is extraordinarily dense.' },
    { name: 'Fine Craxial Log', type: 'log', subtype: 'craxial', tier: 5, quality: 'fine', slot: null, level_required: 1, description: 'A solid Craxial log. Remarkably heavy.' },
    { name: 'Excellent Craxial Log', type: 'log', subtype: 'craxial', tier: 5, quality: 'excellent', slot: null, level_required: 1, description: 'A flawless Craxial log. Masters of Carpentry speak of these in reverent tones.' },

    // Pickaxes
    { name: 'Ambren Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 1, quality: null, slot: 'mainhand', level_required: 1, description: 'A pickaxe forged from Ambren. Suitable for mining basic ores.' },
    { name: 'Serph Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 2, quality: null, slot: 'mainhand', level_required: 13, description: 'A pickaxe forged from Serph.' },
    { name: 'Azulyss Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 3, quality: null, slot: 'mainhand', level_required: 25, description: 'A pickaxe forged from Azulyss.' },
    { name: 'Pylerial Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 4, quality: null, slot: 'mainhand', level_required: 37, description: 'A pickaxe forged from Pylerial.' },
    { name: 'Midrath Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 5, quality: null, slot: 'mainhand', level_required: 50, description: 'A pickaxe forged from Midrath.' },
    { name: 'Thaeldavast Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 6, quality: null, slot: 'mainhand', level_required: 62, description: 'A pickaxe forged from Thaeldavast.' },
    { name: 'Ghaal Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 7, quality: null, slot: 'mainhand', level_required: 75, description: 'A pickaxe forged from Ghaal.' },
    { name: 'Runafax Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 8, quality: null, slot: 'mainhand', level_required: 87, description: 'A pickaxe forged from Runafax.' },
    { name: 'Talamir Pickaxe', type: 'tool', subtype: 'pickaxe', tier: 9, quality: null, slot: 'mainhand', level_required: 100, description: 'A pickaxe forged from Talamir. The finest mining tool in Talaran.' },

    // Rocks
    { name: 'Granite', type: 'rock', subtype: 'granite', tier: 1, quality: null, slot: null, level_required: 1, description: 'A chunk of rough granite. Useful in construction.' },
    { name: 'Limestone', type: 'rock', subtype: 'limestone', tier: 2, quality: null, slot: null, level_required: 25, description: 'A block of limestone. Widely used in building.' },
    { name: 'Sandstone', type: 'rock', subtype: 'sandstone', tier: 3, quality: null, slot: null, level_required: 50, description: 'A piece of sandstone. Easy to shape.' },
    { name: 'Marble', type: 'rock', subtype: 'marble', tier: 4, quality: null, slot: null, level_required: 75, description: 'A slab of marble. Prized for its beauty.' },
    { name: 'Basalt', type: 'rock', subtype: 'basalt', tier: 5, quality: null, slot: null, level_required: 100, description: 'Dense volcanic basalt. Incredibly durable.' },

    // Ores
    { name: 'Ambren Ore', type: 'ore', subtype: 'ambren', tier: 1, quality: null, slot: null, level_required: 1, description: 'A component ore used in Ambren alloy.' },
    { name: 'Burgh Ore', type: 'ore', subtype: 'burgh', tier: 1, quality: null, slot: null, level_required: 1, description: 'A component ore used in Ambren alloy.' },
    { name: 'Serph Ore', type: 'ore', subtype: 'serph', tier: 2, quality: null, slot: null, level_required: 13, description: 'A single ore that smelts into Serph.' },
    { name: 'Azulyss Ore', type: 'ore', subtype: 'azulyss', tier: 3, quality: null, slot: null, level_required: 25, description: 'A single ore that smelts into Azulyss.' },
    { name: 'Ore 3', type: 'ore', subtype: 'ore3', tier: 4, quality: null, slot: null, level_required: 37, description: 'An alloy component ore.' },
    { name: 'Ore 4', type: 'ore', subtype: 'ore4', tier: 4, quality: null, slot: null, level_required: 37, description: 'An alloy component ore.' },
    { name: 'Midrath Ore', type: 'ore', subtype: 'midrath', tier: 5, quality: null, slot: null, level_required: 50, description: 'A single ore that smelts into Midrath.' },
    { name: 'Ore 5', type: 'ore', subtype: 'ore5', tier: 6, quality: null, slot: null, level_required: 62, description: 'An alloy component ore.' },
    { name: 'Ore 6', type: 'ore', subtype: 'ore6', tier: 6, quality: null, slot: null, level_required: 62, description: 'An alloy component ore.' },
    { name: 'Ghaal Ore', type: 'ore', subtype: 'ghaal', tier: 7, quality: null, slot: null, level_required: 75, description: 'A single ore that smelts into Ghaal.' },
    { name: 'Runafax Ore', type: 'ore', subtype: 'runafax', tier: 8, quality: null, slot: null, level_required: 87, description: 'A single ore that smelts into Runafax.' },
    { name: 'Ore 7', type: 'ore', subtype: 'ore7', tier: 9, quality: null, slot: null, level_required: 100, description: 'An alloy component ore.' },

    // Dense ores
    { name: 'Dense Ambren Ore', type: 'ore', subtype: 'ambren', tier: 1, quality: 'dense', slot: null, level_required: 1, description: 'A dense Mallis ore. Smelts into extra bars.' },
    { name: 'Dense Burgh Ore', type: 'ore', subtype: 'burgh', tier: 1, quality: 'dense', slot: null, level_required: 1, description: 'A dense Stren ore. Smelts into extra bars.' },
    { name: 'Dense Serph Ore', type: 'ore', subtype: 'serph', tier: 2, quality: 'dense', slot: null, level_required: 13, description: 'A dense Serph ore. Smelts into extra bars.' },
    { name: 'Dense Azulyss Ore', type: 'ore', subtype: 'azulyss', tier: 3, quality: 'dense', slot: null, level_required: 25, description: 'A dense Azulyss ore. Smelts into extra bars.' },
    { name: 'Dense Midrath Ore', type: 'ore', subtype: 'midrath', tier: 5, quality: 'dense', slot: null, level_required: 50, description: 'A dense Midrath ore. Smelts into extra bars.' },
    { name: 'Dense Ghaal Ore', type: 'ore', subtype: 'ghaal', tier: 7, quality: 'dense', slot: null, level_required: 75, description: 'A dense Ghaal ore. Smelts into extra bars.' },
    { name: 'Dense Runafax Ore', type: 'ore', subtype: 'runafax', tier: 8, quality: 'dense', slot: null, level_required: 87, description: 'A dense Runafax ore. Smelts into extra bars.' },

    // ── Smithing tools (workstation) ─────────────────────────────────
    { name: 'Ambren Hammer', type: 'tool', subtype: 'hammer', tier: 1, quality: null, slot: null, level_required: 1, description: 'A heavy hammer used for shaping hot metal on an anvil.' },
    { name: 'Ambren Tongs', type: 'tool', subtype: 'tongs', tier: 1, quality: null, slot: null, level_required: 1, description: 'Iron tongs for handling hot metal safely.' },
    { name: 'Lanai Bucket', type: 'tool', subtype: 'bucket', tier: 1, quality: null, slot: null, level_required: 1, description: 'A bucket of water for quenching hot metal.' },

    // ── Anvils ───────────────────────────────────────────────────────
    { name: 'Ambren Anvil', type: 'tool', subtype: 'anvil', tier: 1, quality: null, slot: null, level_required: 1, description: 'A sturdy Ambren anvil. Required for smithing tier 1 items.' },

    // ── Fuel ─────────────────────────────────────────────────────────
    { name: 'Charc', type: 'fuel', subtype: 'charc', tier: 1, quality: null, slot: null, level_required: 1, description: 'Fuel produced from burning wood in a kiln. Used for smelting.' },
    { name: 'Koric', type: 'fuel', subtype: 'koric', tier: 2, quality: null, slot: null, level_required: 50, description: 'Processed coal coke. Required for smelting higher tier metals.' },

    // ── Ingots ───────────────────────────────────────────────────────
    { name: 'Ambren Ingot', type: 'ingot', subtype: 'ambren', tier: 1, quality: null, slot: null, level_required: 1, description: 'An ingot of Ambren alloy. Used to forge tier 1 tools and equipment.' },

    // ── Leather strips ───────────────────────────────────────────────
    { name: 'Leather Strips', type: 'material', subtype: 'leather_strips', tier: 1, quality: null, slot: null, level_required: 1, description: 'Strips of leather used as grip wrapping on tool handles.' },

    // ── Tool Rods ───────────────────────────────────────────────────────
    { name: 'Lanai Tool Rod', type: 'material', subtype: 'tool_rod', tier: 1, quality: null, slot: null, level_required: 1, description: 'A smooth rod of Lanai wood. Used as a handle for tools.' },

    // ── Planks (sawn from logs via Carpentry) ───────────────────────────
    { name: 'Lanai Planks', type: 'plank', subtype: 'lanai', tier: 1, quality: null, slot: null, level_required: 1, description: 'Planks of Lanai wood, sawn smooth and ready for the workbench.' },
    { name: 'Hatch Planks', type: 'plank', subtype: 'hatch', tier: 2, quality: null, slot: null, level_required: 1, description: 'Sturdy Hatch planks, sawn and squared.' },
    { name: 'Bearn Planks', type: 'plank', subtype: 'bearn', tier: 3, quality: null, slot: null, level_required: 1, description: 'Heavy Bearn planks with a tight, even grain.' },
    { name: 'Mirrith Planks', type: 'plank', subtype: 'mirrith', tier: 4, quality: null, slot: null, level_required: 1, description: 'Pale Mirrith planks, prized for fine work.' },
    { name: 'Craxial Planks', type: 'plank', subtype: 'craxial', tier: 5, quality: null, slot: null, level_required: 1, description: 'Dense Craxial planks. Remarkably heavy, and remarkably strong.' },

    // ── Carpentry workstation tools ─────────────────────────────────────
    { name: 'Lanai Sawhorse', type: 'tool', subtype: 'sawhorse', tier: 1, quality: null, slot: null, level_required: 1, description: "A sturdy sawhorse of Lanai wood — the surface of a carpenter's workstation." },
    { name: 'Ambren Saw', type: 'tool', subtype: 'saw', tier: 1, quality: null, slot: null, level_required: 1, description: 'A saw with an Ambren blade and a Lanai handle. Part of a Carpentry workstation.' },
    { name: 'Ambren Plane', type: 'tool', subtype: 'plane', tier: 1, quality: null, slot: null, level_required: 1, description: 'A plane with an Ambren blade and a Lanai handle. Part of a Carpentry workstation.' },

    // ── Mounts ───────────────────────────────────────────────────────
    { name: "Novice's Pony", type: 'mount', subtype: 'pony', tier: 0, quality: 'starter', slot: 'mount', level_required: 1, travel_speed_modifier: 0.65, travel_floor: 0.40, description: 'A gentle pony given to new arrivals in Talaran. A humble but reliable companion for your first journeys.' },

    // Agility Items
    { name: 'Lanai Staff', type: 'tool', subtype: 'staff', tier: 1, quality: null, slot: 'mainhand', level_required: 1, travel_speed_modifier: 1.0, agility_reduction: 0.03, description: 'A simple walking staff carved from Lanai wood. Eases the burden of long roads on foot.' },

    // Travel Items
    { name: 'Daisy', type: 'material', subtype: 'flower', tier: 1, quality: null, slot: null, level_required: 1, description: 'A simple white daisy, common along the roadsides of Taiar Island.' },
    { name: 'Taiaria', type: 'material', subtype: 'flower', tier: 2, quality: null, slot: null, level_required: 1, description: 'A delicate bloom named for the island itself, found tucked in shaded grass.' },
    { name: "Tal's Hope", type: 'material', subtype: 'flower', tier: 3, quality: null, slot: null, level_required: 1, description: 'A rare flower said to bloom where fortune lingers. Finding one is a small blessing.' },
    { name: 'Tarnished Coin', type: 'curio', subtype: 'curio', tier: 1, quality: null, slot: null, level_required: 1, description: 'An old coin worn smooth by time. Someone, long ago, dropped it on this road.' },
    { name: 'Chipped Arrowhead', type: 'curio', subtype: 'curio', tier: 2, quality: null, slot: null, level_required: 1, description: 'A flint arrowhead, chipped from use or age. A relic of some forgotten hunt.' },
    { name: 'Four-Leaf Clover', type: 'curio', subtype: 'curio', tier: 5, quality: null, slot: null, level_required: 1, description: 'An impossibly rare four-leaf clover. They say no two finders are ever unlucky again.' },

    // ── Hunting: tools & ammo ──
    { name: 'Lanai Hunting Bow', type: 'tool', subtype: 'bow', tier: 1, quality: null, slot: 'mainhand', level_required: 1, description: 'A bow of supple Lanai wood, strung for the hunt. Draws a steady arrow on forest game.' },
    { name: 'Lanai Arrow Shafts', type: 'material', subtype: 'shaft', tier: 1, quality: null, slot: null, level_required: 1, description: 'Straight lengths of split Lanai, planed round and waiting for a head.' },
    { name: 'Ambren Arrow', type: 'ammo', subtype: 'arrow', tier: 1, quality: null, slot: null, level_required: 1, description: 'A broadhead hunting arrow. Often recovered from a clean kill.' },
    // ── Hunting: animal products ──
    { name: 'Venison', type: 'food', subtype: 'raw_meat', tier: 1, quality: null, slot: null, level_required: 1, description: 'Raw venison from a felled deer. Best cooked before eating.' },
    { name: 'Boar Meat', type: 'food', subtype: 'raw_meat', tier: 2, quality: null, slot: null, level_required: 1, description: 'Coarse, rich meat from a wild boar. Hearty fare once cooked.' },
    { name: 'Sloth Meat', type: 'food', subtype: 'raw_meat', tier: 3, quality: null, slot: null, level_required: 1, description: 'A great quantity of dense meat from a ground sloth. A feast in the making.' },
    { name: 'Deer Hide', type: 'material', subtype: 'hide', tier: 1, quality: null, slot: null, level_required: 1, description: 'The hide of a deer. Tans into a small amount of leather.' },
    { name: 'Boar Hide', type: 'material', subtype: 'hide', tier: 2, quality: null, slot: null, level_required: 1, description: 'Tough, bristled boar hide. Yields a sturdy leather.' },
    { name: 'Thick Hide', type: 'material', subtype: 'hide', tier: 3, quality: null, slot: null, level_required: 1, description: 'The heavy hide of a ground sloth. Difficult to work, but yields good leather.' },
    { name: 'Bones', type: 'material', subtype: 'bones', tier: 1, quality: null, slot: null, level_required: 1, description: 'A set of animal bones. They must be good for something.' },
    { name: 'Antler', type: 'material', subtype: 'trophy', tier: 1, quality: null, slot: null, level_required: 1, description: 'A branching deer antler. Prized by craftsmen and collectors alike.' },
    { name: 'Boar Tusk', type: 'material', subtype: 'trophy', tier: 1, quality: null, slot: null, level_required: 1, description: 'A curved, ivory-white tusk from a wild boar.' },
    { name: 'Sloth Claw', type: 'material', subtype: 'trophy', tier: 1, quality: null, slot: null, level_required: 1, description: 'An enormous curved claw from a ground sloth. Heavier than it looks.' },
  ]);
}

