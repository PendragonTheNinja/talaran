import type { Knex } from 'knex';

// Each tier of a guild hall wants its own Carpentry to build (docs/antura-plan.md
// §6, the agreed spread: tier 2 hall work at Carpentry 22). Tier 1 stays open
// to every carpenter, as it always was; services/guildHall.ts checks it at the
// start of a build turn and on every cycle.

const LEVELS: Record<number, number> = { 1: 1, 2: 22 };

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('guild_hall_tiers', 'build_level'))) {
        await knex.schema.alterTable('guild_hall_tiers', (t) => { t.integer('build_level').notNullable().defaultTo(1); });
    }
    for (const [tier, level] of Object.entries(LEVELS)) {
        await knex('guild_hall_tiers').where({ tier: Number(tier) }).update({ build_level: level });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('guild_hall_tiers', 'build_level')) {
        await knex.schema.alterTable('guild_hall_tiers', (t) => { t.dropColumn('build_level'); });
    }
}
