import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The rest of the islet finds (docs/islets-plan.md §3, §4, §6a; Nathan,
// 2026-11-15 to 17): young animals, flowers, the ruin's artefacts, and Quank.
//
//   islet_find_items      what a 'young' or 'flowers' find gives, per island,
//                         by weight, with how it reads in a line.
//   'artefact'            one of the island's relics (items.subtype 'artefact',
//                         items.set_island), one never found first, for the
//                         museum ("a set per island").
//   'quank'               met once on each island's islets, never again there
//                         (player_quank_met): a written scene, and before he
//                         goes he leaves the player a Tidbit, half a Tiddle
//                         (Nathan, 2026-11-17). No power. A keepsake for the
//                         From the Islets exhibit.
//   islet_finds weights   from §4: common islets young 8, flowers 10, Quank 1;
//                         seldom young 15, artefact 3, Quank 2; the ruin young 15,
//                         artefact 25, Quank 10.

const ISLAND = 'Taiar Island';

// [kind, item, min, max, weight, words for one, words for many ({n})]
const ITEMS: [string, string, number, number, number, string, string][] = [
    ['young', 'Chick', 1, 2, 35, 'a chick, cheeping in the grass', '{n} chicks, cheeping in the grass'],
    ['young', 'Calf', 1, 1, 30, 'a calf, wet-nosed and lost', '{n} calves, wet-nosed and lost'],
    ['young', 'Piglet', 1, 1, 20, 'a piglet gone half wild', '{n} piglets gone half wild'],
    ['young', 'Rouncey Foal', 1, 1, 10, 'a rouncey foal, alone and frightened', '{n} rouncey foals'],
    ['young', 'Palfrey Foal', 1, 1, 5, 'a palfrey foal, fine-boned and nervous', '{n} palfrey foals'],
    ['flowers', 'Daisy', 2, 5, 35, 'a daisy', '{n} daisies'],
    ['flowers', 'Lavender', 2, 4, 30, 'a sprig of wild lavender', '{n} sprigs of wild lavender'],
    ['flowers', 'Taiaria', 2, 3, 25, 'a Taiaria flower', '{n} Taiaria flowers'],
];

const ARTEFACTS = [
    { name: 'Carved Lintel Stone', description: 'A stone from over a doorway, cut with marks in rows. They are not letters anyone on the island can read, and they are too careful to be nothing.' },
    { name: 'Weathered Figurine', description: 'A small stone figure of someone standing with a hand raised to their eyes, looking out to sea. The face has worn away.' },
    { name: 'Cracked Clay Lamp', description: 'An oil lamp of red clay with soot still in the spout. Somebody kept a light burning in the ruin, once, every night.' },
    { name: 'Ambren Door Key', description: 'A heavy key of Ambren, green with age. The ruin has no doors left for it to open.' },
    { name: 'String of Sea-Glass Beads', description: 'Beads of green and blue glass on a rotten cord. Glass like this was not made on Taiar.' },
];

const TIDBIT = {
    name: 'Tidbit', type: 'curio', subtype: 'keepsake', tier: 1, level_required: 1,
    description: 'Half a Tiddle, the back half. Quank gave it to you as if it were the most natural thing in the world. You did not ask what happened to the front.',
};

const HOLDS: Record<string, [string, number][]> = {
    'The Wooded Islet': [['young', 8], ['flowers', 10], ['quank', 1]],
    'The Rocky Islet': [['quank', 1]],
    'The Sandbar': [['quank', 1]],
    'The Reef': [['quank', 1]],
    'The Heath Islet': [['young', 8], ['flowers', 10], ['quank', 1]],
    'The Sea Stack': [['young', 15], ['artefact', 3], ['quank', 2]],
    'The Drowned Quarry': [['artefact', 3], ['quank', 2]],
    'The Ruin': [['young', 15], ['artefact', 25], ['quank', 10]],
};

const LINES: Record<string, string[]> = {
    find_young: [
        'Something is crying in the undergrowth. You go to look, and find {find}.',
        'You are not alone on the islet after all: {find}.',
        'Down by the water, where nobody would think to look: {find}.',
    ],
    find_flowers: [
        'The turf here is starred with flowers nobody has ever picked. You gather {find} for the pens at home.',
        'Out of the wind, where nobody treads, you find {find}, and take them home for the pens.',
    ],
    find_artefact: [
        'Half buried in the floor of the ruin, where the sand has blown away: {find}. Nobody has touched it in a very long time.',
        'In a niche in the wall, as if somebody put it there to keep: {find}.',
        'Your boot turns something up out of the rubble: {find}.',
    ],
    // Quank's scene on Taiar's islets, told in order.
    quank: [
        'Somebody is sitting on an upturned bucket at the end of the islet, fishing with no line on the rod.',
        'It is Quank. He does not look round. "I have not left the square," he says. "Do not tell anyone you saw me not leaving it."',
        'He reels in nothing, looks at it, and casts again. Then he reaches into his coat and presses something into your hand. "A tidbit," he says.',
        'When you look up from it, the bucket is empty and the islet is quiet. You have the feeling you will not find him out here again.',
    ],
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('islet_find_items'))) {
        await knex.schema.createTable('islet_find_items', (t) => {
            t.increments('id').primary();
            t.string('island', 100).notNullable();
            t.string('kind', 20).notNullable();
            t.string('item_name', 100).notNullable();
            t.integer('min_qty').notNullable().defaultTo(1);
            t.integer('max_qty').notNullable().defaultTo(1);
            t.integer('weight').notNullable().defaultTo(1);
            t.string('words_one', 200).nullable();
            t.string('words_many', 200).nullable();
            t.boolean('is_active').notNullable().defaultTo(true);
            t.unique(['island', 'kind', 'item_name']);
        });
    }
    if (!(await knex.schema.hasTable('player_artefacts_found'))) {
        await knex.schema.createTable('player_artefacts_found', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('item_id').notNullable().references('id').inTable('items');
            t.timestamp('found_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['player_id', 'item_id']);
        });
    }
    if (!(await knex.schema.hasTable('player_quank_met'))) {
        await knex.schema.createTable('player_quank_met', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('island', 100).notNullable();
            t.timestamp('met_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['player_id', 'island']);
        });
    }
    for (const key of ['young', 'flowers', 'artefact', 'quank']) {
        await knex('islet_find_kinds').insert({ key, skill: null, amount_min: 0, amount_max: 0, boost: 1, is_active: true }).onConflict('key').merge();
    }

    if (!(await hasContent(knex))) return;

    for (const [kind, item_name, min_qty, max_qty, weight, words_one, words_many] of ITEMS) {
        if (!(await knex('items').where({ name: item_name }).first('id'))) throw new Error(`islet_finds_rest: item "${item_name}" not found`);
        await knex('islet_find_items').insert({ island: ISLAND, kind, item_name, min_qty, max_qty, weight, words_one, words_many, is_active: true })
            .onConflict(['island', 'kind', 'item_name']).merge();
    }
    const tidbit = await knex('items').where({ name: TIDBIT.name }).first('id');
    if (tidbit) await knex('items').where({ id: tidbit.id }).update(TIDBIT);
    else await knex('items').insert({ ...TIDBIT, is_active: true });

    for (const a of ARTEFACTS) {
        const row = { name: a.name, type: 'curio', subtype: 'artefact', tier: 1, level_required: 1, set_island: ISLAND, description: a.description };
        const had = await knex('items').where({ name: a.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update(row);
        else await knex('items').insert({ ...row, is_active: true });
    }
    for (const [name, holds] of Object.entries(HOLDS)) {
        const islet = await knex('locations').where({ name }).whereNotNull('islet_kind').first('id');
        if (!islet) throw new Error(`islet_finds_rest: islet "${name}" not found`);
        for (const [kind, weight] of holds) {
            await knex('islet_finds').insert({ location_id: islet.id, kind, weight }).onConflict(['location_id', 'kind']).merge();
        }
    }
    await knex('voyage_lines').where({ island: ISLAND }).whereIn('moment', Object.keys(LINES)).delete();
    for (const [moment, texts] of Object.entries(LINES)) {
        // In order: Quank's scene is told line by line, oldest id first.
        for (const text of texts) await knex('voyage_lines').insert({ island: ISLAND, moment, text });
    }

    // The artefacts join the keepsakes' exhibit.
    const exhibit = await knex('museum_exhibits as e').join('museums as m', 'm.id', 'e.museum_id')
        .where({ 'm.island': ISLAND, 'e.name': 'From the Islets' }).first('e.id', 'e.match');
    if (exhibit) {
        const match = typeof exhibit.match === 'string' ? JSON.parse(exhibit.match) : (exhibit.match ?? []);
        if (!match.some((m: any) => m.subtype === 'artefact')) {
            match.push({ type: 'curio', subtype: 'artefact' });
            await knex('museum_exhibits').where({ id: exhibit.id }).update({ match: JSON.stringify(match) });
        }
        for (const a of [...ARTEFACTS, TIDBIT]) {
            const item = await knex('items').where({ name: a.name }).first('id');
            if (await knex('museum_cases').where({ item_id: item.id }).first()) continue;
            const [{ max }] = await knex('museum_cases').where({ exhibit_id: exhibit.id }).max('display_order as max');
            await knex('museum_cases').insert({ exhibit_id: exhibit.id, item_id: item.id, display_order: Number(max ?? -1) + 1 });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        await knex('voyage_lines').where({ island: ISLAND }).whereIn('moment', Object.keys(LINES)).delete();
        await knex('islet_finds').whereIn('kind', ['young', 'flowers', 'artefact', 'quank']).delete();
        // Items and museum cases stay, as with every content migration: players may hold them.
    }
    if (await knex.schema.hasTable('player_islet_finds')) await knex('player_islet_finds').whereIn('kind', ['young', 'flowers', 'artefact', 'quank']).delete();
    if (await knex.schema.hasTable('islet_find_kinds')) await knex('islet_find_kinds').whereIn('key', ['young', 'flowers', 'artefact', 'quank']).delete();
    await knex.schema.dropTableIfExists('player_quank_met');
    await knex.schema.dropTableIfExists('player_artefacts_found');
    await knex.schema.dropTableIfExists('islet_find_items');
}
