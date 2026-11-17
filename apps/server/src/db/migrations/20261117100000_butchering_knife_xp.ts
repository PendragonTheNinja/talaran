import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Ambren Butchering Knife paid 35 XP for its 50 s since it was seeded
// (20260731180000), where every other finished good at the forge pays by the
// band: 1.1 x 1.8 x 2,000 an hour at level 1, so 55 for 50 s (the Foraging
// Knife is 50 for 45 s). Found while drafting the Serph recipes from the Ambren
// rows (docs/antura-plan.md §5); Nathan, 2026-11-17: correct it. The timer is
// unchanged.
//
// The knife's value is derived from this XP (values:derive), so it rises with
// it on the next `pnpm values:derive -- --write`.

const NAME = 'Forge Ambren Butchering Knife';
const BEFORE = { xp: 35 };
const AFTER = { xp: 55 };

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const row = await knex('recipes').where({ name: NAME }).first();
    if (!row) throw new Error(`butchering_knife_xp: recipe "${NAME}" not found`);
    await knex('recipes').where({ id: row.id }).update(AFTER);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const row = await knex('recipes').where({ name: NAME }).first();
    if (!row) throw new Error(`butchering_knife_xp: recipe "${NAME}" not found`);
    await knex('recipes').where({ id: row.id }).update(BEFORE);
}
