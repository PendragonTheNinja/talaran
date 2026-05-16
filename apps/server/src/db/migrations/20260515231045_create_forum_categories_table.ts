import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('forum_categories', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.boolean('staff_only').defaultTo(false);
    table.boolean('admin_post_only').defaultTo(false); // announcements
    table.boolean('auto_lock_days').defaultTo(false); // market
    table.integer('lock_after_days').nullable(); // e.g. 30 for market
    table.boolean('has_voting').defaultTo(false); // feedback
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('forum_categories');
}