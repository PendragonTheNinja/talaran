import type { Knex } from 'knex';

// Trapping content (docs/trapping-spec.md §2-§4): items, the Snare trap type,
// the Eld Grove catch pool, and the wild-side (buckskin) recipe line.
// Material families (CLAUDE.md §3): Buckskin = wild, ONE item, yield-scaled by
// animal size; it cuts into tier-1 Leather Strips only. Leather sheets + strips
// tiers 2-5 are cattle-only, arriving with Husbandry.
// Upsert-by-name throughout — idempotent on prod, local, and fresh installs.

const ITEMS = [
    { name: 'Snare', type: 'tool', subtype: 'trap', tier: 1, quality: null, slot: null, level_required: 1, description: 'A cordage loop on a bent-sapling spring. The trapper\'s oldest friend.', stackable: true },
    { name: 'Leather Strips', type: 'material', subtype: 'leather', tier: 1, quality: null, slot: null, level_required: 1, description: 'Rough-cut strips of leather. Cordage, bindings, and a hundred small uses.', stackable: true },
    { name: 'Buckskin', type: 'material', subtype: 'leather', tier: 1, quality: null, slot: null, level_required: 1, description: 'Soft, supple leather worked from a wild hide. A hunter\'s material, not a tanner\'s trade good.', stackable: true },
    { name: 'Feathers', type: 'material', subtype: 'feather', tier: 1, quality: null, slot: null, level_required: 1, description: 'Stiff flight feathers. Essential fletching for any arrow.', stackable: true },
    { name: 'Rabbit Meat', type: 'food', subtype: 'raw_meat', tier: 1, quality: null, slot: null, level_required: 1, description: 'Lean rabbit meat. Best cooked before eating.', stackable: true },
    { name: 'Pheasant Meat', type: 'food', subtype: 'raw_meat', tier: 1, quality: null, slot: null, level_required: 1, description: 'A plump pheasant breast. Best cooked before eating.', stackable: true },
    { name: 'Rabbit Fur', type: 'material', subtype: 'hide', tier: 1, quality: null, slot: null, level_required: 1, description: 'A soft rabbit pelt, warm despite its size.', stackable: true },
    { name: "Rabbit's Foot", type: 'material', subtype: 'trophy', tier: 1, quality: null, slot: null, level_required: 1, description: 'A preserved rabbit\'s foot. Said to carry luck for its keeper.', stackable: true },
    { name: 'Prized Plume', type: 'material', subtype: 'trophy', tier: 1, quality: null, slot: null, level_required: 1, description: 'A single flawless tail feather, banded in color. Far too perfect to fletch.', stackable: true },
    { name: 'Squonk Tears', type: 'material', subtype: 'trophy', tier: 1, quality: null, slot: null, level_required: 1, description: 'A small vial of sorrowful tears — all that remains when a Squonk is caught.', stackable: true },
];

const TRAP_TYPE = {
    name: 'Snare', item_name: 'Snare', required_level: 5,
    roll_interval_seconds: 1800, catch_chance: 55, break_chance: 25,
    scavenger_safe_hours: 4, scavenger_hourly_chance: 15, is_active: true,
};

// XP per catch validated by sim against the passive policy (0.30 x band):
// a tended line lands ~27-30% of band at L12/25/37. See docs/trapping-spec.md §3.
const TARGETS = [
    {
        name: 'Rabbit', weight: 640, xp: 400, is_active: true,
        drop_table: JSON.stringify([
            { itemName: 'Rabbit Meat', min: 1, max: 2, chance: 100, perishable: true },
            { itemName: 'Rabbit Fur', min: 1, max: 1, chance: 70 },
            { itemName: "Rabbit's Foot", min: 1, max: 1, chance: 5, notable: true },
        ]),
    },
    {
        name: 'Pheasant', weight: 355, xp: 640, is_active: true,
        drop_table: JSON.stringify([
            { itemName: 'Pheasant Meat', min: 1, max: 1, chance: 100, perishable: true },
            { itemName: 'Feathers', min: 4, max: 8, chance: 100 },
            { itemName: 'Prized Plume', min: 1, max: 1, chance: 5, notable: true },
        ]),
    },
    {
        name: 'Squonk', weight: 5, xp: 3000, is_active: true,
        drop_table: JSON.stringify([
            { itemName: 'Squonk Tears', min: 1, max: 1, chance: 100, notable: true },
        ]),
    },
];

// Tans/cut ship with station: null; the Crafting launch migration sets
// station = 'Tanning Rack' once that station item exists.
const RECIPES = [
    {
        skill: 'Smithing', name: 'Fletch Arrows', output_item_name: 'Ambren Arrow', output_qty: 5,
        inputs: JSON.stringify([
            { itemName: 'Lanai Planks', qty: 1 },
            { itemName: 'Ambren Ingot', qty: 1 },
            { itemName: 'Feathers', qty: 2 },
        ]),
        required_level: 1, timer_seconds: 30, xp: 20, station: null, is_active: true,
    },
    {
        skill: 'Crafting', name: 'Tan Deerhide', output_item_name: 'Buckskin', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Deerhide', qty: 1 },
        ]),
        required_level: 1, timer_seconds: 30, xp: 20, station: null, is_active: true,
    },
    {
        skill: 'Crafting', name: 'Tan Boarhide', output_item_name: 'Buckskin', output_qty: 2,
        inputs: JSON.stringify([
            { itemName: 'Boarhide', qty: 1 },
        ]),
        required_level: 9, timer_seconds: 60, xp: 48, station: null, is_active: true,
    },
    {
        skill: 'Crafting', name: 'Tan Slothhide', output_item_name: 'Buckskin', output_qty: 3,
        inputs: JSON.stringify([
            { itemName: 'Slothhide', qty: 1 },
        ]),
        required_level: 17, timer_seconds: 90, xp: 87, station: null, is_active: true,
    },
    {
        skill: 'Crafting', name: 'Cut Buckskin Strips', output_item_name: 'Leather Strips', output_qty: 3,
        inputs: JSON.stringify([
            { itemName: 'Buckskin', qty: 1 },
        ]),
        required_level: 1, timer_seconds: 20, xp: 13, station: null, is_active: true,
    },
    {
        skill: 'Crafting', name: 'Tie Snare', output_item_name: 'Snare', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Lanai Planks', qty: 2 },
            { itemName: 'Leather Strips', qty: 2 },
        ]),
        required_level: 1, timer_seconds: 60, xp: 66, station: null, is_active: true,
    },
];

export async function up(knex: Knex): Promise<void> {
    // "Tanner's Scraps" was an alpha-era placeholder; it becomes Leather Strips.
    // Guarded so it can't collide if both names somehow exist.
    const scraps = await knex('items').where({ name: "Tanner's Scraps" }).first();
    const strips = await knex('items').where({ name: 'Leather Strips' }).first();
    if (scraps && !strips) {
        await knex('items').where({ id: scraps.id }).update({ name: 'Leather Strips' });
    }

    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    const existingType = await knex('trap_types').where({ name: TRAP_TYPE.name }).first();
    const trapTypeId = existingType
        ? (await knex('trap_types').where({ id: existingType.id }).update(TRAP_TYPE), existingType.id)
        : (await knex('trap_types').insert(TRAP_TYPE).returning('id'))[0].id;

    const eldGrove = await knex('locations').where({ name: 'Eld Grove' }).first();
    if (!eldGrove) throw new Error('seed_trapping_content: Eld Grove location not found');

    for (const target of TARGETS) {
        const row = { ...target, location_id: eldGrove.id, trap_type_id: trapTypeId };
        const existing = await knex('trap_targets')
            .where({ location_id: eldGrove.id, name: target.name }).first();
        if (existing) await knex('trap_targets').where({ id: existing.id }).update(row);
        else await knex('trap_targets').insert(row);
    }

    for (const recipe of RECIPES) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }
}

export async function down(knex: Knex): Promise<void> {
    // Removes trapping definitions; deliberately leaves items (players may hold them)
    await knex('recipes').whereIn('name', RECIPES.map(r => r.name)).delete();
    await knex('trap_targets').whereIn('name', TARGETS.map(t => t.name)).delete();
    await knex('trap_types').where({ name: TRAP_TYPE.name }).delete();
}
