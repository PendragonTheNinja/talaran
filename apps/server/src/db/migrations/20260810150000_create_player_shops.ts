import type { Knex } from 'knex';

// Player Shops (docs/marketplace-spec.md §4).
//
// A shop is a player_properties row with type='shop', which gets storage for
// free: the unique constraint (player_id, location_id, type) already allows a
// shop and a farmstead to coexist, and property_storage needs no changes.
//
// This migration adds only the COMMERCE layer on top of that:
//
//   player_shops        the shopfront: name, description, slot counts, and the
//                       two separate gold stores (till and buy fund).
//   shop_listings       things for sale. Items MOVE here out of storage, so
//                       goods on the shelf are not also in the back room.
//   shop_buy_orders     standing offers to buy, backed by reserved gold.
//   shop_transactions   append-only history. Readable in admin, never edited.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('player_shops'))) {
        await knex.schema.createTable('player_shops', (t) => {
            t.increments('id').primary();
            t.integer('property_id').unsigned().notNullable().unique()
                .references('id').inTable('player_properties').onDelete('CASCADE');
            t.string('name', 60).notNullable();
            t.text('description').nullable();

            // Per-tier numbers live on the shop, not in code, so raising a tier
            // is data rather than a deploy.
            t.integer('sell_slots').unsigned().notNullable().defaultTo(12);
            t.integer('buy_slots').unsigned().notNullable().defaultTo(6);

            // Two stores that never mix. till is takings; buy_fund backs the
            // standing buy orders, including the part currently reserved.
            t.bigInteger('till_gold').notNullable().defaultTo(0);
            t.bigInteger('buy_fund_gold').notNullable().defaultTo(0);

            t.boolean('is_open').notNullable().defaultTo(true);
            t.timestamps(true, true);
        });
    }

    if (!(await knex.schema.hasTable('shop_listings'))) {
        await knex.schema.createTable('shop_listings', (t) => {
            t.increments('id').primary();
            t.integer('shop_id').unsigned().notNullable()
                .references('id').inTable('player_shops').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            t.bigInteger('quantity').notNullable().defaultTo(0);
            t.integer('unit_price').unsigned().notNullable();
            t.timestamps(true, true);
            // One listing per item: two rows for the same item at different
            // prices would just be an order book, and nobody would ever buy the
            // dearer one.
            t.unique(['shop_id', 'item_id']);
            t.index(['item_id']);
        });
    }

    if (!(await knex.schema.hasTable('shop_buy_orders'))) {
        await knex.schema.createTable('shop_buy_orders', (t) => {
            t.increments('id').primary();
            t.integer('shop_id').unsigned().notNullable()
                .references('id').inTable('player_shops').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            t.bigInteger('quantity_wanted').notNullable();
            t.bigInteger('quantity_filled').notNullable().defaultTo(0);
            t.integer('unit_price').unsigned().notNullable();
            t.timestamps(true, true);
            t.unique(['shop_id', 'item_id']);
            t.index(['item_id']);
        });
    }

    if (!(await knex.schema.hasTable('shop_transactions'))) {
        await knex.schema.createTable('shop_transactions', (t) => {
            t.increments('id').primary();
            t.integer('shop_id').unsigned().notNullable()
                .references('id').inTable('player_shops').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            // 'sale'     the shop sold goods to a visitor
            // 'purchase' the shop bought goods from a visitor via a buy order
            t.string('direction', 10).notNullable();
            t.bigInteger('quantity').notNullable();
            t.integer('unit_price').unsigned().notNullable();
            t.bigInteger('gross').notNullable();
            t.bigInteger('tax').notNullable().defaultTo(0);
            t.integer('counterparty_player_id').unsigned().nullable()
                .references('id').inTable('players').onDelete('SET NULL');
            t.timestamp('created_at').defaultTo(knex.fn.now());
            t.index(['shop_id', 'created_at']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('shop_transactions');
    await knex.schema.dropTableIfExists('shop_buy_orders');
    await knex.schema.dropTableIfExists('shop_listings');
    await knex.schema.dropTableIfExists('player_shops');
}
