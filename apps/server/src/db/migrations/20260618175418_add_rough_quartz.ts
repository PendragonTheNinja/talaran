import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    let gem = await knex('items').where({ name: 'Rough Quartz' }).first();
    if (!gem) {
        const [ins] = await knex('items').insert({
            name: 'Rough Quartz',
            type: 'gem',
            subtype: 'quartz',
            quality: 'rough',
            tier: 1,
            slot: null,
            level_required: 1,
            description: 'An uncut chunk of quartz, dug from the rock. A jeweler could cut and polish it.',
            stackable: true,
            is_active: true,
        }).returning('*');
        gem = ins;
    }

    const exists = await knex('drop_table_entries')
        .where({ source_key: 'mining:rock:granite', item_id: gem.id }).first();
    if (!exists) {
        await knex('drop_table_entries').insert({
            source_key: 'mining:rock:granite',
            item_id: gem.id,
            chance_one_in: 50,
            chance_percent: null,
            min_qty: 1,
            max_qty: 1,
            discovery_xp: 0,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('drop_table_entries').where({ source_key: 'mining:rock:granite' }).del();
    // Rough Quartz item left in place (harmless).
}