import type { Knex } from 'knex';

/**
 * Feats.
 *
 * Talaran has no combat, which means it has no boss to beat and no gear score
 * to climb. What it has instead is a very long ladder per skill, and a player
 * three hours in has no way of knowing whether they are doing well. Feats are
 * the answer to "what should I be proud of".
 *
 * DATA, NOT CODE. Every feat is a row with a criterion in it: a kind, a target,
 * and a number. Adding one is an INSERT, and combat can add forty on the day it
 * ships without touching the evaluator. The four kinds cover everything the
 * game already records:
 *
 *   stat         a player_stats counter reaches N
 *   skill        one named skill reaches level N
 *   total_level  the sum of every skill reaches N
 *   breadth      N skills each at level L or better
 *
 * Nothing here awards items, gold or experience. A feat that pays out becomes a
 * chore to be farmed; a feat that only says "you did this" stays a memory. The
 * one thing some of them grant is a TITLE, which is worn beside your name and
 * costs the economy nothing.
 *
 * HIDDEN FEATS exist and are not listed until earned. Not many, and never ones
 * a player could miss by playing normally: they are for the things nobody sets
 * out to do.
 */

type Feat = {
    slug: string;
    name: string;
    description: string;
    /** Shown once earned. Null for most. */
    title: string | null;
    criterion_kind: 'stat' | 'skill' | 'total_level' | 'breadth';
    /** column name, skill name, or for breadth the level each skill must reach */
    criterion_target: string | null;
    criterion_value: number;
    category: string;
    /** Not listed until earned. */
    is_hidden: boolean;
    display_order: number;
};

const FEATS: Feat[] = [
    // ── Woodcutting ───────────────────────────────────────────────
    { slug: 'first-timber', name: 'First Timber', description: 'Fell a hundred trees.', title: null, criterion_kind: 'stat', criterion_target: 'total_logs_chopped', criterion_value: 100, category: 'Woodcutting', is_hidden: false, display_order: 10 },
    { slug: 'the-long-clearing', name: 'The Long Clearing', description: 'Fell two thousand trees.', title: null, criterion_kind: 'stat', criterion_target: 'total_logs_chopped', criterion_value: 2000, category: 'Woodcutting', is_hidden: false, display_order: 11 },
    { slug: 'grain-and-figure', name: 'Grain and Figure', description: 'Take five hundred excellent logs. Anyone can swing an axe; reading the tree is the trade.', title: 'the Woodwise', criterion_kind: 'stat', criterion_target: 'excellent_logs_chopped', criterion_value: 500, category: 'Woodcutting', is_hidden: false, display_order: 12 },
    { slug: 'knot-and-splinter', name: 'Knot and Splinter', description: 'Take a thousand poor logs. Somebody has to.', title: null, criterion_kind: 'stat', criterion_target: 'poor_logs_chopped', criterion_value: 1000, category: 'Woodcutting', is_hidden: true, display_order: 13 },

    // ── Mining ────────────────────────────────────────────────────
    { slug: 'first-strike', name: 'First Strike', description: 'Break a hundred rocks.', title: null, criterion_kind: 'stat', criterion_target: 'total_rocks_mined', criterion_value: 100, category: 'Mining', is_hidden: false, display_order: 20 },
    { slug: 'deep-and-dark', name: 'Deep and Dark', description: 'Break five thousand rocks.', title: null, criterion_kind: 'stat', criterion_target: 'total_rocks_mined', criterion_value: 5000, category: 'Mining', is_hidden: false, display_order: 21 },
    { slug: 'the-nose-for-it', name: 'The Nose For It', description: 'Discover fifty veins. Some people walk past them all their lives.', title: 'the Lodefinder', criterion_kind: 'stat', criterion_target: 'veins_discovered', criterion_value: 50, category: 'Mining', is_hidden: false, display_order: 22 },
    { slug: 'weight-of-the-hill', name: 'Weight of the Hill', description: 'Pull a thousand dense ores out of the ground.', title: null, criterion_kind: 'stat', criterion_target: 'total_dense_ores_mined', criterion_value: 1000, category: 'Mining', is_hidden: false, display_order: 23 },

    // ── Fishing ───────────────────────────────────────────────────
    { slug: 'a-line-in-the-water', name: 'A Line in the Water', description: 'Land two hundred fish.', title: null, criterion_kind: 'stat', criterion_target: 'total_fish_caught', criterion_value: 200, category: 'Fishing', is_hidden: false, display_order: 30 },
    { slug: 'patience-of-the-bank', name: 'Patience of the Bank', description: 'Land three thousand fish. The river does not hurry and neither do you.', title: 'the Patient', criterion_kind: 'stat', criterion_target: 'total_fish_caught', criterion_value: 3000, category: 'Fishing', is_hidden: false, display_order: 31 },

    // ── Hunting ───────────────────────────────────────────────────
    { slug: 'the-first-snare', name: 'The First Snare', description: 'Take a hundred animals.', title: null, criterion_kind: 'stat', criterion_target: 'total_animals_hunted', criterion_value: 100, category: 'Hunting', is_hidden: false, display_order: 40 },
    { slug: 'quiet-feet', name: 'Quiet Feet', description: 'Take a thousand animals.', title: 'the Silent', criterion_kind: 'stat', criterion_target: 'total_animals_hunted', criterion_value: 1000, category: 'Hunting', is_hidden: false, display_order: 41 },

    // ── Travel and the world ──────────────────────────────────────
    { slug: 'off-the-map', name: 'Off the Map', description: 'Set foot in every corner of Taiar Island.', title: null, criterion_kind: 'stat', criterion_target: 'total_locations_visited', criterion_value: 10, category: 'Wandering', is_hidden: false, display_order: 50 },
    { slug: 'the-long-road', name: 'The Long Road', description: 'Walk a thousand miles of it.', title: null, criterion_kind: 'stat', criterion_target: 'total_distance_traveled', criterion_value: 1000, category: 'Wandering', is_hidden: false, display_order: 51 },
    { slug: 'shoe-leather', name: 'Shoe Leather', description: 'Walk ten thousand miles. There were horses available.', title: 'the Footsore', criterion_kind: 'stat', criterion_target: 'total_distance_traveled', criterion_value: 10000, category: 'Wandering', is_hidden: true, display_order: 52 },

    // ── Work in general ───────────────────────────────────────────
    { slug: 'a-days-work', name: "A Day's Work", description: 'Finish a thousand actions.', title: null, criterion_kind: 'stat', criterion_target: 'total_actions_completed', criterion_value: 1000, category: 'Labour', is_hidden: false, display_order: 60 },
    { slug: 'a-year-of-mornings', name: 'A Year of Mornings', description: 'Finish twenty five thousand actions.', title: null, criterion_kind: 'stat', criterion_target: 'total_actions_completed', criterion_value: 25000, category: 'Labour', is_hidden: false, display_order: 61 },
    { slug: 'the-hundred-thousand', name: 'The Hundred Thousand', description: 'Earn a hundred thousand experience.', title: null, criterion_kind: 'stat', criterion_target: 'total_xp_earned', criterion_value: 100000, category: 'Labour', is_hidden: false, display_order: 62 },
    { slug: 'the-million', name: 'The Million', description: 'Earn ten million experience.', title: null, criterion_kind: 'stat', criterion_target: 'total_xp_earned', criterion_value: 10000000, category: 'Labour', is_hidden: false, display_order: 63 },

    // ── Per skill: the first rung and the far one ─────────────────
    { slug: 'apprentice-woodcutter', name: 'Apprentice Woodcutter', description: 'Reach Woodcutting 25.', title: null, criterion_kind: 'skill', criterion_target: 'Woodcutting', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 100 },
    { slug: 'apprentice-miner', name: 'Apprentice Miner', description: 'Reach Mining 25.', title: null, criterion_kind: 'skill', criterion_target: 'Mining', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 101 },
    { slug: 'apprentice-fisher', name: 'Apprentice Fisher', description: 'Reach Fishing 25.', title: null, criterion_kind: 'skill', criterion_target: 'Fishing', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 102 },
    { slug: 'apprentice-forager', name: 'Apprentice Forager', description: 'Reach Foraging 25.', title: null, criterion_kind: 'skill', criterion_target: 'Foraging', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 103 },
    { slug: 'apprentice-hunter', name: 'Apprentice Hunter', description: 'Reach Hunting 25.', title: null, criterion_kind: 'skill', criterion_target: 'Hunting', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 104 },
    { slug: 'apprentice-farmer', name: 'Apprentice Farmer', description: 'Reach Farming 25.', title: null, criterion_kind: 'skill', criterion_target: 'Farming', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 105 },
    { slug: 'apprentice-stockman', name: 'Apprentice Stockman', description: 'Reach Husbandry 25.', title: null, criterion_kind: 'skill', criterion_target: 'Husbandry', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 106 },
    { slug: 'apprentice-smith', name: 'Apprentice Smith', description: 'Reach Smithing 25.', title: null, criterion_kind: 'skill', criterion_target: 'Smithing', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 107 },
    { slug: 'apprentice-wright', name: 'Apprentice Wright', description: 'Reach Carpentry 25.', title: null, criterion_kind: 'skill', criterion_target: 'Carpentry', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 108 },
    { slug: 'apprentice-crafter', name: 'Apprentice Crafter', description: 'Reach Crafting 25.', title: null, criterion_kind: 'skill', criterion_target: 'Crafting', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 109 },
    { slug: 'apprentice-cook', name: 'Apprentice Cook', description: 'Reach Cooking 25.', title: null, criterion_kind: 'skill', criterion_target: 'Cooking', criterion_value: 25, category: 'Mastery', is_hidden: false, display_order: 110 },

    { slug: 'master-woodcutter', name: 'Master of the Axe', description: 'Reach Woodcutting 100.', title: 'Master of the Axe', criterion_kind: 'skill', criterion_target: 'Woodcutting', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 120 },
    { slug: 'master-miner', name: 'Master of the Pick', description: 'Reach Mining 100.', title: 'Master of the Pick', criterion_kind: 'skill', criterion_target: 'Mining', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 121 },
    { slug: 'master-fisher', name: 'Master of the Rod', description: 'Reach Fishing 100.', title: 'Master of the Rod', criterion_kind: 'skill', criterion_target: 'Fishing', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 122 },
    { slug: 'master-forager', name: 'Master of the Hedgerow', description: 'Reach Foraging 100.', title: 'Master of the Hedgerow', criterion_kind: 'skill', criterion_target: 'Foraging', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 123 },
    { slug: 'master-hunter', name: 'Master of the Snare', description: 'Reach Hunting 100.', title: 'Master of the Snare', criterion_kind: 'skill', criterion_target: 'Hunting', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 124 },
    { slug: 'master-farmer', name: 'Master of the Furrow', description: 'Reach Farming 100.', title: 'Master of the Furrow', criterion_kind: 'skill', criterion_target: 'Farming', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 125 },
    { slug: 'master-stockman', name: 'Master of the Byre', description: 'Reach Husbandry 100.', title: 'Master of the Byre', criterion_kind: 'skill', criterion_target: 'Husbandry', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 126 },
    { slug: 'master-smith', name: 'Master of the Anvil', description: 'Reach Smithing 100.', title: 'Master of the Anvil', criterion_kind: 'skill', criterion_target: 'Smithing', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 127 },
    { slug: 'master-wright', name: 'Master of the Bench', description: 'Reach Carpentry 100.', title: 'Master of the Bench', criterion_kind: 'skill', criterion_target: 'Carpentry', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 128 },
    { slug: 'master-crafter', name: 'Master of the Awl', description: 'Reach Crafting 100.', title: 'Master of the Awl', criterion_kind: 'skill', criterion_target: 'Crafting', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 129 },
    { slug: 'master-cook', name: 'Master of the Hearth', description: 'Reach Cooking 100.', title: 'Master of the Hearth', criterion_kind: 'skill', criterion_target: 'Cooking', criterion_value: 100, category: 'Mastery', is_hidden: false, display_order: 130 },

    // ── Breadth, which is the shape this game actually rewards ────
    { slug: 'a-bit-of-everything', name: 'A Bit of Everything', description: 'Reach level 10 in all different trades.', title: null, criterion_kind: 'breadth', criterion_target: '10', criterion_value: 11, category: 'Breadth', is_hidden: false, display_order: 200 },
    { slug: 'every-trade-in-talaran', name: 'Every Trade in Talaran', description: 'Reach level 25 in all different trades.', title: 'the Handy', criterion_kind: 'breadth', criterion_target: '25', criterion_value: 11, category: 'Breadth', is_hidden: false, display_order: 201 },
    { slug: 'jack-of-the-parish', name: 'Jack of the Parish', description: 'Reach level 50 in every trade there is.', title: 'the Compleat', criterion_kind: 'breadth', criterion_target: '50', criterion_value: 11, category: 'Breadth', is_hidden: false, display_order: 202 },
    { slug: 'total-100', name: 'A Hundred All Told', description: 'Reach total level 100.', title: null, criterion_kind: 'total_level', criterion_target: null, criterion_value: 100, category: 'Breadth', is_hidden: false, display_order: 210 },
    { slug: 'total-500', name: 'Five Hundred All Told', description: 'Reach total level 500.', title: null, criterion_kind: 'total_level', criterion_target: null, criterion_value: 500, category: 'Breadth', is_hidden: false, display_order: 211 },
    { slug: 'total-1000', name: 'A Thousand All Told', description: 'Reach total level 1,000.', title: 'of Talaran', criterion_kind: 'total_level', criterion_target: null, criterion_value: 1000, category: 'Breadth', is_hidden: false, display_order: 212 },

    // ── Hidden ────────────────────────────────────────────────────
    { slug: 'nobody-asked', name: 'Nobody Asked You To', description: 'Pass a thousand bot checks.', title: 'the Mathhead', criterion_kind: 'stat', criterion_target: 'bot_checks_passed', criterion_value: 1000, category: 'Odd Corners', is_hidden: true, display_order: 300 },
    { slug: 'the-long-sit', name: 'The Long Sit', description: 'Spend ten thousand hours in Talaran.', title: 'the Veteran', criterion_kind: 'stat', criterion_target: 'total_seconds_played', criterion_value: 36000000, category: 'Odd Corners', is_hidden: true, display_order: 301 },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('feats'))) {
        await knex.schema.createTable('feats', (t) => {
            t.increments('id').primary();
            t.string('slug', 60).notNullable().unique();
            t.string('name', 80).notNullable();
            t.text('description').notNullable();
            t.string('title', 60).nullable();
            t.string('criterion_kind', 20).notNullable();
            t.string('criterion_target', 60).nullable();
            t.bigInteger('criterion_value').notNullable();
            t.string('category', 40).notNullable();
            t.boolean('is_hidden').notNullable().defaultTo(false);
            t.integer('display_order').notNullable().defaultTo(0);
            t.boolean('is_active').notNullable().defaultTo(true);
        });
    }

    if (!(await knex.schema.hasTable('player_feats'))) {
        await knex.schema.createTable('player_feats', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.integer('feat_id').unsigned().notNullable()
                .references('id').inTable('feats').onDelete('CASCADE');
            t.timestamp('earned_at').notNullable().defaultTo(knex.fn.now());
            // One player earns a feat once. The unique index is what makes the
            // evaluator safe to run as often as we like.
            t.unique(['player_id', 'feat_id']);
            t.index(['player_id']);
        });
    }

    // The worn title. Null means none chosen, which is the default and is fine.
    if (!(await knex.schema.hasColumn('players', 'worn_title'))) {
        await knex.schema.alterTable('players', (t) => {
            t.string('worn_title', 60).nullable();
        });
    }

    for (const feat of FEATS) {
        const existing = await knex('feats').where({ slug: feat.slug }).first();
        if (!existing) await knex('feats').insert(feat);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('players', 'worn_title')) {
        await knex.schema.alterTable('players', (t) => t.dropColumn('worn_title'));
    }
    await knex.schema.dropTableIfExists('player_feats');
    await knex.schema.dropTableIfExists('feats');
}
