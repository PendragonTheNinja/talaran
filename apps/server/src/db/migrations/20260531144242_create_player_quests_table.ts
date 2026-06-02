import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('player_quests', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('quest_id').unsigned().notNullable()
            .references('id').inTable('quests').onDelete('CASCADE');
        table.enum('status', ['active', 'completed']).defaultTo('active');
        table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('completed_at').nullable();
        table.timestamps(true, true);
        table.unique(['player_id', 'quest_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('player_quests');
}