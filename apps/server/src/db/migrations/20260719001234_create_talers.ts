import type { Knex } from 'knex';

// Phase B of Support Us (docs/support-spec.md §5-6): Taler economy tables.
//
// taler_ledger is APPEND-ONLY — a player's balance is SUM(delta). Never
// update or delete ledger rows; corrections are new compensating entries.
// taler_purchases maps Paddle transactions to credits; the unique
// paddle_transaction_id is the idempotency key that makes webhook replays
// harmless.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('taler_purchases', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.string('paddle_transaction_id', 100).notNullable().unique();
        t.integer('usd_cents').notNullable();
        t.integer('talers').notNullable();
        t.string('buyer_country', 8).nullable();
        t.string('status', 30).notNullable().defaultTo('completed');
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.index(['player_id']);
    });

    await knex.schema.createTable('taler_ledger', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.integer('delta').notNullable();            // + credit, − spend
        t.string('reason', 60).notNullable();        // 'purchase', 'unlock', 'admin_grant', ...
        t.string('ref_type', 40).nullable();         // 'taler_purchase', 'player_unlock', ...
        t.integer('ref_id').nullable();
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.index(['player_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('taler_ledger');
    await knex.schema.dropTableIfExists('taler_purchases');
}
