import type { Knex } from 'knex';

// XP rebalance (docs/xp-rebalance.md): retune the two live nodes to the new rate ladder.
// Idempotent — safe on databases where these values were already applied manually.

export async function up(knex: Knex): Promise<void> {
    await knex('resource_nodes').where({ name: 'Lanai Tree' }).update({ xp_reward: 28 });
    await knex('resource_nodes').where({ name: 'Old Growth Lanai Tree' }).update({ xp_reward: 49 });
}

export async function down(knex: Knex): Promise<void> {
    await knex('resource_nodes').where({ name: 'Lanai Tree' }).update({ xp_reward: 25 });
    await knex('resource_nodes').where({ name: 'Old Growth Lanai Tree' }).update({ xp_reward: 65 });
}