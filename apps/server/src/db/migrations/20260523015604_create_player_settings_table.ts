import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('player_settings', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.text('muted_channels').nullable();
        table.timestamps(true, true);
        table.unique(['player_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('player_settings');
}