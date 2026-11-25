import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Freshwater Pearl drops (River Mussels and Mussel Chowder since
// 20261113100000, the Shellycoat since 20261120200000), but its row was still
// switched off, so the museum made no case for it and the Manual had no page
// (forum, 2026-11-25). Switched on, it files itself in Taiar's Stone and Ore
// at the next start (fillMissingCases), and its description takes American
// spelling.

const NAME = 'Freshwater Pearl';
const DESCRIPTION = 'Small, irregular, and the color of a rain cloud with the sun behind it. Worth more than the fish that shared its bed.';
const OLD_DESCRIPTION = 'Small, irregular, and the colour of a rain cloud with the sun behind it. Worth more than the fish that shared its bed.';

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const item = await knex('items').where({ name: NAME }).first('id');
    if (!item) throw new Error(`freshwater_pearl: no item "${NAME}"`);
    await knex('items').where({ id: item.id }).update({ is_active: true, description: DESCRIPTION });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('items').where({ name: NAME }).update({ is_active: false, description: OLD_DESCRIPTION });
}
