import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Kindle costs less (Nathan, 2026-11-12; forum, 2026-11-05). Its size, 400
// boosted actions over three hours, 100 to a person, and stacking over an
// event for the same work, are code (services/spells.ts, worldEvents.ts); its
// price is the row's.

const NEW_COST = 150;
const OLD_COST = 200;

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const changed = await knex('spells').where({ key: 'kindle' }).update({ cost: NEW_COST, updated_at: knex.fn.now() });
    if (changed !== 1) throw new Error(`kindle_resize: expected the kindle spell row, found ${changed}`);
}

export async function down(knex: Knex): Promise<void> {
    await knex('spells').where({ key: 'kindle' }).update({ cost: OLD_COST, updated_at: knex.fn.now() });
}
