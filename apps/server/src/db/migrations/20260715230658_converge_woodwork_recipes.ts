import type { Knex } from 'knex';

// Convergence (CLAUDE.md §2): the legacy hard-coded WOODWORK_RECIPES move into
// the recipes table so one generic executor and one UI serve every bench craft.
// Adds for_skill: recipes are grouped in the UI by WHO THE OUTPUT SERVES, not
// who makes it — a carpenter builds gear for four different skills.
// station names a workstations.type; the executor doubles the timer without one,
// matching the legacy `usingBench ? timer * 2 : timer` rule exactly.

const WOODWORK = [
    {
        skill: 'Carpentry', for_skill: 'Smithing', name: 'Lanai Tool Rod',
        output_item_name: 'Lanai Tool Rod', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 1 }]),
        required_level: 1, timer_seconds: 35, xp: 39, station: 'carpentry', mode: 'active', is_active: true,
    },
    {
        skill: 'Carpentry', for_skill: 'Agility', name: 'Lanai Staff',
        output_item_name: 'Lanai Staff', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 4 }]),
        required_level: 5, timer_seconds: 140, xp: 169, station: 'carpentry', mode: 'active', is_active: true,
    },
    {
        skill: 'Carpentry', for_skill: 'Carpentry', name: 'Lanai Sawhorse',
        output_item_name: 'Lanai Sawhorse', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 10 }]),
        required_level: 1, timer_seconds: 350, xp: 390, station: 'carpentry', mode: 'active', is_active: true,
    },
];

// Existing recipes gain their purpose tab
const FOR_SKILL = [
    { name: 'Build Tanning Rack', for_skill: 'Crafting', station: 'carpentry' },
    { name: 'Fletch Arrows', for_skill: 'Hunting' },
    { name: 'Tie Snare', for_skill: 'Hunting' },
    { name: 'Tan Deerhide', for_skill: 'Crafting' },
    { name: 'Tan Boarhide', for_skill: 'Crafting' },
    { name: 'Tan Slothhide', for_skill: 'Crafting' },
    { name: 'Cut Buckskin Strips', for_skill: 'Crafting' },
];

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('recipes', (t) => {
        t.string('for_skill', 50).nullable(); // null = same as skill
    });

    for (const recipe of WOODWORK) {
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }

    for (const upd of FOR_SKILL) {
        const { name, ...fields } = upd;
        const existing = await knex('recipes').where({ name }).first();
        if (!existing) throw new Error(`converge_woodwork_recipes: recipe "${name}" not found`);
        await knex('recipes').where({ id: existing.id }).update(fields);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', WOODWORK.map(r => r.name)).delete();
    await knex.schema.alterTable('recipes', (t) => {
        t.dropColumn('for_skill');
    });
}