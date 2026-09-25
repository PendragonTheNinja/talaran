import type { Knex } from 'knex';

// Paddle refunds, chargebacks and money records that outlive accounts (audit M5).
//
// 1. taler_purchases gains the transaction's own subtotal and currency. A
//    partial refund arrives as an amount in the buyer's currency; clawing back
//    the right share of Talers means comparing it with what the same
//    transaction cost in the same currency. Purchases recorded before this
//    migration have neither, so a PARTIAL adjustment on one of them is
//    recorded for review rather than guessed at (a full one needs no maths).
//
// 2. taler_adjustments records every refund, credit, chargeback and reversal
//    Paddle reports, keyed on Paddle's adjustment id so a replayed webhook is a
//    no-op, with the signed Taler change it caused.
//
// 3. The money tables stop cascading from players. taler_purchases and
//    taler_ledger were ON DELETE CASCADE, and the hourly guest sweep deletes
//    players, so a payment record could vanish with an account. Now they are
//    RESTRICT: a player who holds money records cannot be deleted by accident.
//    services/guest.ts skips such guests and logs them instead.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('taler_purchases', (t) => {
        t.string('currency_code', 3).nullable();
        t.bigInteger('subtotal_minor').nullable();
    });

    await knex.schema.createTable('taler_adjustments', (t) => {
        t.increments('id').primary();
        t.string('paddle_adjustment_id', 64).notNullable().unique();
        t.integer('purchase_id').notNullable().references('id').inTable('taler_purchases').onDelete('RESTRICT');
        t.integer('player_id').notNullable().references('id').inTable('players').onDelete('RESTRICT');
        t.string('action', 40).notNullable();
        // Signed: negative takes Talers back, positive restores them.
        t.integer('talers').notNullable();
        t.bigInteger('subtotal_minor').nullable();
        t.string('currency_code', 3).nullable();
        // 'applied', or 'needs_review' when the share could not be worked out.
        t.string('outcome', 20).notNullable();
        t.integer('balance_after').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.index('purchase_id');
        t.index('player_id');
    });

    for (const table of ['taler_purchases', 'taler_ledger']) {
        await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', [table, `${table}_player_id_foreign`]);
        await knex.raw(
            'ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE RESTRICT',
            [table, `${table}_player_id_foreign`],
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const table of ['taler_purchases', 'taler_ledger']) {
        await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', [table, `${table}_player_id_foreign`]);
        await knex.raw(
            'ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE',
            [table, `${table}_player_id_foreign`],
        );
    }
    await knex.schema.dropTableIfExists('taler_adjustments');
    await knex.schema.alterTable('taler_purchases', (t) => {
        t.dropColumn('currency_code');
        t.dropColumn('subtotal_minor');
    });
}
