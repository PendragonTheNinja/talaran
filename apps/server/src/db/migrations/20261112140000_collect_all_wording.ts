import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Collecting from a pen said "with a basket" whatever was in it, so milking
// cows went along the pen with a basket (forum, 2026-11-12). One line serves
// milk, eggs and truffles, and Gather All going pen by pen, so it names no
// vessel.

const ROW = { action_type: 'husbandry', kind: 'collect_all' };
const NEW_TEXT = 'You go along the pen, taking what each animal has to give.';
const OLD_TEXT = 'You go along the pen with a basket, clearing it as you pass.';

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const changed = await knex('action_presentation').where(ROW).update({ scene_text: NEW_TEXT });
    if (changed !== 1) throw new Error(`action_presentation husbandry/collect_all: expected one row, found ${changed}`);
}

export async function down(knex: Knex): Promise<void> {
    await knex('action_presentation').where(ROW).update({ scene_text: OLD_TEXT });
}
