import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Ret Flax takes half as long and pays half the XP (Nathan, 2026-11-02:
// "players hate that it takes 10 minutes"). Ten minutes to five, 423 XP to
// 212, so Farming XP per hour stays where it was; only the wait is shorter.
// Inputs and yield (10 Flax into 15 Retted Flax) are unchanged.
//
// Retted Flax's value is derived from this XP (values:derive), so it halves
// with it unless the script is told otherwise.

const NAME = 'Ret Flax';
const BEFORE = { timer_seconds: 600, xp: 423 };
const AFTER = { timer_seconds: 300, xp: 212 };

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const row = await knex('recipes').where({ name: NAME }).first();
    if (!row) throw new Error(`ret_flax_halved: recipe "${NAME}" not found`);
    await knex('recipes').where({ id: row.id }).update(AFTER);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const row = await knex('recipes').where({ name: NAME }).first();
    if (!row) throw new Error(`ret_flax_halved: recipe "${NAME}" not found`);
    await knex('recipes').where({ id: row.id }).update(BEFORE);
}
