import type { Knex } from 'knex';

// Farming M4 — processing. What you grow (and some of what you forage) now goes
// somewhere. Depth scales by crop, exactly as designed:
//   vegetables → nothing to do, harvest and you're done
//   grain      → thresh (grain + straw) → mill (flour)
//   flax       → ret (long soak) → scutch (linen fibres) → Crafting spins and weaves
//   acorns     → leach and grind (acorn flour) — a foraged line, not a farmed one
//
// These run on the existing skill-agnostic recipe executor, so they get timers,
// input checking, and XP for free. XP is set to the active band for each step's
// level and duration.
//
// NOTE: retting is realistically a days-long passive soak. True passive recipes are
// driven by a station (the tanning vats), so a proper retting pool wants to be a
// farmstead structure — that's a later milestone. For now it is a long active job.

const ITEMS = [
    { name: 'Grain Sheaves', type: 'material', subtype: 'produce', tier: 1, quality: null, slot: null, level_required: 1, description: 'Cut stalks bound into sheaves, the ears still heavy on them. Wants threshing.', stackable: true },
    { name: 'Straw', type: 'material', subtype: 'fodder', tier: 1, quality: null, slot: null, level_required: 1, description: 'Dry stalks left once the grain is beaten free. Bedding, thatch, and winter fodder.', stackable: true },
    { name: 'Flour', type: 'material', subtype: 'foodstuff', tier: 1, quality: null, slot: null, level_required: 1, description: 'Stone-ground flour, still warm from the millstone. Bread begins here.', stackable: true },
    { name: 'Acorn Flour', type: 'material', subtype: 'foodstuff', tier: 1, quality: null, slot: null, level_required: 1, description: 'Acorns leached of their bitterness and ground coarse. Famine food, and honest enough.', stackable: true },
    { name: 'Retted Flax', type: 'material', subtype: 'fiber', tier: 1, quality: null, slot: null, level_required: 1, description: 'Flax left to rot in still water until the woody core lets go of the fibre.', stackable: true },
    { name: 'Linen Fibres', type: 'material', subtype: 'fiber', tier: 1, quality: null, slot: null, level_required: 1, description: 'Long, pale, combed-out flax fibre. Ready for the wheel.', stackable: true },
    { name: 'Linen Thread', type: 'material', subtype: 'fiber', tier: 1, quality: null, slot: null, level_required: 1, description: 'Spun linen thread, strong and cool to the touch.', stackable: true },
    { name: 'Linen Cloth', type: 'material', subtype: 'cloth', tier: 1, quality: null, slot: null, level_required: 1, description: 'A woven bolt of linen. The plainest cloth worth wearing.', stackable: true },
];

const RECIPES = [
    // ── grain ────────────────────────────────────────────────────────────────
    {
        skill: 'Farming', name: 'Thresh Grain Sheaves', output_item_name: 'Grain', output_qty: 3,
        inputs: JSON.stringify([{ itemName: 'Grain Sheaves', qty: 2 }]),
        required_level: 5, timer_seconds: 30, xp: 20, station: null, mode: 'active', is_active: true,
    },
    {
        skill: 'Farming', name: 'Mill Flour', output_item_name: 'Flour', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Grain', qty: 3 }]),
        required_level: 8, timer_seconds: 45, xp: 32, station: null, mode: 'active', is_active: true,
    },
    // ── flax → linen ─────────────────────────────────────────────────────────
    {
        skill: 'Farming', name: 'Ret Flax', output_item_name: 'Retted Flax', output_qty: 3,
        inputs: JSON.stringify([{ itemName: 'Flax', qty: 3 }]),
        required_level: 7, timer_seconds: 600, xp: 423, station: null, mode: 'active', is_active: true,
    },
    {
        skill: 'Farming', name: 'Scutch Flax', output_item_name: 'Linen Fibres', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Retted Flax', qty: 2 }]),
        required_level: 9, timer_seconds: 60, xp: 44, station: null, mode: 'active', is_active: true,
    },
    {
        skill: 'Crafting', name: 'Spin Linen Thread', output_item_name: 'Linen Thread', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Linen Fibres', qty: 2 }]),
        required_level: 5, timer_seconds: 30, xp: 20, station: null, mode: 'active', is_active: true,
    },
    {
        skill: 'Crafting', name: 'Weave Linen Cloth', output_item_name: 'Linen Cloth', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Linen Thread', qty: 3 }]),
        required_level: 8, timer_seconds: 60, xp: 43, station: null, mode: 'active', is_active: true,
    },
    // ── foraged line ─────────────────────────────────────────────────────────
    {
        skill: 'Farming', name: 'Leach and Grind Acorns', output_item_name: 'Acorn Flour', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Acorns', qty: 5 }]),
        required_level: 3, timer_seconds: 40, xp: 26, station: null, mode: 'active', is_active: true,
    },
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

    // Grain now comes off the field as sheaves; threshing turns it into grain.
    await knex('crops').where({ name: 'Wild Grain' }).update({ produce_item_name: 'Grain Sheaves' });

    // Threshing also yields straw — modelled as a second recipe output would need
    // schema support, so straw comes from its own cheap by-product craft instead.
    const strawRecipe = {
        skill: 'Farming', name: 'Gather Straw', output_item_name: 'Straw', output_qty: 2,
        inputs: JSON.stringify([{ itemName: 'Grain Sheaves', qty: 1 }]),
        required_level: 5, timer_seconds: 20, xp: 13, station: null, mode: 'active', is_active: true,
    };
    const existingStraw = await knex('recipes').where({ name: strawRecipe.name }).first();
    if (existingStraw) await knex('recipes').where({ id: existingStraw.id }).update(strawRecipe);
    else await knex('recipes').insert(strawRecipe);
}

export async function down(knex: Knex): Promise<void> {
    const names = RECIPES.map(r => r.name).concat('Gather Straw');
    await knex('recipes').whereIn('name', names).delete();
    await knex('crops').where({ name: 'Wild Grain' }).update({ produce_item_name: 'Grain' });
}
