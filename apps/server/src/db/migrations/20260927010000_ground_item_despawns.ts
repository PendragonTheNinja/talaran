import type { Knex } from 'knex';

// What players leave on the ground: running totals, one row per item, of the
// dropped stacks that reached the end of their week unclaimed
// (services/groundItems.ts). Browse it in the admin panel under World State.
//
// Totals rather than a row per stack, because the question it answers is
// "which items are not worth picking up", and a per-item row answers it at a
// glance where a log of every stack would need adding up.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('ground_item_despawns', (t) => {
        t.increments('id').primary();
        t.integer('item_id').notNullable().unique().references('id').inTable('items').onDelete('CASCADE');
        t.integer('stacks').notNullable().defaultTo(0);
        t.bigInteger('quantity').notNullable().defaultTo(0);
        t.timestamp('first_despawned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('last_despawned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw('ALTER TABLE ground_item_despawns ADD CONSTRAINT ground_item_despawns_counts_nonnegative CHECK (stacks >= 0 AND quantity >= 0)');
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('ground_item_despawns');
}
