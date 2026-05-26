import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('guild_invites', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('guild_id').unsigned().notNullable()
            .references('id').inTable('guilds').onDelete('CASCADE');
        table.integer('invited_by').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.enum('status', ['pending', 'accepted', 'declined']).defaultTo('pending');
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('guild_invites');
}