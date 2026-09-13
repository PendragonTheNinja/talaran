import type { Knex } from 'knex';

/**
 * A counter for every skill.
 *
 * player_stats has counted logs, rocks, fish and animals since April, which is
 * why four skills had feats beyond Mastery and the other nine had none. The
 * gap was never a design choice, it was just which columns happened to exist.
 *
 * Every column here is written to by this same patch. A counter nothing
 * increments is worse than no counter: it looks usable in the admin panel's
 * criterion dropdown and produces a feat that can never be earned, which has
 * already happened three times in this game.
 *
 * All default to 0 and are nullable-free, so existing players simply start
 * counting from today rather than needing a backfill. A feat asking for a
 * thousand of something is a forward-looking goal either way.
 */

const COUNTERS: string[] = [
    // ── Farming ──────────────────────────────────────────────────
    'total_plots_tilled',
    'total_seeds_sown',
    'total_crops_harvested',

    // ── Husbandry ────────────────────────────────────────────────
    'total_animals_raised',      // reached adulthood in your care
    'total_animal_products',     // eggs, milk, truffles, honeycomb
    'total_animals_slaughtered',
    'total_pens_mucked',

    // ── Smithing ─────────────────────────────────────────────────
    'total_ingots_smelted',
    'total_items_forged',

    // ── Carpentry ────────────────────────────────────────────────
    'total_planks_sawn',
    'total_items_built',

    // ── Crafting and Cooking ─────────────────────────────────────
    'total_items_crafted',
    'total_meals_cooked',
    'total_meals_burnt',

    // ── Foraging ─────────────────────────────────────────────────
    // total_items_foraged already exists and is written to.
    'total_habitats_searched',

    // ── Agility and Equitation ───────────────────────────────────
    // Two skills with no counter of any kind until now.
    'total_journeys_on_foot',
    'total_journeys_mounted',
];

export async function up(knex: Knex): Promise<void> {
    for (const column of COUNTERS) {
        if (await knex.schema.hasColumn('player_stats', column)) continue;
        await knex.schema.alterTable('player_stats', (t) => {
            t.bigInteger(column).notNullable().defaultTo(0);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const column of COUNTERS) {
        if (!(await knex.schema.hasColumn('player_stats', column))) continue;
        await knex.schema.alterTable('player_stats', (t) => t.dropColumn(column));
    }
}
