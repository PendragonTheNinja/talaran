import type { Knex } from 'knex';

// Passive crafting (tanning racks). Mirrors the kiln: a job with a fixed soak,
// collected by the player — no tick sweep. Recipes with mode='passive' are soak
// jobs, not timed actions; their timer_seconds is the soak duration.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('recipes', (t) => {
        t.string('mode', 20).notNullable().defaultTo('active'); // 'active' | 'passive'
    });

    await knex.schema.createTable('tanning_jobs', (table) => {
        table.increments('id').primary();
        table.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        table.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        table.integer('recipe_id').unsigned().notNullable()
            .references('id').inTable('recipes').onDelete('CASCADE');
        table.integer('hide_count').notNullable();
        table.integer('buckskin_yield').notNullable();   // locked in at load, like kiln charc_yield
        table.integer('xp_reward').notNullable();
        table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('ready_at').notNullable();
        table.boolean('is_collected').defaultTo(false);
        table.timestamps(true, true);
        table.index(['player_id', 'location_id', 'is_collected']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('tanning_jobs');
    await knex.schema.alterTable('recipes', (t) => {
        t.dropColumn('mode');
    });
}