import type { Knex } from 'knex';

// Building a boat for hire (docs/antura-plan.md §6b; Nathan, 2026-11-16 and 17).
//
// The hull on the slip is the build site. Its owner founds it (no Carpentry
// needed to lay a keel now), names the hands who may work on it, and can lay
// at the slip both materials for them to use and gold to pay them by the
// piece. Every build turn pays the hand who placed the pieces at once, from
// that purse, inside the turn's transaction: no lump at the end, so neither
// side can be cheated by the other walking away.
//
//   vessel_builds.pay_rate     gold to the hand for each piece placed (0: unpaid,
//                              a friend's help).
//   vessel_builds.fund_gold    the purse: gold the owner has laid at the slip.
//                              The owner's ledger is debited when it is laid and
//                              credited when it comes back; a hand's when paid,
//                              so the ledger still sums to every player's gold.
//   vessel_build_hands         who besides the owner may build on the hull.
//   vessel_build_stock         materials laid at the slip, used before the
//                              builder's own, and the owner's to take back
//                              until they are built in.
//
// A finished boat returns what is left of both to the owner.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('vessel_builds', 'pay_rate'))) {
        await knex.schema.alterTable('vessel_builds', (t) => {
            t.integer('pay_rate').notNullable().defaultTo(0);
            t.bigInteger('fund_gold').notNullable().defaultTo(0);
        });
        await knex.raw('ALTER TABLE vessel_builds ADD CONSTRAINT vessel_builds_pay_nonnegative CHECK (pay_rate >= 0 AND fund_gold >= 0)');
    }
    if (!(await knex.schema.hasTable('vessel_build_hands'))) {
        await knex.schema.createTable('vessel_build_hands', (t) => {
            t.integer('build_id').notNullable().references('id').inTable('vessel_builds').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.timestamp('named_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['build_id', 'player_id']);
            t.index(['player_id']);
        });
    }
    if (!(await knex.schema.hasTable('vessel_build_stock'))) {
        await knex.schema.createTable('vessel_build_stock', (t) => {
            t.integer('build_id').notNullable().references('id').inTable('vessel_builds').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('quantity').notNullable().defaultTo(0);
            t.primary(['build_id', 'item_id']);
        });
        await knex.raw('ALTER TABLE vessel_build_stock ADD CONSTRAINT vessel_build_stock_nonnegative CHECK (quantity >= 0)');
    }
}

export async function down(knex: Knex): Promise<void> {
    // Gold and goods laid at a slip belong to players: never drop them silently.
    if (await knex.schema.hasColumn('vessel_builds', 'fund_gold')) {
        const purse = await knex('vessel_builds').where('fund_gold', '>', 0).first('id');
        if (purse) throw new Error('boat_hire down: a slip still holds gold; return it to its owner first');
    }
    if (await knex.schema.hasTable('vessel_build_stock')) {
        const stock = await knex('vessel_build_stock').where('quantity', '>', 0).first('build_id');
        if (stock) throw new Error('boat_hire down: a slip still holds materials; return them to their owner first');
    }
    await knex.schema.dropTableIfExists('vessel_build_stock');
    await knex.schema.dropTableIfExists('vessel_build_hands');
    if (await knex.schema.hasColumn('vessel_builds', 'pay_rate')) {
        await knex.raw('ALTER TABLE vessel_builds DROP CONSTRAINT IF EXISTS vessel_builds_pay_nonnegative');
        await knex.schema.alterTable('vessel_builds', (t) => { t.dropColumn('pay_rate'); t.dropColumn('fund_gold'); });
    }
}
