import type { Knex } from 'knex';

// Bees keep their own hive clean, so an apiary never needs mucking. Placing a
// skep used to start the same 24-hour muck clock as livestock
// (services/husbandry.ts, fixed alongside this), which stamped a muck_due_at on
// every hive. Clear those so the data matches the rule. Nothing reads an
// apiary's muck_due_at any more; this is so it cannot mislead anyone who does.

export async function up(knex: Knex): Promise<void> {
    await knex('player_pens').where({ pen_type: 'apiary' }).whereNotNull('muck_due_at').update({ muck_due_at: null });
}

export async function down(): Promise<void> {
    // Nothing to restore: the stamped deadlines were never meaningful.
}
