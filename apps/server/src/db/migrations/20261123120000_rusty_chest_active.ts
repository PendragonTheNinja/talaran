import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Rusty Chest shipped inactive in August, when nothing opened it yet
// (20260808170000_seed_fishing_salvage). Since 20261117170000 Geoffrey picks a
// Locked Rusty Chest's lock and hands one back, and it opens as a container,
// so it is live: an inactive item has no item page and no museum case.

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const n = await knex('items').where({ name: 'Rusty Chest' }).update({ is_active: true });
    if (n !== 1) throw new Error('rusty_chest_active: item "Rusty Chest" not found');
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('items').where({ name: 'Rusty Chest' }).update({ is_active: false });
}
