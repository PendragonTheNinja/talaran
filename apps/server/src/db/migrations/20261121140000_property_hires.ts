import type { Knex } from 'knex';

// Hiring a carpenter for a homestead or a shop (docs/antura-plan.md §6b;
// Nathan, 2026-11-17 and 21).
//
// The owner names a carpenter at the place (the island's homestead ground or
// port), says what is to be built (a tier raised outright, or the next tier
// on what stands), and lays the fee there. The carpenter runs the same single
// build action the owner would; when it finishes, one transaction raises the
// property for the owner, takes the materials (what the owner laid at the
// place first, then the carpenter's own), pays the carpenter the fee, and
// returns anything left over. Nothing is paid if it does not finish.
//
//   property_hires        one open hire per owner, kind, and place.
//     fee_gold            laid by the owner (their ledger debited), paid to
//                         the carpenter at the finish or returned on a
//                         cancel, so the ledger sums to every player's gold.
//     carpenter_id        nulled if the carpenter's account goes, so the
//                         owner can still call the work off and get it back.
//   property_hire_stock   materials the owner laid for the carpenter to use.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('property_hires'))) {
        await knex.schema.createTable('property_hires', (t) => {
            t.increments('id').primary();
            t.integer('owner_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('carpenter_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.string('kind', 16).notNullable();
            t.string('work', 16).notNullable();
            t.integer('tier').notNullable();
            t.integer('location_id').notNullable().references('id').inTable('locations');
            t.bigInteger('fee_gold').notNullable().defaultTo(0);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.unique(['owner_id', 'kind', 'location_id']);
            t.index(['carpenter_id']);
        });
        await knex.raw(`ALTER TABLE property_hires ADD CONSTRAINT property_hires_valid CHECK (
            kind IN ('farmstead', 'shop') AND work IN ('establish', 'upgrade') AND tier >= 1 AND fee_gold >= 0)`);
    }
    if (!(await knex.schema.hasTable('property_hire_stock'))) {
        await knex.schema.createTable('property_hire_stock', (t) => {
            t.integer('hire_id').notNullable().references('id').inTable('property_hires').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.integer('quantity').notNullable().defaultTo(0);
            t.primary(['hire_id', 'item_id']);
        });
        await knex.raw('ALTER TABLE property_hire_stock ADD CONSTRAINT property_hire_stock_nonnegative CHECK (quantity >= 0)');
    }
}

export async function down(knex: Knex): Promise<void> {
    // Gold and goods laid for a hire belong to players: never drop them silently.
    if (await knex.schema.hasTable('property_hires')) {
        const fee = await knex('property_hires').where('fee_gold', '>', 0).first('id');
        if (fee) throw new Error('property_hires down: a hire still holds a fee; return it to its owner first');
    }
    if (await knex.schema.hasTable('property_hire_stock')) {
        const stock = await knex('property_hire_stock').where('quantity', '>', 0).first('hire_id');
        if (stock) throw new Error('property_hires down: materials are still laid for a hire; return them first');
    }
    await knex.schema.dropTableIfExists('property_hire_stock');
    await knex.schema.dropTableIfExists('property_hires');
}
