import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The tier 2 homestead (docs/antura-plan.md §6; Nathan, 2026-11-19: "the
// ability to build a Tier 2 Homestead from the get-go"). The tiers, costs, and
// storage are code (HOMESTEAD_TIERS in services/farming.ts), as the shop's
// SHOP_TIERS are; what the player reads while the barn goes up is a row.

const ROWS = [
    { action_type: 'farming', kind: 'upgrade', scene_text: 'You frame a bigger barn onto the farmstead, beam by beam, and roof it over.', cancel_label: 'Stop Building' },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    if (!(await knex.schema.hasTable('action_presentation'))) throw new Error('homestead_tiers: no action_presentation table');
    for (const name of ['Serph Nails', 'Lanai Planks', 'Granite Block']) {
        if (!(await knex('items').where({ name }).first('id'))) throw new Error(`homestead_tiers: item "${name}" not found`);
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
