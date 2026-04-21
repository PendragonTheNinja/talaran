import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ore_veins', (table) => {
    table.increments('id').primary();
    table.integer('location_id').unsigned().notNullable()
      .references('id').inTable('locations').onDelete('CASCADE');
    table.integer('ore_item_id').unsigned().notNullable()
      .references('id').inTable('items').onDelete('CASCADE');
    table.integer('total_quantity').notNullable();
    table.integer('remaining_quantity').notNullable();
    table.integer('discovered_by_player_id').unsigned().nullable()
      .references('id').inTable('players').onDelete('SET NULL');
    table.timestamp('discovered_at').nullable();
    table.timestamp('announced_at').nullable(); // null until 5 min after discovery
    table.boolean('is_announced').defaultTo(false);
    table.boolean('is_dense').defaultTo(false);
    table.boolean('is_depleted').defaultTo(false);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('ore_veins');
}