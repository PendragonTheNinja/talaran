import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('player_stats', (table) => {
    table.increments('id').primary();
    table.integer('player_id').unsigned().notNullable().unique()
      .references('id').inTable('players').onDelete('CASCADE');

    // Woodcutting
    table.bigInteger('total_logs_chopped').defaultTo(0);
    table.bigInteger('poor_logs_chopped').defaultTo(0);
    table.bigInteger('fine_logs_chopped').defaultTo(0);
    table.bigInteger('excellent_logs_chopped').defaultTo(0);
    table.bigInteger('lanai_logs_chopped').defaultTo(0);
    table.bigInteger('hatch_logs_chopped').defaultTo(0);
    table.bigInteger('bearn_logs_chopped').defaultTo(0);
    table.bigInteger('mirrith_logs_chopped').defaultTo(0);
    table.bigInteger('craxial_logs_chopped').defaultTo(0);

    // Mining
    table.bigInteger('total_rocks_mined').defaultTo(0);
    table.bigInteger('total_ores_mined').defaultTo(0);
    table.bigInteger('total_dense_ores_mined').defaultTo(0);
    table.bigInteger('veins_discovered').defaultTo(0);
    table.bigInteger('ambren_ore_mined').defaultTo(0);
    table.bigInteger('burgh_ore_mined').defaultTo(0);
    table.bigInteger('serph_ore_mined').defaultTo(0);

    // Travel
    table.bigInteger('total_locations_visited').defaultTo(0);
    table.bigInteger('total_distance_traveled').defaultTo(0);

    // General
    table.bigInteger('total_actions_completed').defaultTo(0);
    table.bigInteger('total_xp_earned').defaultTo(0);
    table.bigInteger('bot_checks_passed').defaultTo(0);

    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('player_stats');
}