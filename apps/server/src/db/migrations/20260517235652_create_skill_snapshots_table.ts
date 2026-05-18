import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('skill_snapshots', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('skill_id').unsigned().notNullable()
            .references('id').inTable('skills').onDelete('CASCADE');
        table.bigInteger('xp_at_snapshot').notNullable().defaultTo(0);
        table.timestamp('snapshot_date').notNullable();
        table.timestamps(true, true);
        table.unique(['player_id', 'skill_id', 'snapshot_date']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('skill_snapshots');
}