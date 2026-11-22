import type { Knex } from 'knex';

// The Friddick errands paid 300 Wayfaring XP a leg on top of what the walk
// itself pays (FOOT_XP_RATE, 0.7 a second of road), so a leg earned two to three
// times the walk alone. Nathan (2026-11-22): less. 75 a leg, about a third to a
// half again over the walk, so an errand is worth walking for and not a
// Wayfaring farm. The gold stays as it was. reward_xp is a column on each
// errand, so it can be tuned from the admin content browser without a deploy.

const POOL = 'friddick';
const XP_PER_LEG = 75;
const OLD_XP_PER_LEG = 300;

async function setXp(knex: Knex, perLeg: number): Promise<void> {
    if (!(await knex.schema.hasTable('errands'))) return;
    await knex('errands').where({ pool: POOL, reward_skill: 'Wayfaring' })
        .update({ reward_xp: knex.raw('? * jsonb_array_length(legs)', [perLeg]), updated_at: knex.fn.now() });
}

export async function up(knex: Knex): Promise<void> {
    await setXp(knex, XP_PER_LEG);
}

export async function down(knex: Knex): Promise<void> {
    await setXp(knex, OLD_XP_PER_LEG);
}
