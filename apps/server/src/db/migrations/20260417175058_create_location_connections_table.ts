import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('location_connections', (table) => {
    table.increments('id').primary();
    table.integer('from_location_id').unsigned().notNullable()
      .references('id').inTable('locations').onDelete('CASCADE');
    table.integer('to_location_id').unsigned().notNullable()
      .references('id').inTable('locations').onDelete('CASCADE');
    table.integer('base_travel_time').notNullable(); // in seconds
    table.string('travel_type', 50).notNullable().defaultTo('walking'); // walking, sailing, climbing
    table.string('required_skill', 50).nullable(); // e.g. 'sailing', 'agility'
    table.integer('required_level').nullable();
    table.boolean('is_bidirectional').defaultTo(true); // most paths go both ways
    table.timestamps(true, true);
    table.unique(['from_location_id', 'to_location_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('location_connections');
}