import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // ── Drop-table engine ───────────────────────────────────────
    if (!(await knex.schema.hasTable('drop_table_entries'))) {
        await knex.schema.createTable('drop_table_entries', (table) => {
            table.increments('id').primary();
            table.string('source_key', 100).notNullable().index(); // 'woodcutting:lanai', 'container:wooden_chest', etc.
            table.integer('item_id').unsigned().notNullable()
                .references('id').inTable('items').onDelete('CASCADE');
            table.integer('chance_one_in').notNullable().defaultTo(1); // 1 = guaranteed byproduct; N = 1-in-N rare
            table.integer('min_qty').notNullable().defaultTo(1);
            table.integer('max_qty').notNullable().defaultTo(1);
            table.integer('discovery_xp').notNullable().defaultTo(0); // dormant for now; future Exploration override
            table.boolean('is_active').defaultTo(true);
            table.timestamps(true, true);
        });
    }

    // ── Example content: Bird Nest off Lanai trees ────────────
    let nest = await knex('items').where({ name: "Bird's Nest" }).first();
    if (!nest) {
        const [inserted] = await knex('items').insert({
            name: "Bird Nest",
            type: 'collectible',
            subtype: null,
            quality: null,
            tier: 1,
            slot: null,
            level_required: 1,
            description: 'A small nest knocked loose from the branches. Something may be tucked inside.',
            stackable: true,
            is_active: true,
        }).returning('*');
        nest = inserted;
    }

    const exists = await knex('drop_table_entries')
        .where({ source_key: 'woodcutting:lanai', item_id: nest.id }).first();
    if (!exists) {
        await knex('drop_table_entries').insert({
            source_key: 'woodcutting:lanai',
            item_id: nest.id,
            chance_one_in: 25,
            min_qty: 1,
            max_qty: 1,
            discovery_xp: 0,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('drop_table_entries');
    // Bird Nest item is left in place intentionally (harmless).
}