import type { Knex } from 'knex';

// Convergence part 2 (CLAUDE.md §2): SMITH_RECIPES move into the recipes table.
// toolType/tier/durability are dropped deliberately — they were declared but
// never read anywhere at craft time.
// for_skill mirrors SmithingMenu's existing category tabs, which were already
// "what is this tool FOR" in disguise (pickaxe->Mining, saw->Carpentry, ...).
// station: 'smithing' reproduces the legacy `usingBlacksmith ? timer*2 : timer`.

const SMITH = [
    {
        skill: 'Smithing', for_skill: 'Mining', name: 'Ambren Pickaxe',
        output_item_name: 'Ambren Pickaxe', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Ambren Ingot', qty: 2 },
            { itemName: 'Lanai Tool Rod', qty: 1 },
            { itemName: 'Leather Strips', qty: 1 },
        ]),
        required_level: 1, timer_seconds: 90, xp: 100, station: 'smithing', mode: 'active', is_active: true,
    },
    {
        skill: 'Smithing', for_skill: 'Woodcutting', name: 'Ambren Hatchet',
        output_item_name: 'Ambren Hatchet', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Ambren Ingot', qty: 2 },
            { itemName: 'Lanai Tool Rod', qty: 1 },
            { itemName: 'Leather Strips', qty: 1 },
        ]),
        required_level: 1, timer_seconds: 90, xp: 100, station: 'smithing', mode: 'active', is_active: true,
    },
    {
        skill: 'Smithing', for_skill: 'Smithing', name: 'Ambren Hammer',
        output_item_name: 'Ambren Hammer', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Ambren Ingot', qty: 2 },
            { itemName: 'Lanai Tool Rod', qty: 1 },
        ]),
        required_level: 1, timer_seconds: 90, xp: 100, station: 'smithing', mode: 'active', is_active: true,
    },
    {
        skill: 'Smithing', for_skill: 'Smithing', name: 'Ambren Tongs',
        output_item_name: 'Ambren Tongs', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 1 }]),
        required_level: 1, timer_seconds: 45, xp: 50, station: 'smithing', mode: 'active', is_active: true,
    },
    {
        skill: 'Smithing', for_skill: 'Smithing', name: 'Ambren Anvil',
        output_item_name: 'Ambren Anvil', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 5 }]),
        required_level: 1, timer_seconds: 225, xp: 250, station: 'smithing', mode: 'active', is_active: true,
    },
    {
        skill: 'Smithing', for_skill: 'Carpentry', name: 'Ambren Saw',
        output_item_name: 'Ambren Saw', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Ambren Ingot', qty: 2 },
            { itemName: 'Lanai Planks', qty: 1 },
        ]),
        required_level: 1, timer_seconds: 90, xp: 100, station: 'smithing', mode: 'active', is_active: true,
    },
    {
        skill: 'Smithing', for_skill: 'Carpentry', name: 'Ambren Plane',
        output_item_name: 'Ambren Plane', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Ambren Ingot', qty: 2 },
            { itemName: 'Lanai Planks', qty: 2 },
        ]),
        required_level: 1, timer_seconds: 90, xp: 100, station: 'smithing', mode: 'active', is_active: true,
    },
];

export async function up(knex: Knex): Promise<void> {
    for (const recipe of SMITH) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', SMITH.map(r => r.name)).delete();
}