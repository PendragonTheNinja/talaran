import type { Knex } from 'knex';

// Building a guild hall for hire (docs/antura-plan.md §6b; Nathan, 2026-11-16
// and 17): the boats' hire, at the hall. The guild names hands from outside it
// who may build, pays them by the piece from a purse at the hall, and may lay
// materials there for anyone building it to use.
//
//   guild_halls.pay_rate    gold to a hand for each piece placed (0: unpaid).
//   guild_halls.fund_gold   the wage purse, apart from the storehouse's gold
//                           (`gold`): a hall has a purse before it has a
//                           storehouse. Debited from a member's ledger when
//                           laid, credited to whoever takes it back or is paid.
//   guild_hall_hands        who outside the guild may build on the hall.
//   guild_hall_stock        materials laid at the hall, used before the
//                           builder's own. Purse and stock carry over from
//                           tier to tier, and a hall cannot be pulled down, nor
//                           its guild disbanded, while either holds anything.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('guild_halls', 'pay_rate'))) {
        await knex.schema.alterTable('guild_halls', (t) => {
            t.integer('pay_rate').notNullable().defaultTo(0);
            t.bigInteger('fund_gold').notNullable().defaultTo(0);
        });
        await knex.raw('ALTER TABLE guild_halls ADD CONSTRAINT guild_halls_pay_nonnegative CHECK (pay_rate >= 0 AND fund_gold >= 0)');
    }
    if (!(await knex.schema.hasTable('guild_hall_hands'))) {
        await knex.schema.createTable('guild_hall_hands', (t) => {
            t.integer('hall_id').notNullable().references('id').inTable('guild_halls').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.timestamp('named_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['hall_id', 'player_id']);
            t.index(['player_id']);
        });
    }
    if (!(await knex.schema.hasTable('guild_hall_stock'))) {
        await knex.schema.createTable('guild_hall_stock', (t) => {
            t.integer('hall_id').notNullable().references('id').inTable('guild_halls').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('quantity').notNullable().defaultTo(0);
            t.primary(['hall_id', 'item_id']);
        });
        await knex.raw('ALTER TABLE guild_hall_stock ADD CONSTRAINT guild_hall_stock_nonnegative CHECK (quantity >= 0)');
    }
}

export async function down(knex: Knex): Promise<void> {
    // Gold and goods laid at a hall belong to the guild: never drop them silently.
    if (await knex.schema.hasColumn('guild_halls', 'fund_gold')) {
        const purse = await knex('guild_halls').where('fund_gold', '>', 0).first('id');
        if (purse) throw new Error('hall_hire down: a hall purse still holds gold; return it first');
    }
    if (await knex.schema.hasTable('guild_hall_stock')) {
        const stock = await knex('guild_hall_stock').where('quantity', '>', 0).first('hall_id');
        if (stock) throw new Error('hall_hire down: materials are still laid at a hall; return them first');
    }
    await knex.schema.dropTableIfExists('guild_hall_stock');
    await knex.schema.dropTableIfExists('guild_hall_hands');
    if (await knex.schema.hasColumn('guild_halls', 'pay_rate')) {
        await knex.raw('ALTER TABLE guild_halls DROP CONSTRAINT IF EXISTS guild_halls_pay_nonnegative');
        await knex.schema.alterTable('guild_halls', (t) => {
            t.dropColumn('pay_rate');
            t.dropColumn('fund_gold');
        });
    }
}
