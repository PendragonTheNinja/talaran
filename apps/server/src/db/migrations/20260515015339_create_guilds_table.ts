import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('guilds', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('tag', 5).notNullable().unique();
    table.integer('founder_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.integer('leader_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.text('description').nullable();
    table.boolean('open_applications').defaultTo(true);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('guilds');
}