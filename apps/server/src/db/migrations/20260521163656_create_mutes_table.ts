import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('mutes', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('issued_by').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.string('type', 20).notNullable(); // chat, forum, account
        table.string('reason', 500).nullable();
        table.timestamp('expires_at').nullable(); // null = permanent
        table.boolean('is_active').defaultTo(true);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('mutes');
}