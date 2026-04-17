import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('player_skills', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.integer('skill_id').unsigned().notNullable()
      .references('id').inTable('skills').onDelete('CASCADE');
    table.bigInteger('xp').defaultTo(0).notNullable();
    table.timestamps(true, true);
    table.unique(['player_id', 'skill_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('player_skills');
}