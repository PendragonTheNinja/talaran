import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('player_quest_objectives', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('objective_id').unsigned().notNullable()
            .references('id').inTable('quest_objectives').onDelete('CASCADE');
        table.integer('current_amount').notNullable().defaultTo(0);
        table.boolean('is_complete').defaultTo(false);
        table.timestamps(true, true);
        table.unique(['player_id', 'objective_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('player_quest_objectives');
}