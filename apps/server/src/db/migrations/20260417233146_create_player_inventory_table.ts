import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('player_inventory', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.integer('item_id').unsigned().notNullable()
      .references('id').inTable('items').onDelete('CASCADE');
    table.integer('quantity').notNullable().defaultTo(1);
    table.timestamps(true, true);
    table.unique(['player_id', 'item_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('player_inventory');
}