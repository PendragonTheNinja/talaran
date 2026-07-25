import type { Knex } from 'knex';

// Property storage. A property (farmstead now, house at Talador later) holds items
// in a fixed number of SLOTS, where one slot = one unique item stack of any size.
// Stores are per-property and deliberately not shared — what you keep at the farm
// stays at the farm.
//
// storage_slots lives on the property so a later Carpentry-driven tier upgrade just
// raises the number.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_properties', 'storage_slots'))) {
        await knex.schema.alterTable('player_properties', (t) => {
            t.integer('storage_slots').unsigned().notNullable().defaultTo(50);
        });
    }
    await knex('player_properties').whereNull('storage_slots').update({ storage_slots: 50 });

    if (!(await knex.schema.hasTable('property_storage'))) {
        await knex.schema.createTable('property_storage', (t) => {
            t.increments('id').primary();
            t.integer('property_id').unsigned().notNullable()
                .references('id').inTable('player_properties').onDelete('CASCADE');
            t.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            t.bigInteger('quantity').notNullable().defaultTo(0);
            t.timestamps(true, true);
            t.unique(['property_id', 'item_id']);
            t.index(['property_id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('property_storage');
    if (await knex.schema.hasColumn('player_properties', 'storage_slots')) {
        await knex.schema.alterTable('player_properties', (t) => t.dropColumn('storage_slots'));
    }
}
