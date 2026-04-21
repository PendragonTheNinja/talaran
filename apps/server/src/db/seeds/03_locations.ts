import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('resource_nodes').del();
  await knex('location_connections').del();
  await knex('player_actions').del();
  await knex('locations').del();

  await knex('locations').insert([
    {
      name: 'Talador',
      region: 'Taiar Island',
      type: 'town',
      description: 'The first town of Taiar Island. A modest but welcoming settlement, where new arrivals find their footing in the world of Talaran.',
      map_x: 5,
      map_y: 5,
      is_safe: true,
      is_accessible: true,
    },
    {
      name: 'Talador Outskirts',
      region: 'Taiar Island',
      type: 'wilderness',
      description: 'The open land surrounding Talador. Paths lead outward toward the forests and hills beyond.',
      map_x: 6,
      map_y: 5,
      is_safe: true,
      is_accessible: true,
    },
    {
      name: 'Lanai Forest',
      region: 'Taiar Island',
      type: 'forest',
      description: 'A quiet woodland of Lanai trees just outside Talador. The air smells of fresh bark and pine. A good place to learn the axe.',
      map_x: 7,
      map_y: 5,
      is_safe: true,
      is_accessible: true,
    },
    {
      name: 'Deep Lanai Forest',
      region: 'Taiar Island',
      type: 'forest',
      description: 'Further into the Lanai woodland, the trees grow taller and the canopy thicker. Experienced woodcutters find better timber here.',
      map_x: 8,
      map_y: 5,
      is_safe: true,
      is_accessible: true,
    },
  ]);

  // Wire up location connections
  const talador = await knex('locations').where({ name: 'Talador' }).first();
  const outskirts = await knex('locations').where({ name: 'Talador Outskirts' }).first();
  const lanaiForest = await knex('locations').where({ name: 'Lanai Forest' }).first();
  const deepLanai = await knex('locations').where({ name: 'Deep Lanai Forest' }).first();

  await knex('location_connections').insert([
    {
      from_location_id: talador.id,
      to_location_id: outskirts.id,
      base_travel_time: 30,
      travel_type: 'walking',
      is_bidirectional: true,
    },
    {
      from_location_id: outskirts.id,
      to_location_id: lanaiForest.id,
      base_travel_time: 45,
      travel_type: 'walking',
      is_bidirectional: true,
    },
    {
      from_location_id: lanaiForest.id,
      to_location_id: deepLanai.id,
      base_travel_time: 60,
      travel_type: 'walking',
      required_skill: 'woodcutting',
      required_level: 12,
      is_bidirectional: true,
    },
  ]);

  // Seed resource nodes
  await knex('resource_nodes').insert([
    {
      location_id: lanaiForest.id,
      skill: 'woodcutting',
      name: 'Lanai Tree',
      required_level: 1,
      base_timer: 5,
      min_timer: 3,
      required_tool_tier: 1,
      poor_chance: 65,
      fine_chance: 30,
      excellent_chance: 5,
      xp_reward: 10,
    },
    {
      location_id: deepLanai.id,
      skill: 'woodcutting',
      name: 'Lanai Tree (Old Growth)',
      required_level: 12,
      base_timer: 28,
      min_timer: 16,
      required_tool_tier: 2,
      poor_chance: 30,
      fine_chance: 55,
      excellent_chance: 15,
      xp_reward: 18,
    },
  ]);

    await knex('locations').insert([
  {
    name: 'Taiar Mines',
    region: 'Taiar Island',
    type: 'mine',
    description: 'A network of tunnels carved into the upper mountain range of Taiar Island. The air is thick with dust and the ring of pickaxes.',
    map_x: 10,
    map_y: 3,
    is_safe: true,
    is_accessible: true,
  },
]);

const taiarMines = await knex('locations').where({ name: 'Taiar Mines' }).first();

// Connect Lanai Forest to Taiar Mines
await knex('location_connections').insert([
  {
    from_location_id: lanaiForest.id,
    to_location_id: taiarMines.id,
    base_travel_time: 90,
    travel_type: 'walking',
    is_bidirectional: true,
  },
]);

// Add rock mining node at Taiar Mines
await knex('resource_nodes').insert([
  {
    location_id: taiarMines.id,
    skill: 'mining',
    name: 'Granite Rock',
    required_level: 1,
    base_timer: 8,
    min_timer: 4,
    required_tool_tier: 1,
    poor_chance: 0,
    fine_chance: 0,
    excellent_chance: 0,
    xp_reward: 8,
    vein_discovery_chance: 15, // 1.5% per rock mined
    min_vein_quantity: 50,
    max_vein_quantity: 100,
  },
]);
}