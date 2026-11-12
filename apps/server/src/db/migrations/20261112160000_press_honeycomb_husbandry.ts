import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Pressing honeycomb is Husbandry's, beside churning butter and pressing
// cheese, and needs no bench (Nathan, 2026-11-07 and 11-12; forum "Hearth
// Upgrade for Homestead"). It was a Cooking recipe at the cooking bench, so a
// beekeeper carried every comb to Phoenwick, or worked at half speed at the
// public bench, to do what needs no fire.
//
// XP on the Husbandry processing band, as its siblings are (Churn Butter, 45 at
// level 10 for 60 s; Press Cheese, 95 at level 12 for 120 s): level 5, the
// level bees are kept from, for 60 s is 2,419 an hour, so 40.

const NAME = 'Press Honeycomb';
const NEW = { skill: 'Husbandry', for_skill: 'Husbandry', station: null, required_level: 5, timer_seconds: 60, xp: 40 };
const OLD = { skill: 'Cooking', for_skill: 'Cooking', station: 'cooking', required_level: 5, timer_seconds: 60, xp: 73 };

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const changed = await knex('recipes').where({ name: NAME }).update(NEW);
    if (changed !== 1) throw new Error(`press_honeycomb_husbandry: expected one "${NAME}" recipe, found ${changed}`);
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: NAME }).update(OLD);
}
