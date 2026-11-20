import type { Knex } from 'knex';

// The pinch of salt (docs/antura-plan.md §11): a cook may keep salt by them, and
// each dish then spends one Sea Salt for a 10% chance of a second
// (services/recipes.ts, SALT_DOUBLE_CHANCE). Off until switched on in the
// cooking menu, so nobody's salt is spent without asking.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('player_settings', 'cook_with_salt'))) {
        await knex.schema.alterTable('player_settings', (t) => { t.boolean('cook_with_salt').notNullable().defaultTo(false); });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_settings', 'cook_with_salt')) {
        await knex.schema.alterTable('player_settings', (t) => { t.dropColumn('cook_with_salt'); });
    }
}
