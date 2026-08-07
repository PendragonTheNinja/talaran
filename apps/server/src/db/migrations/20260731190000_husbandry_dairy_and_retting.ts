import type { Knex } from 'knex';

// Dairy, and a correction to retting.
//
// DAIRY. Milk had no consumer until Cooking lands, and a cow that produces
// something nobody can use is a strange animal to keep. Butter and cheese are the
// two things every medieval dairy actually made, they belong to the person who
// milked the cow rather than the person who cooks, and they turn a perishable
// bucket into something that keeps.
//
// Both are ACTIVE. Talaran already leans heavily passive — tanning vats, snare
// lines, growing crops, growing animals — and churning and pressing are exactly
// the sort of repetitive physical work an active timer represents well. The
// long wait in real cheesemaking is the ageing, and that is a cellar we can build
// later if we ever want a passive tier above these.
//
// XP follows the active band for the recipe's level (docs/xp-rebalance.md §3):
// xp = band(level) x seconds / 3600.
//
// RETTING. 3 Flax -> 3 Retted Flax over ten minutes was a poor trade for the
// longest timer in Farming, and a 1:1 conversion makes the step feel like a tax
// rather than a process. A flax plot yields 30, so a 10-flax batch is three soaks
// per harvest. The 1.5x yield is the reward for the wait. Timer and XP are
// unchanged, so the XP rate stays exactly on policy.

const ITEMS = [
    { name: 'Butter', type: 'food', subtype: 'dairy', tier: 1, quality: null, slot: null, level_required: 1, description: 'A pale golden pat, worked and salted. Keeps a week in a cold larder and improves everything it touches.', stackable: true },
    { name: 'Cheese', type: 'food', subtype: 'dairy', tier: 2, quality: null, slot: null, level_required: 1, description: 'A firm pressed round with a rind coming on. Milk made patient enough to travel.', stackable: true },
];

const RECIPES = [
    {
        skill: 'Husbandry', for_skill: 'Husbandry', name: 'Churn Butter',
        output_item_name: 'Butter', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Milk', qty: 3 }]),
        required_level: 10, timer_seconds: 60, xp: 45, station: null, mode: 'active', is_active: true,
        flavor_text: 'You work the plunger until the milk gives up and turns.',
    },
    {
        skill: 'Husbandry', for_skill: 'Husbandry', name: 'Press Cheese',
        output_item_name: 'Cheese', output_qty: 1,
        inputs: JSON.stringify([{ itemName: 'Milk', qty: 5 }]),
        required_level: 12, timer_seconds: 120, xp: 95, station: null, mode: 'active', is_active: true,
        flavor_text: 'You break the curd, pack the mould, and lean on the press.',
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

    // Retting: a proper batch, and a yield worth the ten minutes.
    const ret = await knex('recipes').where({ name: 'Ret Flax' }).first();
    if (!ret) throw new Error('husbandry_dairy_and_retting: Ret Flax recipe not found');
    await knex('recipes').where({ id: ret.id }).update({
        inputs: JSON.stringify([{ itemName: 'Flax', qty: 10 }]),
        output_qty: 15,
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', RECIPES.map((r) => r.name)).delete();
    await knex('recipes').where({ name: 'Ret Flax' }).update({
        inputs: JSON.stringify([{ itemName: 'Flax', qty: 3 }]),
        output_qty: 3,
    });
    // Butter and Cheese items are left in place — players may be holding them.
}
