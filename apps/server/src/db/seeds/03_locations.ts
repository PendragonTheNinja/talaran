import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('resource_nodes').del();
  await knex('location_connections').del();
  await knex('player_actions').del();
  await knex('ore_veins').del();
  await knex('locations').del();

  await knex('locations').insert([
    {
      name: 'Talador',
      region: 'Taiar Island',
      type: 'town',
      description: 'The first port city of Taiar Island. A modest but welcoming settlement where new arrivals find their footing in the world of Talaran. Ships from distant lands dock here, bringing trade and travellers alike.',
      map_x: 8, map_y: 6, is_safe: true, is_accessible: true,
    },
    {
      name: 'Emberra',
      region: 'Taiar Island',
      type: 'town',
      description: 'A forge town built into the hillside, its chimneys never cold. The ring of hammers on anvils echoes day and night as smiths work the metals pulled from the mountains above.',
      map_x: 7, map_y: 4, is_safe: true, is_accessible: true,
    },
    {
      name: 'Grundagr',
      region: 'Taiar Island',
      type: 'mine',
      description: 'A network of tunnels carved deep into the northern mountain range. The first miners of Taiar Island broke ground here, and the tradition continues.',
      map_x: 9, map_y: 3, is_safe: true, is_accessible: true,
    },
    {
      name: 'Origrund',
      region: 'Taiar Island',
      type: 'mine',
      description: 'A younger mine carved into the southern face of the mountain spine. The ore here runs rich and deep.',
      map_x: 8, map_y: 5, is_safe: true, is_accessible: true,
    },
    {
      name: 'Eld Grove',
      region: 'Taiar Island',
      type: 'forest',
      description: 'Ancient trees tower overhead in this northern woodland. The canopy is so thick it blocks the sky entirely. Only experienced woodcutters venture here.',
      map_x: 7, map_y: 2, is_safe: true, is_accessible: true,
    },
    {
      name: 'Novita',
      region: 'Taiar Island',
      type: 'farmland',
      description: 'Fertile fields spread across the northern plateau, sheltered from the mountain winds. Farmers have worked this land since the first settlers arrived on Taiar Island.',
      map_x: 8, map_y: 2, is_safe: true, is_accessible: true,
    },
    {
      name: 'Caliwen',
      region: 'Taiar Island',
      type: 'workshop',
      description: 'A quiet workshop district nestled between the forests and farmlands. Artisans here work leather, bone, and cloth into goods sought across the island.',
      map_x: 6, map_y: 3, is_safe: true, is_accessible: true,
    },
    {
      name: 'Verdale',
      region: 'Taiar Island',
      type: 'town',
      description: 'A working lumber town on the edge of the western forests. The smell of fresh-cut wood hangs permanently in the air.',
      map_x: 5, map_y: 4, is_safe: true, is_accessible: true,
    },
    {
      name: 'Lanaivale',
      region: 'Taiar Island',
      type: 'forest',
      description: 'A quiet woodland of Lanai trees. The air smells of fresh bark and pine. A good place to learn the axe.',
      map_x: 4, map_y: 5, is_safe: true, is_accessible: true,
    },
    {
      name: 'Phoenwick',
      region: 'Taiar Island',
      type: 'town',
      description: 'A lively crossroads town in the heart of the island. The smell of roasting meat and fresh bread draws travellers from every direction.',
      map_x: 6, map_y: 6, is_safe: true, is_accessible: true,
    },
    {
      name: 'Dawncrest',
      region: 'Taiar Island',
      type: 'coast',
      description: 'A rocky coastal outcropping where the morning light hits the water first. Fishermen cast their lines here at dawn and rarely leave empty-handed.',
      map_x: 8, map_y: 8, is_safe: true, is_accessible: true,
    },
    {
      name: 'Luxmere',
      region: 'Taiar Island',
      type: 'lake',
      description: 'A serene lake in the southwestern lowlands. The water is clear and deep, home to fish found nowhere else on the island.',
      map_x: 4, map_y: 7, is_safe: true, is_accessible: true,
    },
    {
      name: 'Talar Rift',
      region: 'Taiar Island',
      type: 'dungeon',
      description: 'A jagged fissure in the northeastern cliffs, humming with arcane energy. Those who study the Talar arts are drawn here as if by instinct.',
      map_x: 10, map_y: 1, is_safe: false, is_accessible: true,
    },
  ]);

  // ── Fetch all locations ──────────────────────────────────────────
  const talador   = await knex('locations').where({ name: 'Talador' }).first();
  const emberra   = await knex('locations').where({ name: 'Emberra' }).first();
  const grundagr  = await knex('locations').where({ name: 'Grundagr' }).first();
  const origrund  = await knex('locations').where({ name: 'Origrund' }).first();
  const eldGrove  = await knex('locations').where({ name: 'Eld Grove' }).first();
  const novita    = await knex('locations').where({ name: 'Novita' }).first();
  const caliwen   = await knex('locations').where({ name: 'Caliwen' }).first();
  const verdale   = await knex('locations').where({ name: 'Verdale' }).first();
  const lanaivale = await knex('locations').where({ name: 'Lanaivale' }).first();
  const phoenwick = await knex('locations').where({ name: 'Phoenwick' }).first();
  const dawncrest = await knex('locations').where({ name: 'Dawncrest' }).first();
  const luxmere   = await knex('locations').where({ name: 'Luxmere' }).first();
  const talarRift = await knex('locations').where({ name: 'Talar Rift' }).first();

  // ── Connections ──────────────────────────────────────────────────
  await knex('location_connections').insert([
    // Talador
    { from_location_id: talador.id,   to_location_id: emberra.id,   base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    { from_location_id: talador.id,   to_location_id: origrund.id,  base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    { from_location_id: talador.id,   to_location_id: phoenwick.id, base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Emberra
    { from_location_id: emberra.id,   to_location_id: origrund.id,  base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    { from_location_id: emberra.id,   to_location_id: grundagr.id,  base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Grundagr
    { from_location_id: grundagr.id,  to_location_id: talarRift.id, base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    { from_location_id: grundagr.id,  to_location_id: novita.id,    base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Novita
    { from_location_id: novita.id,    to_location_id: eldGrove.id,  base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    { from_location_id: novita.id,    to_location_id: talarRift.id, base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Eld Grove
    { from_location_id: eldGrove.id,  to_location_id: caliwen.id,   base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Caliwen
    { from_location_id: caliwen.id,   to_location_id: verdale.id,   base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Verdale
    { from_location_id: verdale.id,   to_location_id: lanaivale.id, base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Lanaivale
    { from_location_id: lanaivale.id, to_location_id: phoenwick.id, base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    { from_location_id: lanaivale.id, to_location_id: luxmere.id,   base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Phoenwick
    { from_location_id: phoenwick.id, to_location_id: dawncrest.id, base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    { from_location_id: phoenwick.id, to_location_id: luxmere.id,   base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    { from_location_id: phoenwick.id, to_location_id: origrund.id,  base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
    // Dawncrest
    { from_location_id: dawncrest.id, to_location_id: luxmere.id,   base_travel_time: 5, travel_type: 'walking', is_bidirectional: true },
  ]);

  // ── Resource nodes ───────────────────────────────────────────────
  await knex('resource_nodes').insert([
    // Lanaivale — Woodcutting
    {
      location_id: lanaivale.id, skill: 'woodcutting', name: 'Lanai Tree',
      required_level: 1, base_timer: 5, min_timer: 3, required_tool_tier: 1,
      poor_chance: 65, fine_chance: 30, excellent_chance: 5, xp_reward: 10,
    },
    // Grundagr — Mining
    {
      location_id: grundagr.id, skill: 'mining', name: 'Granite Rock',
      required_level: 1, base_timer: 5, min_timer: 3, required_tool_tier: 1,
      poor_chance: 0, fine_chance: 0, excellent_chance: 0, xp_reward: 8,
      vein_discovery_chance: 15, min_vein_quantity: 50, max_vein_quantity: 100,
    },
    // Origrund — Mining
    {
      location_id: origrund.id, skill: 'mining', name: 'Granite Rock',
      required_level: 1, base_timer: 5, min_timer: 3, required_tool_tier: 1,
      poor_chance: 0, fine_chance: 0, excellent_chance: 0, xp_reward: 8,
      vein_discovery_chance: 15, min_vein_quantity: 50, max_vein_quantity: 100,
    },
  ]);
}