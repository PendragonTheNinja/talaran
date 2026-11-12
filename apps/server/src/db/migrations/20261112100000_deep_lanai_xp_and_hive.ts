import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The level 13 tree in Eld Grove, missed twice by a rename (audit 2026-11-09,
// C1; Nathan, 2026-11-12: fix both).
//
// 20260714174215_xp_rebalance_node_values set its XP to 49 and
// 20260905120000_wild_hive_per_node gave it a 1 in 480 wild hive, both by the
// name "Old Growth Lanai Tree". The node is "Deep Lanai Tree", so both matched
// nothing and said nothing: it kept 65 XP (3,900 an hour, a third over the
// level 13 band of 2,926) and could never drop a hive.
//
// Up sets 49 from 65 and adds the hive. A node at 49 already is left alone
// (re-run); any other value stops the migration rather than overwrite a number
// someone chose since. Down puts both back.

const NODE = 'Deep Lanai Tree';
const BEFORE_XP = 65;
const AFTER_XP = 49;
const HIVE_ONE_IN = 480;

async function theTree(knex: Knex) {
    const nodes = await knex('resource_nodes').where({ name: NODE, skill: 'woodcutting' });
    if (nodes.length !== 1) throw new Error(`deep_lanai_xp_and_hive: expected one woodcutting node named "${NODE}", found ${nodes.length}`);
    const hive = await knex('items').where({ name: 'Wild Hive' }).first('id');
    if (!hive) throw new Error('deep_lanai_xp_and_hive: no item named "Wild Hive"');
    return { node: nodes[0], hiveId: hive.id as number, sourceKey: `woodcutting:node:${nodes[0].id}` };
}

export async function up(knex: Knex): Promise<void> {
    // A fresh database before content:import (lib/migrationContent.ts).
    if (!(await hasContent(knex))) return;

    await knex.transaction(async (trx) => {
        const { node, hiveId, sourceKey } = await theTree(trx);
        const xp = Number(node.xp_reward);
        if (xp !== AFTER_XP) {
            if (xp !== BEFORE_XP) throw new Error(`deep_lanai_xp_and_hive: ${NODE} pays ${xp} XP, expected ${BEFORE_XP}; changed since, so it is left for a person to decide`);
            await trx('resource_nodes').where({ id: node.id }).update({ xp_reward: AFTER_XP });
        }

        const existing = await trx('drop_table_entries').where({ source_key: sourceKey, item_id: hiveId }).first();
        if (existing) {
            await trx('drop_table_entries').where({ id: existing.id }).update({ chance_one_in: HIVE_ONE_IN, is_active: true });
        } else {
            await trx('drop_table_entries').insert({
                source_key: sourceKey, item_id: hiveId, chance_one_in: HIVE_ONE_IN,
                min_qty: 1, max_qty: 1, discovery_xp: 40, is_active: true,
            });
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    await knex.transaction(async (trx) => {
        const { node, hiveId, sourceKey } = await theTree(trx);
        if (Number(node.xp_reward) === AFTER_XP) await trx('resource_nodes').where({ id: node.id }).update({ xp_reward: BEFORE_XP });
        await trx('drop_table_entries').where({ source_key: sourceKey, item_id: hiveId }).delete();
    });
}
