import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Every piece of the sailor's set is worn from level 1 (Nathan, 2026-11-23):
// reaching an island's chests is the gate, not a level. Antura's three were
// set at Wayfaring 13 by 20261123100000_antura_islets.

const ANTURA_PIECES = ['Oilskin Smock', 'Canvas Slops', 'Boat Cloak'];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const set = await knex('items').where({ subtype: 'sailors_set' }).update({ level_required: 1 });
    if (set < 1) throw new Error("sailor_set_level_one: no sailor's set pieces found");
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('items').whereIn('name', ANTURA_PIECES).update({ level_required: 13 });
}
