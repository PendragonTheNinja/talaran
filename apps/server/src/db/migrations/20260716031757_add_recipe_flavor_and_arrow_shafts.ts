import type { Knex } from 'knex';

// 1. flavor_text: scene text is content, not a hard-coded string per action type.
// 2. Arrow shafts: restores the shaft/head/fletching chain. Carpentry splits the
//    shafts, Smithing fits the heads — the same split Lanai Tool Rod already uses
//    for tools. Plank->arrow and feather->arrow ratios are unchanged, so the
//    validated arrow economy holds.

const ITEMS = [
    { name: 'Lanai Arrow Shafts', type: 'material', subtype: 'shaft', tier: 1, quality: null, slot: null, level_required: 1, description: 'Straight lengths of split Lanai, planed round and waiting for a head.', stackable: true },
];

const NEW_RECIPES = [
    {
        skill: 'Carpentry', for_skill: 'Hunting', name: 'Split Arrow Shafts',
        output_item_name: 'Lanai Arrow Shafts', output_qty: 5,
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 1 }]),
        required_level: 1, timer_seconds: 20, xp: 13, station: 'carpentry', mode: 'active', is_active: true,
        flavor_text: 'You are splitting arrow shafts.',
    },
];

const FLETCH = {
    inputs: JSON.stringify([
        { itemName: 'Lanai Arrow Shafts', qty: 5 },
        { itemName: 'Ambren Ingot', qty: 1 },
        { itemName: 'Feathers', qty: 2 },
    ]),
    flavor_text: 'You are fletching arrows.',
};

// Starting points — rewrite to taste, they're rows now.
const FLAVOR: Record<string, string> = {
    'Lanai Tool Rod': 'You are turning a tool rod.',
    'Lanai Staff': 'You are shaping a walking staff.',
    'Lanai Sawhorse': 'You are joining a sawhorse.',
    'Build Tanning Rack': 'You are lashing together a tanning rack.',
    'Ambren Pickaxe': 'You are hammering out a pickaxe head.',
    'Ambren Hatchet': 'You are hammering out a hatchet head.',
    'Ambren Hammer': 'You are forging a hammer.',
    'Ambren Tongs': 'You are bending a pair of tongs.',
    'Ambren Anvil': 'You are beating out an anvil.',
    'Ambren Saw': 'You are filing saw teeth.',
    'Ambren Plane': 'You are fitting a plane iron.',
    'Cut Buckskin Strips': 'You are cutting buckskin into strips.',
    'Tie Snare': 'You are tying a snare.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('recipes', (t) => {
        t.string('flavor_text', 200).nullable(); // null = fall back to a per-skill default
    });

    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    for (const recipe of NEW_RECIPES) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }

    const fletch = await knex('recipes').where({ name: 'Fletch Arrows' }).first();
    if (!fletch) throw new Error('add_recipe_flavor_and_arrow_shafts: Fletch Arrows not found');
    await knex('recipes').where({ id: fletch.id }).update(FLETCH);

    for (const [name, flavor_text] of Object.entries(FLAVOR)) {
        await knex('recipes').where({ name }).update({ flavor_text });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Fletch Arrows' }).update({
        inputs: JSON.stringify([
            { itemName: 'Lanai Planks', qty: 1 },
            { itemName: 'Ambren Ingot', qty: 1 },
            { itemName: 'Feathers', qty: 2 },
        ]),
    });
    await knex('recipes').whereIn('name', NEW_RECIPES.map(r => r.name)).delete();
    await knex.schema.alterTable('recipes', (t) => { t.dropColumn('flavor_text'); });
}