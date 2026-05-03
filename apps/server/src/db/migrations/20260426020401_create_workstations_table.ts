import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workstations', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.integer('location_id').unsigned().notNullable()
      .references('id').inTable('locations').onDelete('CASCADE');
    table.string('type', 50).notNullable(); // smithing, cooking, crafting, etc.
    table.integer('tier').notNullable().defaultTo(1); // anvil tier
    table.boolean('has_anvil').defaultTo(false);
    table.boolean('has_hammer').defaultTo(false);
    table.boolean('has_tongs').defaultTo(false);
    table.boolean('has_bucket').defaultTo(false);
    table.boolean('is_active').defaultTo(false); // true when all required tools present
    table.timestamps(true, true);
    table.unique(['player_id', 'location_id', 'type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('workstations');
}