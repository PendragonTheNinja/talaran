import type { Knex } from 'knex';

// Knowing your shop traded, without being pestered about it.
//
// The obvious build is a message per sale, and it is wrong: an inbox that
// accumulates "you sold 3 Ambren Ore" is worse than silence, because the signal
// is buried by the time anyone reads it and deleting forty of them is a chore.
//
// Instead the History tab already holds the answer, and the only missing piece
// is knowing to look. Two timestamps do that:
//
//   last_seen_at      when the owner last opened their History. Everything
//                     after it is "new", which is what the badge counts. A
//                     badge cannot spam: it collapses by nature.
//   last_notified_at  throttles the live line for owners who are online, so a
//                     busy shop says something occasionally rather than once
//                     per sale.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_shops', 'last_seen_at'))) {
        await knex.schema.alterTable('player_shops', (t) => {
            t.timestamp('last_seen_at').nullable();
            t.timestamp('last_notified_at').nullable();
        });
    }

    // Existing shops start caught up rather than showing a badge for trades
    // their owner has already collected the gold from.
    await knex('player_shops').whereNull('last_seen_at').update({ last_seen_at: knex.fn.now() });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_shops', 'last_seen_at')) {
        await knex.schema.alterTable('player_shops', (t) => {
            t.dropColumn('last_seen_at');
            t.dropColumn('last_notified_at');
        });
    }
}
