import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Walking finds become rows (CLAUDE.md §2: nouns are rows, text is content),
// with Antura's own (Nathan, 2026-11-21).
//
//   road_finds   one row per find. `region` is the island (`locations.region`)
//                whose roads turn it up, or null for any island. `rarity` is a
//                1-in-N chance for each minute of road walked
//                (services/travelEvents.ts rolls them; the rarest that hits in
//                a minute wins). `messages` is the journey-log lines, one
//                picked at random.
//
// Taiar's seven come across from the code that held them, with the same odds
// and lines (two lines take American spelling as they are touched). The coin,
// the arrowhead, and the Writ of Sending now turn up on any island's roads,
// beside the Four-Leaf Clover; Daisy, Taiaria, and Tal's Hope stay Taiar's.
//
// Antura's are similar to Taiar's, not copies, and three have real uses:
// feathers on the shore roads (arrows and the Kelpie's Bridle Charm; CLAUDE.md
// §8 welcomes more feather sources), meadowsweet by the Farefield hedges (ale's
// herb, brewed in Mettlefell), and now and then a garnet with the light already
// in it. The four new items are Antura's, for its museum.

type Find = { key: string; region: string | null; item: string; quantity: number; rarity: number; messages: string[] };

const TAIAR = 'Taiar Island';
const ANTURA = 'Antura';

const FINDS: Find[] = [
    { key: 'daisy', region: TAIAR, item: 'Daisy', quantity: 1, rarity: 10, messages: [
        'A scatter of daisies grew along the verge. You stooped to pick one as you passed.',
        'A single daisy nodded in the breeze at the roadside. You plucked it without breaking stride.',
        'You passed a sunlit patch of daisies and took one for the road.',
    ] },
    { key: 'taiaria', region: TAIAR, item: 'Taiaria', quantity: 1, rarity: 25, messages: [
        'Half-hidden in the shaded grass, a Taiaria bloom caught the light. You gathered it carefully.',
        'A Taiaria flower grew in the lee of a mossy stone. You knelt and picked it.',
        'The pale petals of a Taiaria stood out against the green. You added it to your pack.',
    ] },
    { key: 'tals_hope', region: TAIAR, item: "Tal's Hope", quantity: 1, rarity: 300, messages: [
        "You almost walked past it... a rare Tal's Hope, blooming alone at the roadside. A fortunate find.",
        "A flash of unusual color stopped you. A Tal's Hope, growing where little else dared. You gathered it gently.",
    ] },
    { key: 'writ_of_sending', region: null, item: 'Writ of Sending', quantity: 1, rarity: 500, messages: [
        'A letter lay folded in the grass by the milestone, its gray seal unbroken. Nobody was in sight to claim it.',
        'Caught in a bramble at the roadside was a sealed letter, weathered but whole. You worked it free.',
        'A carrier had dropped something here once: a folded writ, still sealed, half-sunk in the verge.',
    ] },
    { key: 'tarnished_coin', region: null, item: 'Tarnished Coin', quantity: 1, rarity: 50, messages: [
        'Something glinted in the dirt. You dug out an old tarnished coin, dropped here who-knows-when.',
        'Your boot turned over a tarnished coin half-buried in the mud. You pocketed it.',
        'A dull edge of metal in the path turned out to be an old coin, worn smooth by years.',
    ] },
    { key: 'chipped_arrowhead', region: null, item: 'Chipped Arrowhead', quantity: 1, rarity: 500, messages: [
        'Among the fallen leaves lay a chipped flint arrowhead, the remnant of some long-forgotten hunt.',
        'You spotted a chipped arrowhead wedged between two roots. It appears someone missed their mark here, long ago.',
    ] },
    { key: 'four_leaf_clover', region: null, item: 'Four-Leaf Clover', quantity: 1, rarity: 100000, messages: [
        'You froze mid-step. There, impossibly, among countless ordinary clovers... one with four leaves. Fortune itself smiled on this road.',
        'A patch of clover like any other... except one. Four perfect leaves. You could hardly believe your eyes.',
    ] },

    { key: 'sea_thrift', region: ANTURA, item: 'Sea Thrift', quantity: 1, rarity: 10, messages: [
        'Pink thrift grew in a cushion on the wall by the road. You pinched off a head of it.',
        'The verge was all salt grass and sea thrift. You picked a stem as you went by.',
        'A tuft of thrift clung to a crack in the rock and flowered anyway. You took one.',
    ] },
    { key: 'spring_gentian', region: ANTURA, item: 'Spring Gentian', quantity: 1, rarity: 25, messages: [
        'A gentian stood in the short turf, bluer than the sky over it. You knelt and picked it.',
        'Between two stones by the track, a single gentian was open. You gathered it.',
        'The blue caught your eye before the flower did. A spring gentian, low to the ground.',
    ] },
    { key: 'feathers_shore', region: ANTURA, item: 'Feathers', quantity: 3, rarity: 30, messages: [
        'Gulls had been at something on the shore road. You gathered up the feathers they left.',
        'A drift of gray feathers lay against a fence post, all from one bird. You took the best of them.',
        'Wind had piled feathers in the lee of a rock. Three were whole enough to keep.',
    ] },
    { key: 'meadowsweet_hedge', region: ANTURA, item: 'Meadowsweet', quantity: 1, rarity: 40, messages: [
        'Meadowsweet foamed along the ditch, smelling of honey. You cut a stem.',
        'The bottom of the hedge was white with meadowsweet. You took a handful.',
    ] },
    { key: 'wayfarers_star', region: ANTURA, item: "Wayfarer's Star", quantity: 1, rarity: 300, messages: [
        'On a ledge above the road, a white star of a flower. You climbed up for it, and it was worth the climb.',
        "A Wayfarer's Star, growing where the road turns. They say it marks a good journey. You took it with you.",
    ] },
    { key: 'bent_horseshoe', region: ANTURA, item: 'Bent Horseshoe', quantity: 1, rarity: 300, messages: [
        'A horseshoe lay in the rut, bent out of true and thrown long ago. You picked it up.',
        'Your foot found something hard in the mud: an old horseshoe, two nails still in it.',
    ] },
    { key: 'lit_garnet', region: ANTURA, item: 'Lit Garnet', quantity: 1, rarity: 1000, messages: [
        'Something glowed red between the stones of the road. A garnet, and the light already in it.',
        'A dark red stone lay in the grit at the roadside, warm to the touch and lit from inside. Someone, somewhere, is missing it.',
    ] },
];

const NEW_ITEMS = [
    { name: 'Sea Thrift', type: 'material', subtype: 'flower', value: 7,
      description: 'A pink pompom of a flower on a wiry stem. It grows where nothing else will, on sea walls and bare rock.' },
    { name: 'Spring Gentian', type: 'material', subtype: 'flower', value: 10,
      description: 'A small trumpet of a flower, so deep a blue it looks painted. It opens in the sun and shuts when a cloud comes over.' },
    { name: "Wayfarer's Star", type: 'material', subtype: 'flower', value: 13,
      description: 'A white flower of five pointed petals, furred like felt. Travelers on Antura count it lucky to find one on the road.' },
    { name: 'Bent Horseshoe', type: 'curio', subtype: 'curio', value: 13,
      description: 'An old horseshoe, worn thin at the toe and bent where a wheel went over it. Two of its nails are still in it.' },
];

async function upsertByName(knex: Knex, table: string, row: Record<string, unknown>) {
    const had = await knex(table).where({ name: row.name }).first('id');
    if (had) await knex(table).where({ id: had.id }).update(row);
    else await knex(table).insert(row);
}

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('road_finds'))) {
        await knex.schema.createTable('road_finds', (t) => {
            t.increments('id').primary();
            t.string('key', 50).notNullable().unique();
            t.string('region', 100).nullable();
            t.string('item_name', 100).notNullable();
            t.integer('quantity').notNullable().defaultTo(1);
            t.integer('rarity').notNullable();
            t.jsonb('messages').notNullable().defaultTo('[]');
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
        });
        await knex.raw('ALTER TABLE road_finds ADD CONSTRAINT road_finds_valid CHECK (quantity >= 1 AND rarity >= 1)');
    }
    if (!(await hasContent(knex))) return;

    for (const it of NEW_ITEMS) {
        await upsertByName(knex, 'items', { ...it, tier: 1, level_required: 1, island: ANTURA, is_active: true });
    }
    for (const f of FINDS) {
        if (!(await knex('items').where({ name: f.item }).first('id'))) throw new Error(`road_finds: item "${f.item}" not found`);
        const row = { region: f.region, item_name: f.item, quantity: f.quantity, rarity: f.rarity, messages: JSON.stringify(f.messages), is_active: true };
        const had = await knex('road_finds').where({ key: f.key }).first('id');
        if (had) await knex('road_finds').where({ id: had.id }).update(row);
        else await knex('road_finds').insert({ key: f.key, ...row });
    }
}

export async function down(knex: Knex): Promise<void> {
    // The finds go back into code with the code; the new items stay, as players may hold them.
    await knex.schema.dropTableIfExists('road_finds');
}
