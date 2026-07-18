import type { Knex } from 'knex';

// Audit log for admin content edits (Layer 2 of the content tooling).
// Every write through /api/admin/content lands a row here, inside the same
// transaction as the change itself. reverts_change_id links a revert back to
// the change it undid — reverts are themselves logged changes.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('content_changes', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.string('table_name', 100).notNullable();
        t.integer('row_id').notNullable();
        t.string('column_name', 100).notNullable();
        t.text('old_value').nullable();
        t.text('new_value').nullable();
        t.integer('reverts_change_id').unsigned().nullable()
            .references('id').inTable('content_changes').onDelete('SET NULL');
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.index(['table_name', 'row_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('content_changes');
}