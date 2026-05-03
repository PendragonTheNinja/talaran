import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tool_parts', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable()
      .references('id').inTable('players').onDelete('CASCADE');
    table.string('part_type', 50).notNullable(); // head, rod
    table.string('tool_type', 50).notNullable(); // pickaxe, hatchet, etc.
    table.integer('tier').notNullable().defaultTo(1);
    table.integer('item_id').unsigned().notNullable()
      .references('id').inTable('items').onDelete('CASCADE');
    table.integer('max_durability').notNullable();
    table.integer('current_durability').notNullable();
    table.boolean('is_broken').defaultTo(false);
    table.boolean('in_inventory').defaultTo(true); // false when attached to tool
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('tool_parts');
}