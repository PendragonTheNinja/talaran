import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('mod_permissions', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.boolean('can_moderate_chat').defaultTo(false);
        table.boolean('can_moderate_forum').defaultTo(false);
        table.boolean('can_view_players').defaultTo(false);
        table.boolean('can_send_messages').defaultTo(false);
        table.boolean('can_ban').defaultTo(false);
        table.timestamps(true, true);
        table.unique(['player_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('mod_permissions');
}