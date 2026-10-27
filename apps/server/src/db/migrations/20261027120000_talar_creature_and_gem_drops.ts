import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 1 (docs/talar-spec.md §2, §9, §14; Nathan, 2026-10-24 and
// 2026-10-27): creature drops, and the gems Talar will be filled from.
//
//   Gems      Rough Quartz and Rough Garnet, the two gems Taiar hosts.
//             Granite: Quartz 1 in 200 swings (was 1 in 50), Garnet 1 in 800.
//             Ore (Ambren, Burgh): Quartz 1 in 130, Garnet 1 in 520. An ore
//             swing is slower (25 to 28 s against 15 to 20), so these keep
//             gems per HOUR level with Granite: about one quartz an hour,
//             whatever the miner is swinging at. Nathan asked for gems from
//             ore as well as stone. Creatures are a supplement (§2).
//   Seeds     Matched to the creature's level against the crop's planting
//             level; perennials rarer because they give for years.
//   Wolf Pelt Grey Wolf, 1 in 15, for the Wolfskin Cloak (Crafting, later).
//
// The 1-in-50 quartz already in players' packs stays (alpha; Nathan,
// 2026-10-24). Upserted by source and item name, loud throw on anything
// missing; down() removes exactly these rows and puts Granite back to 1 in 50.
// Items stay on down(), as with every content migration: players may hold them.

const ITEMS = [
    {
        name: 'Rough Garnet', type: 'gem', subtype: 'garnet', quality: 'rough', tier: 1, level_required: 1,
        description: 'A dark red knot in the grey rock, no bigger than a pea. It looks like nothing much until it is cut.',
    },
    {
        name: 'Wolf Pelt', type: 'material', subtype: 'hide', tier: 1, level_required: 1,
        description: 'A grey wolf\'s coat, thick at the ruff and coarse down the spine. Sewn together, a few of these would keep a winter out.',
    },
];

// [source key, item, 1 in N]
const DROPS: [string, string, number][] = [
    // Mining. Granite's quartz row already exists (20260618175418); this re-rates it.
    ['mining:rock:granite', 'Rough Quartz', 200],
    ['mining:rock:granite', 'Rough Garnet', 800],
    ['mining:ore:ambren', 'Rough Quartz', 130],
    ['mining:ore:ambren', 'Rough Garnet', 520],
    ['mining:ore:burgh', 'Rough Quartz', 130],
    ['mining:ore:burgh', 'Rough Garnet', 520],

    // Gems off creatures.
    ['combat:knocker', 'Rough Quartz', 40],
    ['combat:knocker', 'Rough Garnet', 300],
    ['combat:jumper', 'Rough Quartz', 150],
    ['combat:sidehill_gouger', 'Rough Quartz', 200],
    ['combat:hodag', 'Rough Garnet', 250],

    // Seeds.
    ['combat:dock_rat', 'Onion Seeds', 25],
    ['combat:granary_rat', 'Carrot Seeds', 20],
    ['combat:jackalope', 'Turnip Seeds', 20],
    ['combat:feral_dog', 'Garlic Cloves', 25],
    ['combat:sidehill_gouger', 'Wild Grain', 25],
    ['combat:jumper', 'Pea Seeds', 30],
    ['combat:grey_wolf', 'Flax Seeds', 30],
    ['combat:agropelter', 'Strawberry Runner', 100],
    ['combat:hodag', 'Raspberry Cane', 100],

    ['combat:grey_wolf', 'Wolf Pelt', 15],
];

const GRANITE_QUARTZ_BEFORE = 50;

export async function up(knex: Knex): Promise<void> {
    // A fresh database before content:import (lib/migrationContent.ts): schema only.
    if (!(await hasContent(knex))) return;

    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update({ ...item, updated_at: knex.fn.now() });
        else await knex('items').insert({ ...item, is_active: true });
    }

    for (const [sourceKey, itemName, oneIn] of DROPS) {
        if (sourceKey.startsWith('combat:')) {
            const key = sourceKey.slice('combat:'.length);
            if (!(await knex('creatures').where({ key }).first())) throw new Error(`talar_creature_and_gem_drops: creature ${key} not found`);
        }
        if (sourceKey.startsWith('mining:ore:')) {
            const subtype = sourceKey.slice('mining:ore:'.length);
            if (!(await knex('items').where({ type: 'ore', subtype }).first())) throw new Error(`talar_creature_and_gem_drops: ore ${subtype} not found`);
        }
        const item = await knex('items').where({ name: itemName }).first();
        if (!item) throw new Error(`talar_creature_and_gem_drops: item ${itemName} not found`);
        const row = { source_key: sourceKey, item_id: item.id, chance_one_in: oneIn, chance_percent: null, min_qty: 1, max_qty: 1, is_active: true };
        const existing = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: item.id }).first();
        if (existing) await knex('drop_table_entries').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('drop_table_entries').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const [sourceKey, itemName] of DROPS) {
        const item = await knex('items').where({ name: itemName }).first();
        if (!item) continue;
        const where = { source_key: sourceKey, item_id: item.id };
        if (sourceKey === 'mining:rock:granite' && itemName === 'Rough Quartz') {
            await knex('drop_table_entries').where(where).update({ chance_one_in: GRANITE_QUARTZ_BEFORE, updated_at: knex.fn.now() });
        } else {
            await knex('drop_table_entries').where(where).delete();
        }
    }
}
