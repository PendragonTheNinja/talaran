import type { Knex } from 'knex';

// Trapping system tables (docs/trapping-spec.md §5).
// trap_types: trap definitions (future box trap = a row, not a rewrite)
// trap_targets: per-location weighted catch pools
// player_traps: live placed traps; independent of player_actions by design

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('trap_types', (t) => {
        t.increments('id').primary();
        t.string('name', 100).notNullable().unique();
        t.string('item_name', 100).notNullable();          // inventory item consumed on placement
        t.integer('required_level').unsigned().notNullable(); // Hunting level to place
        t.integer('roll_interval_seconds').unsigned().notNullable();
        t.integer('catch_chance').unsigned().notNullable();    // % per roll
        t.integer('break_chance').unsigned().notNullable();    // % per collected catch
        t.integer('scavenger_safe_hours').unsigned().notNullable();
        t.integer('scavenger_hourly_chance').unsigned().notNullable(); // % per hour past safe window
        t.boolean('is_active').notNullable().defaultTo(true);
    });

    await knex.schema.createTable('trap_targets', (t) => {
        t.increments('id').primary();
        t.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        t.integer('trap_type_id').unsigned().nullable()
            .references('id').inTable('trap_types').onDelete('CASCADE'); // null = any trap type
        t.string('name', 100).notNullable();               // 'Rabbit', 'Pheasant', 'Squonk'
        t.integer('weight').unsigned().notNullable();      // relative integer; Eld Grove ships 640/355/5 (Squonk = 0.5%)
        t.integer('xp').unsigned().notNullable();
        t.text('drop_table').notNullable();                // JSON: [{ itemName, min, max, chance, notable?, perishable? }]
        t.boolean('is_active').notNullable().defaultTo(true);
    });

    await knex.schema.createTable('player_traps', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.integer('trap_type_id').unsigned().notNullable()
            .references('id').inTable('trap_types').onDelete('CASCADE');
        t.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        t.integer('bait_item_id').unsigned().nullable()
            .references('id').inTable('items').onDelete('SET NULL');  // schema now, bait items later
        t.string('state', 20).notNullable().defaultTo('set');       // 'set' | 'sprung'
        t.integer('caught_target_id').unsigned().nullable()
            .references('id').inTable('trap_targets').onDelete('SET NULL'); // never sent to client until collect
        t.timestamp('caught_at').nullable();
        t.timestamp('next_roll_at').notNullable();
        t.timestamp('last_scavenge_check').nullable();
        t.timestamp('placed_at').notNullable().defaultTo(knex.fn.now());
        t.index(['state', 'next_roll_at']);   // the tick sweep's query
        t.index(['player_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_traps');
    await knex.schema.dropTableIfExists('trap_targets');
    await knex.schema.dropTableIfExists('trap_types');
}