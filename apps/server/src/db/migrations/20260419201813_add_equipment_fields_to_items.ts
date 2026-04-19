import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    table.string('slot', 50).nullable(); // head, neck, back, chest, mainhand, offhand, legs, hands, feet, finger, mount, trophy
    table.integer('level_required').defaultTo(1).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (table) => {
    table.dropColumn('slot');
    table.dropColumn('level_required');
  });
}