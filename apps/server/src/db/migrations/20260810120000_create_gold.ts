import type { Knex } from 'knex';

// Gold, the earned currency (docs/marketplace-spec.md §2).
//
// Deliberately NOT shaped like Talers. Talers derive balance from SUM(delta)
// over their ledger, which is correct at purchase volume but will not survive
// a currency where every fish sold to a pawnbroker writes a row.
//
//   players.gold  — the authoritative balance. Every read hits one column.
//   gold_ledger   — append-only audit trail. Never read to compute a balance,
//                   only to answer "where did it come from" and to reconcile.
//
// Both are written inside the same transaction, always, with the player row
// locked. balance_after is stored so a support question about a single row
// does not require replaying the whole ledger.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('players', 'gold'))) {
        await knex.schema.alterTable('players', (t) => {
            t.bigInteger('gold').notNullable().defaultTo(0);
        });
    }
    await knex('players').whereNull('gold').update({ gold: 0 });

    if (!(await knex.schema.hasTable('gold_ledger'))) {
        await knex.schema.createTable('gold_ledger', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.bigInteger('delta').notNullable();          // + credit, − spend
            t.bigInteger('balance_after').notNullable();  // running balance at this row
            t.string('reason', 60).notNullable();         // see spec §2.2 for the stable set
            t.string('ref_type', 40).nullable();          // 'shop_listing', 'trade', 'npc', ...
            t.integer('ref_id').nullable();
            t.timestamp('created_at').defaultTo(knex.fn.now());
            t.index(['player_id']);
            t.index(['created_at']);
            t.index(['reason']);                          // the tithe counter sums over this
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('gold_ledger');
    if (await knex.schema.hasColumn('players', 'gold')) {
        await knex.schema.alterTable('players', (t) => t.dropColumn('gold'));
    }
}
