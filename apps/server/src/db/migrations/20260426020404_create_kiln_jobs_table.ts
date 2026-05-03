import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('kiln_jobs', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.integer('location_id').unsigned().notNullable()
      .references('id').inTable('locations').onDelete('CASCADE');
    table.integer('logs_added').notNullable(); // how many logs put in
    table.integer('charc_yield').notNullable(); // how much charc will be produced
    table.integer('xp_reward').notNullable();
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('ready_at').notNullable(); // when charc is ready to collect
    table.boolean('is_collected').defaultTo(false);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('kiln_jobs');
}