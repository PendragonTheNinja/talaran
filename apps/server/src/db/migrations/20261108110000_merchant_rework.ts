import type { Knex } from 'knex';

// The travelling merchant, reworked (Nathan, 2026-11-08; services/travellingMerchant.ts).
// He sold the raw goods of the place he stood in, which anyone there could
// gather for nothing, so nobody bought. Now he carries what is NOT lying about:
// seeds, gems, cooked food and provisions, and worked goods, on a rotating
// cart; now and then a single lit gem at a steep price. No tools. And he buys:
// a few wanted lines at a good price, each player capped per visit.
//
//   world_event_settings
//     merchant_want_lines      how many goods he asks for each visit
//     merchant_want_rate       what he pays, as a share of value (0.9; the
//                              marketplace pays 0.45 and sells at 1.75, so he
//                              is never a way to print gold)
//     merchant_want_share      one player's cap on a wanted line, as a share of
//                              all he wants of it (0.25: four players at least)
//     merchant_lit_gem_chance  percent chance a visit brings one lit gem
//     merchant_lit_gem_markup  its price over his usual (x3)
//   world_event_wants          what one visit asks for: a line per item, price
//                              fixed when he arrives, shared by everyone
//   world_event_want_sales     what each player has sold him, per visit and
//                              line, so the cap holds (race:check 'merchant')

const OLD_ARRIVAL = 'A travelling merchant has pulled his cart into {location}. He carries goods from the country round about, and he will not stay long.';
const NEW_ARRIVAL = 'A travelling merchant has pulled his cart into {location}. He carries goods from all over the island, and he is buying as well as selling. He will not stay long.';

export async function up(knex: Knex): Promise<void> {
    const add = async (column: string, build: (t: Knex.CreateTableBuilder) => void) => {
        if (!(await knex.schema.hasColumn('world_event_settings', column))) {
            await knex.schema.alterTable('world_event_settings', build);
        }
    };
    await add('merchant_want_lines', (t) => { t.integer('merchant_want_lines').notNullable().defaultTo(4); });
    await add('merchant_want_rate', (t) => { t.double('merchant_want_rate').notNullable().defaultTo(0.9); });
    await add('merchant_want_share', (t) => { t.double('merchant_want_share').notNullable().defaultTo(0.25); });
    await add('merchant_lit_gem_chance', (t) => { t.integer('merchant_lit_gem_chance').notNullable().defaultTo(10); });
    await add('merchant_lit_gem_markup', (t) => { t.double('merchant_lit_gem_markup').notNullable().defaultTo(3); });
    await knex.raw('ALTER TABLE world_event_settings DROP CONSTRAINT IF EXISTS world_event_settings_merchant_wants');
    await knex.raw(`ALTER TABLE world_event_settings ADD CONSTRAINT world_event_settings_merchant_wants CHECK (
        merchant_want_lines >= 0 AND merchant_want_rate > 0 AND merchant_want_rate < 1.75
        AND merchant_want_share > 0 AND merchant_want_share <= 1
        AND merchant_lit_gem_chance BETWEEN 0 AND 100 AND merchant_lit_gem_markup >= 1)`);

    if (!(await knex.schema.hasTable('world_event_wants'))) {
        await knex.schema.createTable('world_event_wants', (t) => {
            t.increments('id').primary();
            t.integer('event_id').notNullable().references('id').inTable('world_events').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items').onDelete('CASCADE');
            t.integer('quantity_total').notNullable();
            t.integer('quantity_left').notNullable();
            // Fixed when he arrives, like his own prices.
            t.integer('price').notNullable();
            // How many of this one player may sell him.
            t.integer('player_cap').notNullable();
            t.unique(['event_id', 'item_id']);
        });
        await knex.raw(`ALTER TABLE world_event_wants ADD CONSTRAINT world_event_wants_quantity
            CHECK (quantity_left >= 0 AND quantity_left <= quantity_total AND price > 0 AND player_cap > 0)`);
    }
    if (!(await knex.schema.hasTable('world_event_want_sales'))) {
        await knex.schema.createTable('world_event_want_sales', (t) => {
            t.integer('event_id').notNullable().references('id').inTable('world_events').onDelete('CASCADE');
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items').onDelete('CASCADE');
            t.integer('quantity').notNullable();
            t.primary(['event_id', 'player_id', 'item_id']);
        });
        await knex.raw('ALTER TABLE world_event_want_sales ADD CONSTRAINT world_event_want_sales_positive CHECK (quantity > 0)');
    }

    // The arrival line is content; changed only where nobody has edited it.
    await knex('world_event_settings').where({ merchant_arrival_text: OLD_ARRIVAL }).update({ merchant_arrival_text: NEW_ARRIVAL });
}

export async function down(knex: Knex): Promise<void> {
    await knex('world_event_settings').where({ merchant_arrival_text: NEW_ARRIVAL }).update({ merchant_arrival_text: OLD_ARRIVAL });
    await knex.schema.dropTableIfExists('world_event_want_sales');
    await knex.schema.dropTableIfExists('world_event_wants');
    await knex.raw('ALTER TABLE world_event_settings DROP CONSTRAINT IF EXISTS world_event_settings_merchant_wants');
    for (const c of ['merchant_want_lines', 'merchant_want_rate', 'merchant_want_share', 'merchant_lit_gem_chance', 'merchant_lit_gem_markup']) {
        if (await knex.schema.hasColumn('world_event_settings', c)) {
            await knex.schema.alterTable('world_event_settings', (t) => { t.dropColumn(c); });
        }
    }
}
