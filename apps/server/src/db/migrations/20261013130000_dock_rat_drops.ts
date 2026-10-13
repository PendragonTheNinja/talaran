import type { Knex } from 'knex';

// The Dock Rat carried nothing (Nathan, 2026-10-13):
//
//   Bones        1 in 5
//   Linen Cloth  1 in 200, a scrap off a bale in the warehouses
//
// Upserted by creature key and item name; down() removes exactly these rows.

const SOURCE = 'combat:dock_rat';
const DROPS: [string, number, number, number][] = [
    ['Bones', 5, 1, 1],
    ['Linen Cloth', 200, 1, 1],
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex('creatures').where({ key: 'dock_rat' }).first())) throw new Error('dock_rat_drops: creature dock_rat not found');
    for (const [name, oneIn, min, max] of DROPS) {
        const item = await knex('items').where({ name }).first();
        if (!item) throw new Error(`dock_rat_drops: item ${name} not found`);
        const row = { source_key: SOURCE, item_id: item.id, chance_one_in: oneIn, min_qty: min, max_qty: max, is_active: true };
        const existing = await knex('drop_table_entries').where({ source_key: SOURCE, item_id: item.id }).first();
        if (existing) await knex('drop_table_entries').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('drop_table_entries').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    const ids = (await knex('items').whereIn('name', DROPS.map(d => d[0])).select('id')).map((r: { id: number }) => r.id);
    if (ids.length) await knex('drop_table_entries').where({ source_key: SOURCE }).whereIn('item_id', ids).delete();
}
