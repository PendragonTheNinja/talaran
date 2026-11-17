import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Boats, step 2, second part (docs/islets-plan.md §2 and §4; Nathan,
// 2026-11-15 to 17): what a landing finds, beyond the strandline.
//
//   islet_find_kinds    each kind of find: the skill that works it, how much
//                       work it holds (a fixed amount, as a vein is), and how
//                       many times likelier its extras are (the boost, 3 for
//                       now, one dial per kind). A kind whose skill is not
//                       wired yet is inactive and never rolled.
//   islet_finds         what each islet can hold, by weight, by its
//                       character (a wooded islet never shows a vein).
//   player_islet_finds  the one live find a player has, on the islet where
//                       it was rolled, with what is left of it. Leaving the
//                       islet loses it.
//   voyage_lines        new moments: 'find_<kind>' when a find is found,
//                       'spent_<kind>' when it is worked out, 'find_nothing'.
//
// Only the stand of trees is wired in this step (services/woodcutting.ts);
// the vein, shoal, patch, and trail follow, one skill at a time.

const ISLAND = 'Taiar Island';

// [key, skill, min, max, boost, active]
const KINDS: [string, string | null, number, number, number, boolean][] = [
    ['stand', 'Woodcutting', 40, 40, 3, true],
    ['vein', 'Mining', 25, 40, 3, false],
    ['shoal', 'Fishing', 40, 40, 3, false],
    ['patch', 'Foraging', 40, 40, 3, false],
    ['trail', 'Hunting', 15, 15, 3, false],
    ['nothing', null, 0, 0, 1, true],
];

// Islet name -> [kind, weight]. Work finds share about 45 of each islet's
// weight and 'nothing' about 14 on the common islets (docs/islets-plan.md §4);
// chests, guardians, young, flowers, artefacts, and Quank come in step 3.
const HOLDS: Record<string, [string, number][]> = {
    'The Wooded Islet': [['stand', 30], ['patch', 15], ['nothing', 14]],
    'The Rocky Islet': [['vein', 45], ['nothing', 14]],
    'The Sandbar': [['shoal', 45], ['nothing', 14]],
    'The Reef': [['shoal', 45], ['nothing', 14]],
    'The Heath Islet': [['patch', 25], ['trail', 20], ['nothing', 14]],
    'The Sea Stack': [['shoal', 45], ['nothing', 5]],
    'The Drowned Quarry': [['vein', 45], ['nothing', 5]],
    'The Ruin': [['nothing', 1]],
};

const LINES: Record<string, string[]> = {
    find_stand: [
        'Inland, a stand of trees nobody has ever put an axe to. Straight in the grain, and close enough to fell into each other.',
        'The wood here is old growth, every trunk wider than your arms can reach. Somebody ought to cut it. It may as well be you.',
        'Under the canopy it is dim and still. The trees have had a long time to grow and nobody to stop them.',
    ],
    spent_stand: [
        'The last good trunk comes down. What is left is brush and saplings, not worth the axe.',
        'You have cut the stand out. The islet looks bigger without it, and the light comes straight down.',
    ],
    find_nothing: [
        'You walk the islet end to end. Rock, weed, a few gulls. Nothing else worth the trip, this time.',
        'Whatever this islet keeps, it is not showing you today.',
        'A quiet landing. The tideline gave what it gave, and the rest of the islet has nothing to add.',
    ],
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('islet_find_kinds'))) {
        await knex.schema.createTable('islet_find_kinds', (t) => {
            t.string('key', 20).primary();
            t.string('skill', 50).nullable();
            t.integer('amount_min').notNullable().defaultTo(0);
            t.integer('amount_max').notNullable().defaultTo(0);
            t.decimal('boost', 6, 2).notNullable().defaultTo(1);
            t.boolean('is_active').notNullable().defaultTo(false);
        });
    }
    if (!(await knex.schema.hasTable('islet_finds'))) {
        await knex.schema.createTable('islet_finds', (t) => {
            t.increments('id').primary();
            t.integer('location_id').notNullable().references('id').inTable('locations').onDelete('CASCADE');
            t.string('kind', 20).notNullable().references('key').inTable('islet_find_kinds');
            t.integer('weight').notNullable().defaultTo(1);
            t.unique(['location_id', 'kind']);
        });
    }
    if (!(await knex.schema.hasTable('player_islet_finds'))) {
        await knex.schema.createTable('player_islet_finds', (t) => {
            t.integer('player_id').primary().references('id').inTable('players').onDelete('CASCADE');
            t.integer('location_id').notNullable().references('id').inTable('locations').onDelete('CASCADE');
            t.string('kind', 20).notNullable().references('key').inTable('islet_find_kinds');
            t.integer('target_id').nullable();       // the node, habitat, water, or animal it is a best-of
            t.integer('remaining').notNullable().defaultTo(0);
            t.decimal('boost', 6, 2).notNullable().defaultTo(1);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
        await knex.raw('ALTER TABLE player_islet_finds ADD CONSTRAINT player_islet_finds_remaining_nonnegative CHECK (remaining >= 0)');
    }

    for (const [key, skill, amount_min, amount_max, boost, is_active] of KINDS) {
        await knex('islet_find_kinds').insert({ key, skill, amount_min, amount_max, boost, is_active })
            .onConflict('key').merge();
    }

    if (!(await hasContent(knex))) return;

    for (const [name, holds] of Object.entries(HOLDS)) {
        const islet = await knex('locations').where({ name }).whereNotNull('islet_kind').first('id');
        if (!islet) throw new Error(`islet_finds: islet "${name}" not found (run 20261117150000_islets first)`);
        for (const [kind, weight] of holds) {
            await knex('islet_finds').insert({ location_id: islet.id, kind, weight }).onConflict(['location_id', 'kind']).merge();
        }
    }

    await knex('voyage_lines').where({ island: ISLAND }).whereIn('moment', Object.keys(LINES)).delete();
    for (const [moment, texts] of Object.entries(LINES)) {
        await knex('voyage_lines').insert(texts.map(text => ({ island: ISLAND, moment, text })));
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('voyage_lines')) {
        await knex('voyage_lines').where({ island: ISLAND }).whereIn('moment', Object.keys(LINES)).delete();
    }
    await knex.schema.dropTableIfExists('player_islet_finds');
    await knex.schema.dropTableIfExists('islet_finds');
    await knex.schema.dropTableIfExists('islet_find_kinds');
}
