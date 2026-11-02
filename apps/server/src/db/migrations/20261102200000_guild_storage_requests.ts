import type { Knex } from 'knex';

// Requests from the guild storehouse (services/guildHall.ts; Nathan,
// 2026-11-02). A member whose rank cannot take from the storehouse asks for
// an amount; someone allowed to approve (approve_requests, Officers by
// default) says yes or no; the member collects at the hall.
//
//   guild_storage_requests   status: pending -> approved -> collected, or
//                            denied, or cancelled. On approval the items are
//                            SET ASIDE: taken off the shelves into the request
//                            (still counted against the storehouse's room), so
//                            they are never in two places and never promised
//                            twice. Calling off an approved request puts them
//                            back. player_name and decided_by_name are kept as
//                            written, like the ledger's.
//   guild_storage_ledger.approved_by_name   on a collection, who approved it.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('guild_storage_requests'))) {
        await knex.schema.createTable('guild_storage_requests', t => {
            t.increments('id').primary();
            t.integer('hall_id').notNullable().references('id').inTable('guild_halls').onDelete('CASCADE');
            t.integer('player_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.string('player_name', 100).notNullable();
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('quantity').notNullable();
            t.string('status', 20).notNullable().defaultTo('pending');
            t.integer('decided_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.string('decided_by_name', 100).nullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('decided_at', { useTz: true }).nullable();
            t.timestamp('closed_at', { useTz: true }).nullable();
            t.index(['hall_id', 'status']);
        });
        await knex.raw(`ALTER TABLE guild_storage_requests ADD CONSTRAINT guild_storage_requests_valid
            CHECK (quantity > 0 AND status IN ('pending', 'approved', 'collected', 'denied', 'cancelled'))`);
    }
    if (!(await knex.schema.hasColumn('guild_storage_ledger', 'approved_by_name'))) {
        await knex.schema.alterTable('guild_storage_ledger', t => { t.string('approved_by_name', 100).nullable(); });
    }
}

export async function down(knex: Knex): Promise<void> {
    // Items set aside on an approval live only in their request row: refuse
    // rather than destroy them.
    if (await knex.schema.hasTable('guild_storage_requests')) {
        const held = await knex('guild_storage_requests').where({ status: 'approved' }).first('id');
        if (held) throw new Error('guild_storage_requests: approved requests still hold items; collect or cancel them first.');
        await knex.schema.dropTable('guild_storage_requests');
    }
    if (await knex.schema.hasColumn('guild_storage_ledger', 'approved_by_name')) {
        await knex.schema.alterTable('guild_storage_ledger', t => { t.dropColumn('approved_by_name'); });
    }
}
