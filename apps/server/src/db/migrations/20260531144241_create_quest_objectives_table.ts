import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('quest_objectives', (table) => {
        table.increments('id').primary();
        table.integer('quest_id').unsigned().notNullable()
            .references('id').inTable('quests').onDelete('CASCADE');
        table.integer('order').notNullable().defaultTo(1);
        table.string('description', 255).notNullable();
        table.string('type', 50).notNullable(); // smelt, smith, gather, deliver
        table.string('target_item', 100).nullable(); // item name required
        table.integer('required_amount').notNullable().defaultTo(1);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('quest_objectives');
}