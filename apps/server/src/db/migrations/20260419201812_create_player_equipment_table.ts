import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('player_equipment', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable().unique()
      .references('id').inTable('players').onDelete('CASCADE');
    table.integer('head_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('neck_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('back_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('chest_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('mainhand_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('offhand_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('legs_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('hands_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('feet_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('finger_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('mount_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.integer('trophy_item_id').unsigned().nullable()
      .references('id').inTable('items').onDelete('SET NULL');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('player_equipment');
}