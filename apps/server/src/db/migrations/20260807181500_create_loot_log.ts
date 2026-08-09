import type { Knex } from 'knex';

// The loot log: what you have gained since you last cleared it.
//
// RUNNING AGGREGATES, NOT AN EVENT LEDGER. A row per drop would mean roughly
// 180 rows an hour per player fishing, and a pruning policy to maintain forever.
// A row per (activity, thing) is bounded by activities x distinct items, which
// is a few dozen per player and never needs tidying. Clearing is one cascading
// delete, and "since you last cleared" is simply what the table holds.
//
// amount is bigInteger deliberately. Reference loot trackers in other games show
// six-figure counts on common drops, and an integer column would be a silent
// ceiling nobody would notice until it wrapped.
//
// VALUE IS NOT HERE YET. Talaran has no currency, so the API reports value as
// null and the panel hides the column. When currency lands this needs no
// migration: the read query joins items.value and the column appears.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('loot_log_sources'))) {
        await knex.schema.createTable('loot_log_sources', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            // Human label, built in services/lootLog.ts: "Fishing at Luxmere".
            // Deliberately a string and not a foreign key, so the labelling can
            // be refined (adding a node name, say) without a migration. The cost
            // is that changing a label splits old rows from new, which is
            // acceptable in a log the player clears at will.
            t.string('source', 120).notNullable();
            t.bigInteger('actions').notNullable().defaultTo(0);
            t.timestamp('first_at').notNullable().defaultTo(knex.fn.now());
            t.timestamp('last_at').notNullable().defaultTo(knex.fn.now());
            t.unique(['player_id', 'source']);
            t.index(['player_id', 'last_at']);
        });
    }

    if (!(await knex.schema.hasTable('loot_log_entries'))) {
        await knex.schema.createTable('loot_log_entries', (t) => {
            t.increments('id').primary();
            t.integer('source_id').unsigned().notNullable()
                .references('id').inTable('loot_log_sources').onDelete('CASCADE');
            t.string('kind', 8).notNullable();        // 'item' | 'xp'
            t.string('name', 80).notNullable();       // item name, or skill name for xp
            t.bigInteger('amount').notNullable().defaultTo(0);
            t.timestamp('first_at').notNullable().defaultTo(knex.fn.now());
            t.timestamp('last_at').notNullable().defaultTo(knex.fn.now());
            t.unique(['source_id', 'kind', 'name']);
            t.index(['source_id']);
        });
    }

    // So the header can say "since 2:14 PM" even when the log is empty, which
    // the earliest first_at cannot do once everything has been cleared.
    if (!(await knex.schema.hasColumn('players', 'loot_reset_at'))) {
        await knex.schema.alterTable('players', (t) => {
            t.timestamp('loot_reset_at').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('loot_log_entries');
    await knex.schema.dropTableIfExists('loot_log_sources');
    if (await knex.schema.hasColumn('players', 'loot_reset_at')) {
        await knex.schema.alterTable('players', (t) => {
            t.dropColumn('loot_reset_at');
        });
    }
}
