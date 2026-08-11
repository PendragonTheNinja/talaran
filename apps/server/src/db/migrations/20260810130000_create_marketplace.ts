import type { Knex } from 'knex';

// Taiar Marketplace (docs/marketplace-spec.md §3).
//
// Merchants are rows, not code, so their names and flavour are editable from
// the admin content browser without a deploy. What they BUY is derived from
// item type/subtype in services/marketplace.ts; only the identity lives here.
//
// The two daily tables are per player. There is deliberately no global stock
// pool: a shared pool would hand the good rates to whichever timezone wakes
// first and leave everyone else scraps.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('merchants'))) {
        await knex.schema.createTable('merchants', (t) => {
            t.increments('id').primary();
            t.string('key', 40).notNullable().unique();   // 'smith', 'pawnbroker', ...
            t.string('name', 80).notNullable();
            t.string('title', 80).nullable();             // "Smith of Talador"
            t.text('greeting').nullable();
            t.integer('location_id').unsigned().notNullable()
                .references('id').inTable('locations').onDelete('CASCADE');
            t.decimal('buy_rate', 4, 3).notNullable().defaultTo(0.45);
            t.boolean('buys_anything').notNullable().defaultTo(false); // pawnbroker
            t.boolean('sells').notNullable().defaultTo(true);
            t.integer('display_order').notNullable().defaultTo(0);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
            t.index(['location_id']);
        });
    }

    // What a merchant offers. Core rows are always in stock; rotating rows are
    // candidates the daily seeded roll draws from.
    if (!(await knex.schema.hasTable('merchant_stock'))) {
        await knex.schema.createTable('merchant_stock', (t) => {
            t.increments('id').primary();
            t.integer('merchant_id').unsigned().notNullable()
                .references('id').inTable('merchants').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            t.boolean('is_core').notNullable().defaultTo(false);
            t.integer('min_qty').notNullable().defaultTo(3);
            t.integer('max_qty').notNullable().defaultTo(7);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.unique(['merchant_id', 'item_id']);
            t.index(['merchant_id']);
        });
    }

    // Units of one item a player has SOLD to NPCs today. Drives the step-down.
    // Keyed on the player and item only, not the merchant: selling ore to the
    // smith and then the pawnbroker must not reset the allowance.
    if (!(await knex.schema.hasTable('npc_sale_daily'))) {
        await knex.schema.createTable('npc_sale_daily', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            t.string('sale_date', 10).notNullable();   // Eastern 'YYYY-MM-DD'
            t.integer('units_sold').notNullable().defaultTo(0);
            t.unique(['player_id', 'item_id', 'sale_date']);
            t.index(['sale_date']);
        });
    }

    // Units of one item a player has BOUGHT from NPCs today, against that day's
    // rolled stock.
    if (!(await knex.schema.hasTable('npc_purchase_daily'))) {
        await knex.schema.createTable('npc_purchase_daily', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            t.string('purchase_date', 10).notNullable();
            t.integer('units_bought').notNullable().defaultTo(0);
            t.unique(['player_id', 'item_id', 'purchase_date']);
            t.index(['purchase_date']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('npc_purchase_daily');
    await knex.schema.dropTableIfExists('npc_sale_daily');
    await knex.schema.dropTableIfExists('merchant_stock');
    await knex.schema.dropTableIfExists('merchants');
}
