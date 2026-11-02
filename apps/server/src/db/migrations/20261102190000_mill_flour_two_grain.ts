import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Mill Flour takes 2 Grain, not 3 (Nathan, 2026-11-02). Grain also feeds
// every animal on a homestead, and a third of it lost to the millstone made
// flour a luxury. Timer and XP are unchanged.

const NAME = 'Mill Flour';

async function setGrain(knex: Knex, qty: number): Promise<void> {
    const row = await knex('recipes').where({ name: NAME }).first();
    if (!row) throw new Error(`mill_flour_two_grain: recipe "${NAME}" not found`);
    await knex('recipes').where({ id: row.id }).update({ inputs: JSON.stringify([{ itemName: 'Grain', qty }]) });
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setGrain(knex, 2);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setGrain(knex, 3);
}
