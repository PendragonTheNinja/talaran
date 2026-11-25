import type { Knex } from 'knex';

// Shared houses (forum "Sharing Houses", 2026-11-15; Nathan, 2026-11-25: one
// other person). A homestead's owner may name ONE partner, who may then put
// into and take out of that homestead's storage while standing there; nothing
// else of the homestead (fields, pens, building) is theirs. services/propertyPartners.ts.
//
//   property_partners        one row a property at most (unique property_id),
//                            gone with the property or either player.
//   property_storage_ledger  every move into or out of a SHARED store, by
//                            either of the two, so each can see what the other
//                            did. Names are kept as written at the time, as
//                            the guild storehouse's ledger does.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('property_partners'))) {
        await knex.schema.createTable('property_partners', (t) => {
            t.increments('id').primary();
            t.integer('property_id').notNullable().references('id').inTable('player_properties').onDelete('CASCADE');
            t.integer('partner_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.timestamp('named_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.unique(['property_id'], { indexName: 'property_partners_one_per_property' });
            t.index(['partner_id']);
        });
    }
    if (!(await knex.schema.hasTable('property_storage_ledger'))) {
        await knex.schema.createTable('property_storage_ledger', (t) => {
            t.increments('id').primary();
            t.integer('property_id').notNullable().references('id').inTable('player_properties').onDelete('CASCADE');
            t.integer('player_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.string('player_name', 64).notNullable();
            t.integer('item_id').nullable().references('id').inTable('items').onDelete('SET NULL');
            t.integer('delta').notNullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['property_id', 'id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('property_storage_ledger');
    await knex.schema.dropTableIfExists('property_partners');
}
