import type { Knex } from 'knex';

// A merchant's trade, apart from its key (2026-11-21). The key named the trade
// while every merchant stood in Talador: the smith was 'smith', and what he
// buys was "the smith's domain" (services/marketplace.ts). Antura has its own
// smith in Mettlefell, a second row with the same trade, so the trade is a
// column, filled from the key for every existing merchant. Rows are written
// by seeds/08_merchants.ts.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('merchants', 'trade'))) {
        await knex.schema.alterTable('merchants', (t) => { t.string('trade', 30).nullable(); });
    }
    await knex('merchants').whereNull('trade').update({ trade: knex.ref('key') });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('merchants', 'trade')) {
        await knex.schema.alterTable('merchants', (t) => { t.dropColumn('trade'); });
    }
}
