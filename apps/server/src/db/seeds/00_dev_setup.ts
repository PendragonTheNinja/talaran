import type { Knex } from 'knex';

// This seed sets up YOUR test account after a reseed
// Only runs in development
export async function seed(knex: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const player = await knex('players').where({ username: 'Pendragon' }).first();
  if (!player) return;

  // Initialize all skills at 0 XP if not already present
  const allSkills = await knex('skills').select('id');
  for (const skill of allSkills) {
    await knex('player_skills')
      .insert({ player_id: player.id, skill_id: skill.id, xp: 0 })
      .onConflict(['player_id', 'skill_id'])
      .ignore();
  }

  // Set starting location
  const talador = await knex('locations').where({ name: 'Talador' }).first();
  if (talador) {
    await knex('players')
      .where({ id: player.id })
      .update({ current_location_id: talador.id });
  }

  // Give starting tools if inventory is empty
  const inventoryCount = await knex('player_inventory')
    .where({ player_id: player.id })
    .count('id as count')
    .first();

  if (parseInt(inventoryCount?.count as string) === 0) {
    const hatchet = await knex('items').where({ name: 'Ambren Hatchet' }).first();
    const pickaxe = await knex('items').where({ name: 'Ambren Pickaxe' }).first();

    if (hatchet) {
      await knex('player_inventory').insert({
        player_id: player.id,
        item_id: hatchet.id,
        quantity: 1,
      });
    }
    if (pickaxe) {
      await knex('player_inventory').insert({
        player_id: player.id,
        item_id: pickaxe.id,
        quantity: 1,
      });
    }
  }

  // Initialize player stats
  await knex('player_stats')
    .insert({ player_id: player.id })
    .onConflict(['player_id'])
    .ignore();

  console.log('Dev setup complete for Pendragon');
}

  console.log('Dev setup complete for Pendragon');