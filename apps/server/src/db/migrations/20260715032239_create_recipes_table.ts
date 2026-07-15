import type { Knex } from 'knex';

// Generic recipe system (docs/trapping-spec.md §4).
// First tenants: Fletch Arrows (Smithing), Tie Snare (Crafting).
// Long-term home for carpentry/smithing recipe constants — content is data.
// Item references are by name, matching the huntable_animals drop_table pattern.

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('recipes', (t) => {
        t.increments('id').primary();
        t.string('skill', 50).notNullable();              // matches skills.name; gates level + receives XP
        t.string('name', 100).notNullable().unique();     // upsert key for data migrations
        t.string('output_item_name', 100).notNullable();
        t.integer('output_qty').unsigned().notNullable().defaultTo(1);
        t.text('inputs').notNullable();                   // JSON: [{ "itemName": "...", "qty": n }]
        t.integer('required_level').unsigned().notNullable().defaultTo(1);
        t.integer('timer_seconds').unsigned().notNullable();
        t.integer('xp').unsigned().notNullable();
        t.string('station', 50).nullable();               // null = camp craft, no station required
        t.boolean('is_active').notNullable().defaultTo(true);
        t.timestamp('created_at').defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('recipes');
}