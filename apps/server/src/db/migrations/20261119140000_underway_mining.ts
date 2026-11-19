import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The main chain, part one: Underway's granite and Serph ore (docs/antura-plan.md
// §4 and §5; Nathan, 2026-11-15 and 17).
//
//   Underway Granite    Mining 13, a 30 s swing (22 s at its fastest), 14 XP, a
//                       tier 2 tool's work (an Ambren pickaxe still serves, slower:
//                       calculateTimer). Veins 14 in 1,000 a swing, of Serph: 1.7
//                       an hour at base, slightly rarer than Taiar's 1.8.
//   Serph Ore Node      Mining 13, 40 s (36 at its fastest, as Ambren's 28 falls
//                       to 25), 61 XP, tier 2. Serph smelts alone, on Charc.
//   Gems                Antura's own tables: on its granite Garnet 1 in 135, Quartz
//                       1 in 270, Amethyst 1 in 670; on Serph ore Garnet 1 in 90,
//                       Quartz 1 in 180, Amethyst 1 in 450 (the tier's own gem
//                       about once an hour of rock, the one below at half that,
//                       the one above at a fifth). The Writ of Kindling 1 in 1,000
//                       on both, Taiar's pace at the longer swing.
//   Items               Serph Ore and Dense Serph Ore (rows that were waiting, now
//                       active), the Serph Ingot, and Rough Amethyst. Smelting
//                       itself is SMELT_RECIPES in services/smithing.ts.

const ITEMS = [
    { name: 'Serph Ore', type: 'ore', subtype: 'serph', quality: null, tier: 2, level_required: 13,
        description: 'A lump of dull blue-grey ore, heavy for its size. It smelts on its own, with no partner ore, but it wants a hotter fire than Ambren.' },
    { name: 'Dense Serph Ore', type: 'ore', subtype: 'serph', quality: 'dense', tier: 2, level_required: 13,
        description: 'Serph ore packed so close it rings when you knock it. It smelts into more bars than its size would suggest.' },
    { name: 'Serph Ingot', type: 'ingot', subtype: 'serph', quality: null, tier: 2, level_required: 13,
        description: 'A bar of Serph, blue-grey and cold to the touch long after the forge. Harder than Ambren, and harder to work.' },
    { name: 'Rough Amethyst', type: 'gem', subtype: 'amethyst', quality: 'rough', tier: 2, level_required: 1,
        description: 'A lump of rock with a purple crystal breaking through it. Cut, it will be something.' },
];

const PLACE = 'Underway';
const GRANITE_KEY = 'mining:rock:granite@antura';

const NODES = [
    {
        name: 'Underway Granite', skill: 'mining', required_level: 13, base_timer: 30, min_timer: 22, required_tool_tier: 2,
        poor_chance: 0, fine_chance: 0, excellent_chance: 0, xp_reward: 14,
        vein_discovery_chance: 14, min_vein_quantity: 50, max_vein_quantity: 100, ore_subtype: 'granite', drop_source_key: GRANITE_KEY,
    },
    {
        name: 'Serph Ore Node', skill: 'mining', required_level: 13, base_timer: 40, min_timer: 36, required_tool_tier: 2,
        poor_chance: 60, fine_chance: 35, excellent_chance: 5, xp_reward: 61,
        vein_discovery_chance: 5, min_vein_quantity: 8, max_vein_quantity: 20, ore_subtype: 'serph', drop_source_key: null,
    },
];

// [source key, item, 1 in N]
const DROPS: [string, string, number][] = [
    [GRANITE_KEY, 'Rough Garnet', 135],
    [GRANITE_KEY, 'Rough Quartz', 270],
    [GRANITE_KEY, 'Rough Amethyst', 670],
    [GRANITE_KEY, 'Writ of Kindling', 1000],
    ['mining:ore:serph', 'Rough Garnet', 90],
    ['mining:ore:serph', 'Rough Quartz', 180],
    ['mining:ore:serph', 'Rough Amethyst', 450],
    ['mining:ore:serph', 'Writ of Kindling', 1000],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const it of ITEMS) {
        const had = await knex('items').where({ name: it.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update({ ...it, is_active: true, updated_at: knex.fn.now() });
        else await knex('items').insert({ ...it, is_active: true });
    }

    const place = await knex('locations').where({ name: PLACE }).first('id');
    if (!place) throw new Error(`underway_mining: no location named ${PLACE} (run 20261119130000 first)`);
    for (const n of NODES) {
        const row = { ...n, location_id: place.id, is_active: true };
        const had = await knex('resource_nodes').where({ name: n.name, location_id: place.id }).first('id');
        if (had) await knex('resource_nodes').where({ id: had.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('resource_nodes').insert(row);
    }

    for (const [source_key, name, oneIn] of DROPS) {
        const item = await knex('items').where({ name }).first('id');
        if (!item) throw new Error(`underway_mining: item "${name}" not found`);
        const row = { source_key, item_id: item.id, chance_one_in: oneIn, chance_percent: null, min_qty: 1, max_qty: 1, is_active: true };
        const had = await knex('drop_table_entries').where({ source_key, item_id: item.id }).first('id');
        if (had) await knex('drop_table_entries').where({ id: had.id }).update(row);
        else await knex('drop_table_entries').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('drop_table_entries').whereIn('source_key', [GRANITE_KEY, 'mining:ore:serph']).delete();
    const place = await knex('locations').where({ name: PLACE }).first('id');
    if (place) {
        const nodes = await knex('resource_nodes').where({ location_id: place.id }).whereIn('name', NODES.map(n => n.name)).pluck('id');
        if (nodes.length) {
            await knex('player_actions').whereIn('resource_node_id', nodes).delete();
            await knex('resource_nodes').whereIn('id', nodes).delete();
        }
        await knex('ore_veins').where({ location_id: place.id }).delete();
    }
    // The ore rows go back to waiting; new items stay, as players may hold them.
    await knex('items').whereIn('name', ['Serph Ore', 'Dense Serph Ore']).update({ is_active: false });
}
