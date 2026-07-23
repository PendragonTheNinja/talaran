import type { Knex } from 'knex';

// Two consistency fixes.
//
// 1. Foraging tools become EQUIPMENT, like the hatchet and the hoe — owning one
//    in your pack no longer counts. Knife → mainhand, gloves → hands,
//    basket → offhand, so all three can be worn at once.
// 2. Hunting has never recorded stats (it was the one gather skill calling
//    incrementStats zero times). Give it a counter to fill.

const TOOL_SLOTS: Record<string, string> = {
    'Ambren Foraging Knife': 'mainhand',
    'Buckskin Foraging Gloves': 'hands',
    'Foraging Basket': 'offhand',
};

export async function up(knex: Knex): Promise<void> {
    for (const [name, slot] of Object.entries(TOOL_SLOTS)) {
        await knex('items').where({ name }).update({ slot });
    }

    if (!(await knex.schema.hasColumn('player_stats', 'total_animals_hunted'))) {
        await knex.schema.alterTable('player_stats', (t) => {
            t.bigInteger('total_animals_hunted').defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const name of Object.keys(TOOL_SLOTS)) {
        await knex('items').where({ name }).update({ slot: null });
    }
    if (await knex.schema.hasColumn('player_stats', 'total_animals_hunted')) {
        await knex.schema.alterTable('player_stats', (t) => t.dropColumn('total_animals_hunted'));
    }
}
