import type { Knex } from 'knex';

// Farming M1 content (docs/homestead-farming-spec.md). Produce items (inert for
// now — Cooking/processing sinks come later), the Hoe and Granite Block plus their
// recipes, and the eight crops seeded by the current foraging scope. Grow times
// are long (12 h+, scaling with level) — farming is the passive long-haul skill.
//
// XP TUNING: xp_per_seed is set so each plot produces 0.12 x the active gathering
// reference rate for that crop's level (per-plot rate rises with crop tier). With
// the level-capped plot ladder that puts a 1-plot starter farm at ~12% of an active
// skill and a maxed 20-field farm at ~86% (~60% at realistic harvest uptime) —
// strong, but never beating active play. Tending (M3) and processing (M4) add on top.

const H = 3600;

const ITEMS = [
    // Tool + construction material
    { name: 'Ambren Hoe', type: 'tool', subtype: 'hoe', tier: 1, quality: null, slot: null, level_required: 1, description: 'A broad Ambren blade on a stout haft, for breaking and turning soil.', stackable: false },
    { name: 'Granite Block', type: 'material', subtype: 'stone', tier: 1, quality: null, slot: null, level_required: 1, description: 'A squared, dressed block of granite. The bones of any building worth the name.', stackable: true },
    { name: 'Fence Panel', type: 'material', subtype: 'component', tier: 1, quality: null, slot: null, level_required: 1, description: 'A section of post-and-rail fencing, ready to set into the ground. Field-edges are made of these.', stackable: true },
    { name: 'Ambren Nails', type: 'material', subtype: 'component', tier: 1, quality: null, slot: null, level_required: 1, description: 'A fistful of hand-hammered Ambren nails. Nothing holds timber to timber like them.', stackable: true },

    // Produce (harvest output) — inert until Cooking/processing lands
    { name: 'Carrot', type: 'material', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'A firm, sweet root, pulled from turned earth rather than found wild.', stackable: true },
    { name: 'Onion', type: 'material', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'A papery-skinned bulb that makes the difference in half the pots in Talaran.', stackable: true },
    { name: 'Turnip', type: 'material', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'A hardy root — good on the table, better in a lean winter, fine as fodder.', stackable: true },
    { name: 'Peas', type: 'material', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'Green peas in the pod. The plant leaves the soil richer than it found it.', stackable: true },
    { name: 'Grain', type: 'material', subtype: 'grain', tier: 1, quality: null, slot: null, level_required: 1, description: 'Threshed heads of grain. Ground to flour for bread, or fed whole to livestock.', stackable: true },
    { name: 'Flax', type: 'material', subtype: 'fiber', tier: 1, quality: null, slot: null, level_required: 1, description: 'Cut flax stalks. Rotted, beaten, and combed, they give up long linen fibres.', stackable: true },
    { name: 'Strawberry', type: 'material', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'A plump cultivated strawberry, larger and sweeter than its wild cousin.', stackable: true },
    { name: 'Raspberry', type: 'material', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'Cultivated raspberries from a tended cane — a bush that gives for years.', stackable: true },
];

const RECIPES = [
    {
        skill: 'Crafting', name: 'Cut Granite Block', output_item_name: 'Granite Block', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Granite', qty: 3 }]),
        required_level: 1, timer_seconds: 15, xp: 20, station: null, mode: 'active', is_active: true,
    },
    {
        skill: 'Carpentry', name: 'Build Fence Panel', output_item_name: 'Fence Panel', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 4 }, { itemName: 'Ambren Nails', qty: 8 }]),
        required_level: 1, timer_seconds: 20, xp: 30, station: null, mode: 'active', is_active: true,
    },
    {
        skill: 'Smithing', name: 'Hammer Ambren Nails', output_item_name: 'Ambren Nails', output_qty: 30,
        inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 1 }]),
        required_level: 1, timer_seconds: 20, xp: 25, station: null, mode: 'active', is_active: true,
    },
    {
        skill: 'Smithing', name: 'Forge Ambren Hoe', output_item_name: 'Ambren Hoe', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 1 }, { itemName: 'Lanai Planks', qty: 1 }]),
        required_level: 1, timer_seconds: 45, xp: 30, station: null, mode: 'active', is_active: true,
    },
];

// grow/regrow in seconds; xp_per_seed = PLACEHOLDER.
const CROPS = [
    { name: 'Carrot', seed_item_name: 'Carrot Seeds', produce_item_name: 'Carrot', plant_level: 1, grow_seconds: 12 * H, yield_per_seed: 3, xp_per_seed: 287, crop_type: 'vegetable', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', region: 'Taiar Island', grows_anywhere: null },
    { name: 'Onion', seed_item_name: 'Onion Seeds', produce_item_name: 'Onion', plant_level: 1, grow_seconds: 12 * H, yield_per_seed: 3, xp_per_seed: 287, crop_type: 'vegetable', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', region: 'Taiar Island', grows_anywhere: null },
    { name: 'Turnip', seed_item_name: 'Turnip Seeds', produce_item_name: 'Turnip', plant_level: 2, grow_seconds: 13 * H, yield_per_seed: 3, xp_per_seed: 319, crop_type: 'vegetable', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', region: 'Taiar Island', grows_anywhere: null },
    { name: 'Wild Grain', seed_item_name: 'Wild Grain', produce_item_name: 'Grain', plant_level: 5, grow_seconds: 15 * H, yield_per_seed: 5, xp_per_seed: 395, crop_type: 'grain', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', region: 'Taiar Island', grows_anywhere: null },
    { name: 'Pea', seed_item_name: 'Pea Seeds', produce_item_name: 'Peas', plant_level: 7, grow_seconds: 17 * H, yield_per_seed: 4, xp_per_seed: 470, crop_type: 'legume', is_perennial: false, regrow_seconds: null, soil_effect: 'restore', region: 'Taiar Island', grows_anywhere: null },
    { name: 'Flax', seed_item_name: 'Flax Seeds', produce_item_name: 'Flax', plant_level: 7, grow_seconds: 18 * H, yield_per_seed: 3, xp_per_seed: 497, crop_type: 'fiber', is_perennial: false, regrow_seconds: null, soil_effect: 'deplete', region: 'Taiar Island', grows_anywhere: null },
    { name: 'Strawberry', seed_item_name: 'Strawberry Runner', produce_item_name: 'Strawberry', plant_level: 10, grow_seconds: 24 * H, yield_per_seed: 4, xp_per_seed: 534, crop_type: 'fruit', is_perennial: true, regrow_seconds: 18 * H, soil_effect: 'neutral', region: 'Taiar Island', grows_anywhere: null },
    { name: 'Raspberry', seed_item_name: 'Raspberry Cane', produce_item_name: 'Raspberry', plant_level: 12, grow_seconds: 28 * H, yield_per_seed: 4, xp_per_seed: 622, crop_type: 'fruit', is_perennial: true, regrow_seconds: 20 * H, soil_effect: 'neutral', region: 'Taiar Island', grows_anywhere: null },
];

export async function up(knex: Knex): Promise<void> {
    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    for (const recipe of RECIPES) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }

    for (const crop of CROPS) {
        const existing = await knex('crops').where({ name: crop.name }).first();
        if (existing) await knex('crops').where({ id: existing.id }).update(crop);
        else await knex('crops').insert(crop);
    }

    await knex('skills').where({ name: 'Farming' }).update({ is_implemented: true });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', RECIPES.map(r => r.name)).delete();
    await knex('crops').whereIn('name', CROPS.map(c => c.name)).delete();
    await knex('skills').where({ name: 'Farming' }).update({ is_implemented: false });
    // Items left in place (players may hold produce/tools).
}
