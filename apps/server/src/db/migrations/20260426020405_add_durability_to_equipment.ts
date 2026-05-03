import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('player_equipment', (table) => {
    table.integer('mainhand_tool_instance_id').unsigned().nullable()
      .references('id').inTable('tool_instances').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('player_equipment', (table) => {
    table.dropColumn('mainhand_tool_instance_id');
  });
}