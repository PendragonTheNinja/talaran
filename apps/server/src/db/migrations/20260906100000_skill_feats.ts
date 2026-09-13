import type { Knex } from 'knex';

/**
 * A feat ladder for every skill.
 *
 * Woodcutting, Mining, Fishing and Hunting had four, four, two and two feats
 * beyond Mastery. Every other skill had none, because player_stats only counted
 * those four things. Now that it counts the rest, the gap closes.
 *
 * Two per skill, at roughly an evening and roughly a fortnight, following the
 * shape the first four already use. Nothing here grants a badge: badges stay
 * scarce and belong to the masteries.
 *
 * EVERY criterion_target below is a column this same patch writes to. A feat
 * pointing at a dead counter looks fine in the panel and can never be earned,
 * which this game has now managed three times.
 */

type Feat = {
    slug: string;
    name: string;
    description: string;
    title: string | null;
    criterion_kind: string;
    criterion_target: string;
    criterion_value: number;
    category: string;
    is_hidden: boolean;
    display_order: number;
};

const FEATS: Feat[] = [
    // ── Foraging ─────────────────────────────────────────────────
    { slug: 'hedge-and-ditch', name: 'Hedge and Ditch', description: 'Search two hundred habitats.', title: null, criterion_kind: 'stat', criterion_target: 'total_habitats_searched', criterion_value: 200, category: 'Foraging', is_hidden: false, display_order: 44 },
    { slug: 'the-full-basket', name: 'The Full Basket', description: 'Gather five thousand things from the hedgerows.', title: 'the Gleaner', criterion_kind: 'stat', criterion_target: 'total_items_foraged', criterion_value: 5000, category: 'Foraging', is_hidden: false, display_order: 45 },

    // ── Farming ──────────────────────────────────────────────────
    { slug: 'first-furrow', name: 'First Furrow', description: 'Till a hundred plots.', title: null, criterion_kind: 'stat', criterion_target: 'total_plots_tilled', criterion_value: 100, category: 'Farming', is_hidden: false, display_order: 70 },
    { slug: 'harvest-home', name: 'Harvest Home', description: 'Bring in a thousand crops.', title: 'the Husbandman', criterion_kind: 'stat', criterion_target: 'total_crops_harvested', criterion_value: 1000, category: 'Farming', is_hidden: false, display_order: 71 },

    // ── Husbandry ────────────────────────────────────────────────
    { slug: 'a-full-byre', name: 'A Full Byre', description: 'Raise a hundred animals to adulthood.', title: null, criterion_kind: 'stat', criterion_target: 'total_animals_raised', criterion_value: 100, category: 'Husbandry', is_hidden: false, display_order: 72 },
    { slug: 'morning-and-evening', name: 'Morning and Evening', description: 'Collect two thousand eggs, pails, and combs.', title: 'the Drover', criterion_kind: 'stat', criterion_target: 'total_animal_products', criterion_value: 2000, category: 'Husbandry', is_hidden: false, display_order: 73 },
    { slug: 'the-worst-job', name: 'The Worst Job', description: 'Muck out five hundred pens.', title: null, criterion_kind: 'stat', criterion_target: 'total_pens_mucked', criterion_value: 500, category: 'Husbandry', is_hidden: true, display_order: 74 },

    // ── Smithing ─────────────────────────────────────────────────
    { slug: 'first-heat', name: 'First Heat', description: 'Smelt five hundred ingots.', title: null, criterion_kind: 'stat', criterion_target: 'total_ingots_smelted', criterion_value: 500, category: 'Smithing', is_hidden: false, display_order: 75 },
    { slug: 'struck-while-hot', name: 'Struck While Hot', description: 'Forge one thousand things.', title: 'the Ironhand', criterion_kind: 'stat', criterion_target: 'total_items_forged', criterion_value: 1000, category: 'Smithing', is_hidden: false, display_order: 76 },

    // ── Carpentry ────────────────────────────────────────────────
    { slug: 'true-to-the-line', name: 'True to the Line', description: 'Saw a thousand batches of planks.', title: null, criterion_kind: 'stat', criterion_target: 'total_planks_sawn', criterion_value: 1000, category: 'Carpentry', is_hidden: false, display_order: 77 },
    { slug: 'raised-and-pegged', name: 'Raised and Pegged', description: 'Build one thousand things at the bench.', title: 'the Joiner', criterion_kind: 'stat', criterion_target: 'total_items_built', criterion_value: 1000, category: 'Carpentry', is_hidden: false, display_order: 78 },

    // ── Crafting ─────────────────────────────────────────────────
    { slug: 'by-hand', name: 'By Hand', description: 'Make a thousand things.', title: null, criterion_kind: 'stat', criterion_target: 'total_items_crafted', criterion_value: 1000, category: 'Crafting', is_hidden: false, display_order: 79 },

    // ── Cooking ──────────────────────────────────────────────────
    { slug: 'the-first-supper', name: 'The First Supper', description: 'Cook two hundred meals.', title: null, criterion_kind: 'stat', criterion_target: 'total_meals_cooked', criterion_value: 200, category: 'Cooking', is_hidden: false, display_order: 80 },
    { slug: 'fed-the-parish', name: 'Fed the Parish', description: 'Cook three thousand meals.', title: 'the Cook', criterion_kind: 'stat', criterion_target: 'total_meals_cooked', criterion_value: 3000, category: 'Cooking', is_hidden: false, display_order: 81 },
    { slug: 'the-cold-hearth', name: 'The Cold Hearth', description: 'Burn five hundred dinners.', title: null, criterion_kind: 'stat', criterion_target: 'total_meals_burnt', criterion_value: 500, category: 'Cooking', is_hidden: true, display_order: 82 },

    // ── Agility and Equitation ───────────────────────────────────
    { slug: 'on-foot', name: 'On Foot', description: 'Make five hundred journeys on your own legs.', title: null, criterion_kind: 'stat', criterion_target: 'total_journeys_on_foot', criterion_value: 500, category: 'Wandering', is_hidden: false, display_order: 53 },
    { slug: 'in-the-saddle', name: 'In the Saddle', description: 'Make five hundred journeys mounted.', title: 'the Rider', criterion_kind: 'stat', criterion_target: 'total_journeys_mounted', criterion_value: 500, category: 'Wandering', is_hidden: false, display_order: 54 },
];

export async function up(knex: Knex): Promise<void> {
    // Refuse rather than ship a dead feat: if a counter is missing, the whole
    // set is wrong and a loud failure beats forty unearnable rows.
    for (const feat of FEATS) {
        if (!(await knex.schema.hasColumn('player_stats', feat.criterion_target))) {
            throw new Error(
                `Feat "${feat.slug}" targets ${feat.criterion_target}, which player_stats does not have. ` +
                'Run the skill counters migration first.',
            );
        }
    }

    for (const feat of FEATS) {
        const existing = await knex('feats').where({ slug: feat.slug }).first();
        if (!existing) await knex('feats').insert(feat);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('feats').whereIn('slug', FEATS.map(f => f.slug)).delete();
}
