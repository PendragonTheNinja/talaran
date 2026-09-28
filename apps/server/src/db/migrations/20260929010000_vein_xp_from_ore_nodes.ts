import type { Knex } from 'knex';

// Vein ore XP now comes from the ore node's xp_reward, as trees and rocks do
// (services/mining.ts veinNode). It used to be a formula, level * 2.5 + 30,
// which gave Ambren and Burgh 32 a swing. The rate ladder in
// docs/xp-rebalance.md sets ores at 1.3 x 1.10 x 2,000 = 2,860 XP an hour at
// level 1; at their 28 s swing that is 2,860 x 28 / 3,600 = 22.
//
// Only rows still at 0 are set, so a value already chosen in the admin panel
// is left alone. Later ores get their numbers from the ladder when their nodes
// are added.

const ORES = ['ambren', 'burgh'];
const XP = 22;

export async function up(knex: Knex): Promise<void> {
    await knex('resource_nodes')
        .where({ skill: 'mining' })
        .whereIn('ore_subtype', ORES)
        .where((q) => q.whereNull('xp_reward').orWhere('xp_reward', 0))
        .update({ xp_reward: XP });
}

export async function down(knex: Knex): Promise<void> {
    await knex('resource_nodes')
        .where({ skill: 'mining', xp_reward: XP })
        .whereIn('ore_subtype', ORES)
        .update({ xp_reward: 0 });
}
