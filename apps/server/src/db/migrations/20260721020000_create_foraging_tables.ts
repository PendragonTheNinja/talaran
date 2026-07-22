import type { Knex } from 'knex';

// Foraging schema (docs/foraging-spec.md).
//   foraging_habitats          — a gatherable patch at a location, with a JSON
//                                drop_table of possible finds (weighted pick one
//                                per cycle). drop_table entries carry an optional
//                                `season` field: absent/null = available all year.
//                                That is the nullable-season SEAM — empty for now.
//   player_foraging_discoveries — which items a player has personally found in a
//                                habitat, powering the "??? until you find it"
//                                tooltip. One row per (player, habitat, item).

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('foraging_habitats', (t) => {
        t.increments('id').primary();
        t.integer('location_id').unsigned().notNullable()
            .references('id').inTable('locations').onDelete('CASCADE');
        t.string('name', 80).notNullable();
        t.string('description', 400).nullable();
        t.integer('required_level').unsigned().notNullable().defaultTo(1);
        t.integer('base_timer').unsigned().notNullable().defaultTo(6);   // seconds at required level
        t.integer('min_timer').unsigned().notNullable().defaultTo(3);    // floor as level climbs
        t.jsonb('drop_table').notNullable();                              // [{ itemName, weight, min, max, xp, requiresGloves?, notable?, season? }]
        t.integer('display_order').unsigned().notNullable().defaultTo(0);
        t.boolean('is_active').notNullable().defaultTo(true);
        t.timestamps(true, true);
        t.unique(['location_id', 'name']);
    });

    await knex.schema.createTable('player_foraging_discoveries', (t) => {
        t.increments('id').primary();
        t.integer('player_id').unsigned().notNullable()
            .references('id').inTable('players').onDelete('CASCADE');
        t.integer('habitat_id').unsigned().notNullable()
            .references('id').inTable('foraging_habitats').onDelete('CASCADE');
        t.string('item_name', 80).notNullable();
        t.timestamp('discovered_at').notNullable().defaultTo(knex.fn.now());
        t.unique(['player_id', 'habitat_id', 'item_name']);
        t.index(['player_id', 'habitat_id']);
    });

    // Stat counter, matching the per-skill convention (total_logs_chopped, etc.).
    const hasCol = await knex.schema.hasColumn('player_stats', 'total_items_foraged');
    if (!hasCol) {
        await knex.schema.alterTable('player_stats', (t) => {
            t.integer('total_items_foraged').notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_stats', 'total_items_foraged')) {
        await knex.schema.alterTable('player_stats', (t) => t.dropColumn('total_items_foraged'));
    }
    await knex.schema.dropTableIfExists('player_foraging_discoveries');
    await knex.schema.dropTableIfExists('foraging_habitats');
}
