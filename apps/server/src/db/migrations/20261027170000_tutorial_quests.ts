import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Tutorial quests get their own folding group in the quest log (Nathan,
// 2026-10-27): many quests later will not be tutorials, and these should not
// crowd them. A fact about the quest, so a column, set here for every quest a
// tutor gives. A new tutor's migration sets it on its own quest (Georome's
// will, for Talar).

const TUTORS = [
    'Quank', 'Geoffrey', 'Geossica', 'Geomima', 'Geonsen',
    'Georgic', 'Geothro', 'Georemy', 'Georold', 'Geosper',
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('quests', 'is_tutorial'))) {
        await knex.schema.alterTable('quests', t => { t.boolean('is_tutorial').notNullable().defaultTo(false); });
    }
    if (!(await hasContent(knex))) return;
    const marked = await knex('quests').whereIn('npc_name', TUTORS).update({ is_tutorial: true });
    if (!marked) throw new Error('tutorial_quests: no tutor quests found');
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('quests', 'is_tutorial')) {
        await knex.schema.alterTable('quests', t => { t.dropColumn('is_tutorial'); });
    }
}
