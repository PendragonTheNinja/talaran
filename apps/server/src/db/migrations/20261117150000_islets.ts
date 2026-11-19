import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Boats, step 2, first part (docs/sailing-spec.md §6 and §10, docs/islets-plan.md;
// Nathan, 2026-11-15 to 17): putting to sea, landing on an islet, the
// strandline, and sailing on or home. The work finds come next.
//
//   locations.islet_kind     'common', 'seldom', or 'rare' on an islet, null
//   locations.islet_weight   elsewhere; the weight is its share of the voyages
//                            that leave its island. Islets have no roads and
//                            are not is_accessible, so no minimap, merchant,
//                            event, or rumour picks them.
//   player_voyages           a player at sea or on an islet: the boat, the port
//                            they sailed from, and how many landings this
//                            voyage has made (three at most, then port).
//   player_islet_finds_seen  the first landing on each islet, per player (the
//                            islet map fills in from it).
//   strandline_finds         the sure find on every shore, per island, by
//                            weight. 'coins' is a row of its own.
//   voyage_lines             what the sea and each islet say: setting out,
//                            arriving, sailing on, coming home, the strandline.
//                            Several of each, picked at random. Text is content.
//   The Skiff                1.0 to 0.667 of a voyage leg's base time, closed by
//                            Wayfaring as a mount's is.
//
// The eight islets are the mock of docs/islets-plan.md §3, with placeholder
// names until the islet maps are drawn and players may name them (off through
// the alpha). Pictures fall back as any place without one does.

const ISLAND = 'Taiar Island';

const ISLETS: { name: string; kind: string; weight: number; description: string; arrive: string[] }[] = [
    {
        name: 'The Wooded Islet', kind: 'common', weight: 16,
        description: 'A hump of black rock with a wood on its back, the trees leaning all one way from the wind. The landing is a shelf of shingle no wider than the Skiff.',
        arrive: [
            'You run the bow up onto the shingle. Somewhere in the trees a woodpecker is working, and stops.',
            'The trees come right down to the waterline here. Their roots hold the bank together like knuckles.',
            'Pine needles, an inch deep, and the smell of resin. Nobody has cut a tree on this islet in living memory.',
        ],
    },
    {
        name: 'The Rocky Islet', kind: 'common', weight: 16,
        description: 'Grey stone heaved up out of the sea in slabs, split and tilted, with thrift in the cracks. The gulls own it.',
        arrive: [
            'You find a cleft between two slabs and wedge the Skiff into it. The gulls go up all at once, shouting.',
            'Bare stone, warm from the sun. A seam of something paler runs through it near the waterline.',
            'Every footstep rings. The whole islet is one rock, and it sounds hollow in places.',
        ],
    },
    {
        name: 'The Sandbar', kind: 'common', weight: 16,
        description: 'A long tongue of pale sand that comes and goes with the tide. At low water it is half a mile long; at high water it is barely there.',
        arrive: [
            'The keel grates on sand a long way out. You climb over the side and wade the rest.',
            'Ribbed sand, firm as a road, running out to nothing. Your footprints fill with water behind you.',
            'The tide is out, and the bar is wide and shining. There are holes everywhere, and things living in them.',
        ],
    },
    {
        name: 'The Reef', kind: 'common', weight: 16,
        description: 'A ring of rock just under the surface, with a lagoon inside it as still as a pond. Fish crowd the gaps in the ring.',
        arrive: [
            'You thread the gap in the reef with the oars shipped and drift into the lagoon. The water inside is glass.',
            'The swell breaks white on the outer edge and never reaches you. Inside, it is so quiet you can hear fish turning.',
            'Weed streams from the rocks like hair. You tie up to an old Ambren ring, green with salt, that somebody drove in long ago.',
        ],
    },
    {
        name: 'The Heath Islet', kind: 'common', weight: 16,
        description: 'Low and round, covered in heather and gorse, with a pond in the middle that the birds drink from. Rabbits have dug it hollow.',
        arrive: [
            'The gorse is in flower and the whole islet smells of coconut. You pull the Skiff up into the heather.',
            'A hare sits up, looks at you, and decides you are not worth running from.',
            'Heather to the knee, and a pond at the middle with a heron standing in it as if it owned the place.',
        ],
    },
    {
        name: 'The Sea Stack', kind: 'seldom', weight: 8,
        description: 'A pillar of rock standing alone out of deep water, every ledge white with birds. Getting ashore means climbing.',
        arrive: [
            'There is no beach. You make the Skiff fast to a spur of rock and climb, with the birds screaming at every handhold.',
            'The noise is the first thing: ten thousand birds, all talking at once. The smell is the second.',
            'From the top you can see Taiar laid out along the horizon, smaller than you thought it was.',
        ],
    },
    {
        name: 'The Drowned Quarry', kind: 'seldom', weight: 8,
        description: 'Somebody cut stone here once, and the sea came in after them. Square-sided pools, a crane rotted down to its pegs, and steps that go down into the water.',
        arrive: [
            'You tie up to an Ambren ring set in a cut wall. Whoever worked this stone left in a hurry, and left their wedges.',
            'The steps go down into green water and keep going. You can see them for a long way.',
            'Square pools, square walls, square shadows. It is the only straight thing for miles of sea.',
        ],
    },
    {
        name: 'The Ruin', kind: 'rare', weight: 4,
        description: 'Walls of dressed stone with nothing above them, a doorway facing the sea, and a stair going nowhere. No one on Taiar will say who built it.',
        arrive: [
            'Fog lifts off the water just as you come in, and there it is: walls, a doorway, a stair, and no roof.',
            'The doorway faces the sea, as if whoever lived here watched for someone. The sill is worn hollow.',
            'You have heard of this place in the tavern, and did not believe it. You still are not sure you do.',
        ],
    },
];

const LINES: Record<string, string[]> = {
    set_out: [
        'You push off from the slip and dig the oars in. Talador shrinks behind you.',
        'The harbour water is flat and brown. Past the breakwater it turns green and starts to lift.',
        'A boy on the quay shouts something after you. The wind takes it.',
        'You row until the gulls stop following, then row some more.',
        'The swell finds the Skiff and rocks her like a cradle. The land goes blue, then grey.',
    ],
    sail_on: [
        'You push off again. The islet slides away astern, and the open sea takes its place.',
        'Back to the oars. There is always another rock out here, if you look.',
        'You leave it behind. Whatever else was there will keep.',
        'The water deepens and darkens under you as you pull away.',
    ],
    home: [
        'Talador comes up out of the haze: the tower first, then the roofs, then the smoke.',
        'You come in on the evening tide with your arms aching and run the Skiff up the slip.',
        'The harbour smells of fish and tar. After the islets, it smells like home.',
        'Someone on the quay takes your line without being asked. That is how you know you are back.',
        'The breakwater, the moorings, the slip. You ship the oars and let her glide the last of it.',
    ],
    strandline: [
        'Along the tideline, among the weed and the cork floats, you find {find}.',
        'The sea leaves something on every shore. Here it left {find}.',
        'You walk the wrack line before you do anything else, and turn up {find}.',
        'Half buried in the drift, where the last high tide dropped it: {find}.',
        'Caught in a tangle of rope and kelp at the water\'s edge, {find}.',
    ],
};

// [kind or item name, min, max, weight, words for one, words for many ({n})];
// 'coins' pays gold. The words are how the find reads in a line.
const STRANDLINE: [string, number, number, number, string, string][] = [
    ['coins', 3, 12, 30, 'a coin', '{n} coins, green with the sea'],
    ['Onion Seeds', 2, 4, 8, 'an onion seed', 'a twist of onion seed, {n} or so'],
    ['Carrot Seeds', 2, 4, 8, 'a carrot seed', 'a few carrot seeds, {n} of them, dry in a split sack'],
    ['Turnip Seeds', 2, 4, 8, 'a turnip seed', '{n} turnip seeds in the corner of a broken crate'],
    ['Pea Seeds', 1, 3, 6, 'a dried pea, good for sowing', '{n} dried peas, good for sowing'],
    ['Wild Grain', 2, 5, 10, 'a head of wild grain', '{n} heads of wild grain, washed down off some field'],
    ['River Mussel', 1, 2, 8, 'a mussel, shut tight', '{n} mussels, shut tight'],
    ['Amber', 1, 1, 6, 'a lump of amber the size of a thumbnail', '{n} lumps of amber'],
    ['Bird Nest', 1, 1, 5, 'a bird\'s nest blown down off the rocks', '{n} birds\' nests'],
    ['Locked Rusty Chest', 1, 1, 3, 'a small chest, rusted shut', '{n} small chests, rusted shut'],
];

const SKIFF_SPEED = { speed_start: 1.0, speed_floor: 0.667 };

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('locations', 'islet_kind'))) {
        await knex.schema.alterTable('locations', (t) => {
            t.string('islet_kind', 10).nullable();
            t.integer('islet_weight').nullable();
        });
    }
    if (!(await knex.schema.hasTable('player_voyages'))) {
        await knex.schema.createTable('player_voyages', (t) => {
            t.integer('player_id').primary().references('id').inTable('players').onDelete('CASCADE');
            t.integer('vessel_type_id').notNullable().references('id').inTable('vessel_types');
            t.integer('home_location_id').notNullable().references('id').inTable('locations');
            t.integer('landings').notNullable().defaultTo(0);
            t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }
    if (!(await knex.schema.hasTable('player_islets_found'))) {
        await knex.schema.createTable('player_islets_found', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('location_id').notNullable().references('id').inTable('locations').onDelete('CASCADE');
            t.timestamp('found_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.integer('landings').notNullable().defaultTo(1);
            t.primary(['player_id', 'location_id']);
        });
    }
    if (!(await knex.schema.hasTable('strandline_finds'))) {
        await knex.schema.createTable('strandline_finds', (t) => {
            t.increments('id').primary();
            t.string('island', 100).notNullable();
            t.string('item_name', 100).notNullable();     // or 'coins'
            t.integer('min_qty').notNullable().defaultTo(1);
            t.integer('max_qty').notNullable().defaultTo(1);
            t.integer('weight').notNullable().defaultTo(1);
            t.string('words_one', 200).nullable();          // how one reads in a line
            t.string('words_many', 200).nullable();         // and several: {n} is the count
            t.boolean('is_active').notNullable().defaultTo(true);
            t.unique(['island', 'item_name']);
        });
    }
    if (!(await knex.schema.hasTable('voyage_lines'))) {
        await knex.schema.createTable('voyage_lines', (t) => {
            t.increments('id').primary();
            t.string('island', 100).notNullable();
            t.string('moment', 20).notNullable();          // set_out, arrive, sail_on, home, strandline
            t.integer('location_id').nullable().references('id').inTable('locations').onDelete('CASCADE');
            t.text('text').notNullable();
            t.boolean('is_active').notNullable().defaultTo(true);
        });
    }

    if (!(await hasContent(knex))) return;

    for (const [name] of STRANDLINE) {
        if (name !== 'coins' && !(await knex('items').where({ name }).first('id'))) throw new Error(`islets: item "${name}" not found`);
    }
    const speed = await knex('vessel_types').where({ key: 'skiff' }).update(SKIFF_SPEED);
    if (speed !== 1) throw new Error('islets: vessel type "skiff" not found (run 20261117140000_boats first)');

    // Lines are replaced whole, so a rerun never doubles them.
    await knex('voyage_lines').where({ island: ISLAND }).delete();
    for (const [moment, texts] of Object.entries(LINES)) {
        await knex('voyage_lines').insert(texts.map(text => ({ island: ISLAND, moment, text })));
    }

    for (const islet of ISLETS) {
        const row = {
            name: islet.name, region: ISLAND, type: 'islet', description: islet.description,
            is_safe: true, is_accessible: false, islet_kind: islet.kind, islet_weight: islet.weight,
        };
        const existing = await knex('locations').where({ name: islet.name }).first('id');
        let id: number;
        if (existing) {
            await knex('locations').where({ id: existing.id }).update({ ...row, updated_at: knex.fn.now() });
            id = existing.id;
        } else {
            const [ins] = await knex('locations').insert(row).returning('id');
            id = typeof ins === 'object' ? ins.id : ins;
        }
        await knex('voyage_lines').insert(islet.arrive.map(text => ({ island: ISLAND, moment: 'arrive', location_id: id, text })));
    }

    for (const [item_name, min_qty, max_qty, weight, words_one, words_many] of STRANDLINE) {
        await knex('strandline_finds').insert({ island: ISLAND, item_name, min_qty, max_qty, weight, words_one, words_many, is_active: true })
            .onConflict(['island', 'item_name']).merge();
    }
}

export async function down(knex: Knex): Promise<void> {
    // Anyone standing on an islet goes back to the port they sailed from.
    if (await knex.schema.hasTable('player_voyages')) {
        const voyages = await knex('player_voyages').select('player_id', 'home_location_id');
        for (const v of voyages) await knex('players').where({ id: v.player_id }).update({ current_location_id: v.home_location_id });
    }
    if (await knex.schema.hasColumn('locations', 'islet_kind')) {
        const islets = await knex('locations').whereNotNull('islet_kind').pluck('id');
        if (islets.length) {
            const talador = await knex('locations').where({ name: 'Talador' }).first('id');
            if (talador) await knex('players').whereIn('current_location_id', islets).update({ current_location_id: talador.id });
            await knex('player_actions').whereIn('location_id', islets).delete();
        }
    }
    await knex.schema.dropTableIfExists('voyage_lines');
    await knex.schema.dropTableIfExists('strandline_finds');
    await knex.schema.dropTableIfExists('player_islets_found');
    await knex.schema.dropTableIfExists('player_voyages');
    // The islet rows stay (other rows may point at them: exploration, chat);
    // without the columns they are plain, unreachable places.
    if (await knex.schema.hasColumn('locations', 'islet_kind')) {
        await knex.schema.alterTable('locations', (t) => { t.dropColumn('islet_kind'); t.dropColumn('islet_weight'); });
    }
    if (await hasContent(knex)) await knex('vessel_types').where({ key: 'skiff' }).update({ speed_start: null, speed_floor: null });
}
