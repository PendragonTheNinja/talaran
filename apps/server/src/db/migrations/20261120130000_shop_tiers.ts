import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The tier 2 shop (docs/antura-plan.md §6). Its numbers are code (SHOP_TIERS in
// services/shops.ts); what the player reads while building on is a row.

const ROWS = [
    { action_type: 'farming', kind: 'upgrade_shop', scene_text: 'You build on to your shopfront: new shelves, a deeper back room, and a counter long enough to haggle across.', cancel_label: 'Stop Building' },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    if (!(await knex.schema.hasTable('action_presentation'))) throw new Error('shop_tiers: no action_presentation table');
    for (const name of ['Serph Nails', 'Lanai Planks', 'Granite Block']) {
        if (!(await knex('items').where({ name }).first('id'))) throw new Error(`shop_tiers: item "${name}" not found`);
    }
    for (const r of ROWS) {
        const had = await knex('action_presentation').where({ action_type: r.action_type, kind: r.kind }).first('id');
        if (had) await knex('action_presentation').where({ id: had.id }).update(r);
        else await knex('action_presentation').insert(r);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('action_presentation'))) return;
    for (const r of ROWS) await knex('action_presentation').where({ action_type: r.action_type, kind: r.kind }).delete();
}
