import type { Knex } from 'knex';

// Homestead + Farming, M1 schema (docs/homestead-farming-spec.md).
//   player_properties — a player-owned structure at a location (v1: a 'farmstead'
//                       at Novita). Deliberately thin; storage/stable columns get
//                       added in later milestones. One per player per place.
//   crops             — crop definitions (content). Growth is real-time: a sown
//                       plot's ready_at = planted_at + grow_seconds, checked on
//                       read (the tanning-job pattern, no tick sweep). Perennials
//                       re-grow in place using regrow_seconds.
//   farm_plots        — the fixed plot slots inside a property. soil_state and
//                       tended are unused in M1 but present for M2/M3.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('player_properties', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        t.string('type', 30).notNullable();          // 'farmstead' (later: 'house')
        t.integer('tier').unsigned().notNullable().defaultTo(1);      // Carpentry-driven size, later
        t.integer('plot_slots').unsigned().notNullable().defaultTo(0);
        t.timestamps(true, true);
        t.unique(['player_id', 'location_id', 'type']);
    });

    await knex.schema.createTable('crops', (t) => {
        t.increments('id').primary();
        t.string('name', 60).notNullable().unique();
        t.string('seed_item_name', 60).notNullable();
        t.string('produce_item_name', 60).notNullable();
        t.integer('plant_level').unsigned().notNullable().defaultTo(1);
        t.integer('grow_seconds').unsigned().notNullable();
        t.integer('yield_per_seed').unsigned().notNullable().defaultTo(1);
        t.integer('xp_per_seed').unsigned().notNullable().defaultTo(1);   // PLACEHOLDER — see spec §5, needs sim
        t.string('crop_type', 20).notNullable().defaultTo('vegetable');   // vegetable|grain|fiber|fruit|legume
        t.string('region', 100).nullable();          // island lock: must match the farmstead's location.region
        t.boolean('grows_anywhere').nullable();      // hardy crops ignore the region lock (none for now)
        t.boolean('is_perennial').notNullable().defaultTo(false);
        t.integer('regrow_seconds').unsigned().nullable();               // perennials only
        t.string('soil_effect', 12).notNullable().defaultTo('deplete');  // deplete|restore|neutral (M2)
        t.boolean('is_active').notNullable().defaultTo(true);
        t.timestamps(true, true);
    });

    await knex.schema.createTable('farm_plots', (t) => {
        t.increments('id').primary();
        t.integer('property_id').unsigned().notNullable()
            .references('id').inTable('player_properties').onDelete('CASCADE');
        t.integer('slot_index').unsigned().notNullable();
        t.string('state', 12).notNullable().defaultTo('empty');          // empty|tilled|growing|ready
        t.string('soil_state', 12).notNullable().defaultTo('normal');    // rich|normal|depleted (M2)
        t.integer('crop_id').unsigned().nullable()
            .references('id').inTable('crops').onDelete('SET NULL');
        t.integer('seed_count').unsigned().notNullable().defaultTo(0);
        t.timestamp('planted_at').nullable();
        t.timestamp('ready_at').nullable();
        t.boolean('tended').notNullable().defaultTo(false);              // M3
        t.timestamps(true, true);
        t.unique(['property_id', 'slot_index']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('farm_plots');
    await knex.schema.dropTableIfExists('crops');
    await knex.schema.dropTableIfExists('player_properties');
}
