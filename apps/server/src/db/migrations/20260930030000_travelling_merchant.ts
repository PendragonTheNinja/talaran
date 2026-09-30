import type { Knex } from 'knex';

// The Travelling Merchant (docs/WORLD-EVENTS-AND-MUSEUMS.md, step 3).
//
// A visit is a world_events row of kind 'merchant': where he is, until when,
// and how it ended, with the same countdown, admin controls and history as a
// skill event. Its pool is his goods: pool_total is every unit he brought and
// pool_left what is unsold, so "paid out" in the history reads as units sold.
//
//   world_event_settings  gains the merchant's dials: on or off, when he is
//                         next due, how often he comes, how long he stays, how
//                         much he carries, and his arrival line.
//   world_event_stock     what one visit carries: a line per item, with its
//                         price fixed when he arrives. Shared by the whole
//                         server; bought with a conditional decrement.
//   merchant_extra_goods  the extras list: items that can turn up in his stock
//                         wherever he is, on top of what the place yields.

const ARRIVAL = 'A travelling merchant has pulled his cart into {location}. He carries goods from the country round about, and he will not stay long.';

export async function up(knex: Knex): Promise<void> {
    const add = async (column: string, build: (t: Knex.CreateTableBuilder) => void) => {
        if (!await knex.schema.hasColumn('world_event_settings', column)) {
            await knex.schema.alterTable('world_event_settings', build);
        }
    };
    await add('merchant_enabled', (t) => { t.boolean('merchant_enabled').notNullable().defaultTo(true); });
    // Null means "work it out": the scheduler sets it a random time within
    // the next interval, so his first visit is no more predictable than the rest.
    await add('merchant_next_at', (t) => { t.timestamp('merchant_next_at', { useTz: true }).nullable(); });
    await add('merchant_every_days', (t) => { t.integer('merchant_every_days').notNullable().defaultTo(7); });
    await add('merchant_stay_minutes', (t) => { t.integer('merchant_stay_minutes').notNullable().defaultTo(24 * 60); });
    // How much he carries: this many lines, each about this much gold of value.
    await add('merchant_lines', (t) => { t.integer('merchant_lines').notNullable().defaultTo(8); });
    await add('merchant_line_gold', (t) => { t.integer('merchant_line_gold').notNullable().defaultTo(300); });
    await add('merchant_arrival_text', (t) => { t.text('merchant_arrival_text').notNullable().defaultTo(ARRIVAL); });

    await knex.raw('ALTER TABLE world_event_settings DROP CONSTRAINT IF EXISTS world_event_settings_merchant');
    await knex.raw(`ALTER TABLE world_event_settings ADD CONSTRAINT world_event_settings_merchant CHECK (
        merchant_every_days > 0 AND merchant_stay_minutes > 0 AND merchant_lines > 0 AND merchant_line_gold > 0)`);

    if (!await knex.schema.hasTable('world_event_stock')) {
        await knex.schema.createTable('world_event_stock', (t) => {
            t.increments('id').primary();
            t.integer('event_id').notNullable().references('id').inTable('world_events').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items').onDelete('CASCADE');
            t.integer('quantity_total').notNullable();
            t.integer('quantity_left').notNullable();
            // Fixed when he arrives, so a value change mid-visit never moves a price a player is looking at.
            t.integer('price').notNullable();
            t.unique(['event_id', 'item_id']);
        });
        await knex.raw(`ALTER TABLE world_event_stock ADD CONSTRAINT world_event_stock_quantity
            CHECK (quantity_left >= 0 AND quantity_left <= quantity_total AND price > 0)`);
    }

    if (!await knex.schema.hasTable('merchant_extra_goods')) {
        await knex.schema.createTable('merchant_extra_goods', (t) => {
            t.increments('id').primary();
            t.integer('item_id').notNullable().unique().references('id').inTable('items').onDelete('CASCADE');
            // The chance, per visit, that it is in his cart at all.
            t.integer('chance_percent').notNullable().defaultTo(50);
            t.integer('min_qty').notNullable().defaultTo(1);
            t.integer('max_qty').notNullable().defaultTo(1);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
        await knex.raw(`ALTER TABLE merchant_extra_goods ADD CONSTRAINT merchant_extra_goods_ranges
            CHECK (chance_percent BETWEEN 1 AND 100 AND min_qty > 0 AND max_qty >= min_qty)`);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('merchant_extra_goods');
    await knex.schema.dropTableIfExists('world_event_stock');
    // Visits are world_events rows of a kind nothing will read after this.
    await knex('world_events').where({ kind: 'merchant' }).delete();
    await knex.raw('ALTER TABLE world_event_settings DROP CONSTRAINT IF EXISTS world_event_settings_merchant');
    for (const column of [
        'merchant_enabled', 'merchant_next_at', 'merchant_every_days', 'merchant_stay_minutes',
        'merchant_lines', 'merchant_line_gold', 'merchant_arrival_text',
    ]) {
        if (await knex.schema.hasColumn('world_event_settings', column)) {
            await knex.schema.alterTable('world_event_settings', (t) => { t.dropColumn(column); });
        }
    }
}
