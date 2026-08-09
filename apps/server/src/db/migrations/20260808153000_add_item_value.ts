import type { Knex } from 'knex';

// The gold value of an item, in whole gold pieces.
//
// LIKE TIER, VALUE IS DERIVED, NEVER CHOSEN (docs/economy-spec.md). The peg:
// value = the XP of the action that yields the item ÷ 5, which ties every price
// to the xp-rebalance band, so an hour of level-appropriate work creates about
// 440g of value at level 1. Crafted goods are inputs plus labour priced at the
// base band. `npm run values:derive` computes the lot and `--write` fills this
// column; retuning an XP row and re-running retunes the price.
//
// Nullable on purpose: null means "no value yet", and every consumer (NPC shops,
// the loot log's value column) treats null as "do not show a price" rather than
// as zero. Nothing goes on sale by accident.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'value'))) {
        await knex.schema.alterTable('items', (t) => {
            t.integer('value').unsigned().nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('items', 'value')) {
        await knex.schema.alterTable('items', (t) => {
            t.dropColumn('value');
        });
    }
}
