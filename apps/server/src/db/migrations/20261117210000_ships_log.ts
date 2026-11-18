import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The ship's log (docs/sailing-spec.md §7 and §8; Nathan, 2026-11-06, 15, and 17).
//
//   ship_log_lines     what a watch can say, content: a kind (weather, sea,
//                      aboard, sighting, story, vast), the weather it belongs
//                      to (null for any), the leg it belongs to (out, on, home,
//                      or null for any), and for a story its key and step, told
//                      one step a watch, in order. Weighted.
//   ship_log_voyages   one per voyage: the sailor's own record, kept after the
//                      voyage ends (the newest SHIP_LOG_VOYAGES_KEPT a player).
//                      The voyage's weather is set when it puts to sea.
//   ship_log_legs      each leg's watches, written as the leg starts, each with
//                      the moment it falls due; the log shows a watch once its
//                      moment has passed, so nothing ticks (services/shipLog.ts).
//   Fathom Scale       the rare sighting (§8): something vast under the hull,
//                      about one watch in 300, near hunting's trophy rate for a
//                      minute's work. A trophy, worn and pawned like any other,
//                      and a case in From the Islets.

const ISLAND = 'Taiar Island';

const SCALE = {
    name: 'Fathom Scale', type: 'material', subtype: 'trophy', tier: 1, level_required: 1,
    description: 'A scale wider than your hand, the colour of deep water and hard as horn. Whatever shed it was big enough to lift a boat without noticing.',
};

type Line = { kind: string; text: string; weather?: string; leg?: string; story?: string; step?: number; weight?: number };

const W = (weather: string, texts: string[]): Line[] => texts.map(text => ({ kind: 'weather', weather, text }));
const K = (kind: string, texts: string[], leg?: string): Line[] => texts.map(text => ({ kind, text, leg }));
const S = (kind: 'story' | 'vast', story: string, texts: string[], weather?: string): Line[] =>
    texts.map((text, step) => ({ kind, story, step, text, weather }));

const LINES: Line[] = [
    ...W('fair', [
        'Fair weather. Blue sky, a steady breeze, and the sea glittering out to the edge of the world.',
        'The sun is warm on your back and the wind is fair.',
        'A few high clouds, white and harmless.',
        'Good sailing weather. Even the gulls seem pleased about it.',
        'The breeze holds steady from the west. You hardly touch the tiller.',
    ]),
    ...W('grey', [
        'A grey sky sits low over a grey sea. The kind of day nobody remembers.',
        'Drizzle, fine as flour, wets everything without ever seeming to fall.',
        'The clouds are thick and the wind comes and goes as it pleases.',
        'Grey all the way to the horizon, and the horizon not quite where you left it.',
        'A chill comes up off the water. You wish you had brought the other coat.',
    ]),
    ...W('calm', [
        'Flat calm. Not a breath of wind. You row.',
        'The sea is like oil. Every stroke of the oars leaves two rings behind.',
        'No wind at all. Sound carries for miles: a dog barking ashore, a door shutting.',
        'The sail hangs slack as washing. You take it in and row.',
        'The water is still enough to show you your own face, looking tired.',
    ]),
    ...W('fog', [
        'Fog. You can see the bow, and not much past it.',
        'The fog is so thick it beads on your eyebrows.',
        'Somewhere a gull cries, and the fog puts it right beside your ear.',
        'You steer by the swell and by guesswork. Mostly guesswork.',
        'The fog lifts for a moment, shows you open water, and closes again.',
    ]),
    ...W('squall', [
        'A squall comes over, dark and fast. Rain rattles on the planks.',
        'The wind gusts hard. You reef the sail and hold on.',
        'Rain in sheets. You bail with one hand and steer with the other.',
        'A wave breaks over the bow and soaks you to the skin. Then it rains.',
        'Between squalls the sun comes out, bright and useless, and then the next one arrives.',
    ]),
    ...K('sea', [
        'The swell runs long and even. The boat climbs each one and slides down the far side.',
        'Spray comes over the bow and finds the back of your neck, as it always does.',
        'The current pushes you north of your line. You lean on the oar and bring her back.',
        'Ahead, the water goes dark and choppy where two currents meet. You cross it with your knees braced.',
        'Weed drifts past in long brown ropes.',
        'The water under the boat turns from green to blue as the bottom drops away.',
        'The tide is with you. You hardly need the oars.',
        'Small fish break the surface all round the boat, running from something below.',
        'The sea smells of salt and cold stone.',
        'The water clucks against the planks like a hen.',
    ]),
    ...K('sea', [
        'Taiar is a grey line behind you now, low on the water.',
        'The harbour wall drops away behind you, and the noise of the town with it.',
    ], 'out'),
    ...K('sea', [
        'The islet you left shrinks behind you to a smudge, then to nothing.',
    ], 'on'),
    ...K('sea', [
        'The harbour comes up out of the sea ahead, and the smoke of the town above it.',
        'You can smell the land before you see it: woodsmoke, and fish, and tar.',
    ], 'home'),
    ...K('aboard', [
        'You bail. The water comes back. You bail again.',
        'You check the lashings on the mast. Tight. You check them again anyway.',
        'You eat a heel of bread with salt on it, looking at nothing in particular.',
        'A splinter on the oar handle catches your palm. You suck it out and row on.',
        'You pull your coat tighter. The wind finds the gap at the collar.',
        'Your shoulders have started to ache in the place they always ache.',
        'You sing under your breath to keep the stroke even.',
        'Something rolls about under the thwart. An apple, from some earlier trip. You eat it.',
        'You stand to stretch, and sit down again rather quickly.',
        'You take a long drink from the water cask. It tastes of the cask.',
        'You let the boat drift a moment and rest your arms.',
        'A knot you tied this morning has worked loose. You tie it again, better.',
    ]),
    ...K('sighting', [
        'Gulls wheel over a patch of water, crying. Fish there, or what is left of them.',
        'A cormorant stands on a floating log with its wings held out to dry, like washing on a line.',
        'Seals lie hauled out on a rock, too comfortable to look at you.',
        'A porpoise rolls close alongside, blows, and is gone.',
        'Far off, a spout. Then another. Whales, going somewhere in no hurry.',
        'A fishing boat out of Talador, nets out, a long way off. Someone aboard waves.',
        'A gannet folds itself up and drops into the sea like a thrown knife.',
        'An empty crate drifts past, its stencil too faded to read.',
        'A puffin bobs on the swell, looks at you, and decides against you.',
        'A skein of geese goes over, high up, heading somewhere warmer.',
        'A jellyfish the size of a cartwheel drifts below, opening and closing like a slow hand.',
        'Smoke rises from somewhere along the coast. A bonfire, or someone curing fish.',
        'A tern hangs over the bow, then drops, and comes up with a sprat.',
    ]),

    // Stories: one step a watch, in order, never two in a leg.
    ...S('story', 'other_boat', [
        'Off to the north there is another boat, the size of yours, on the same course. You raise a hand. So does the figure at its tiller.',
        'You change course to get a better look. They change course too, at the same moment, by the same amount.',
        'When you look again there is only the water, and your own wake going back the way you came.',
    ]),
    ...S('story', 'bell', [
        'A bell rings somewhere under the boat. One stroke, slow and deep, like a church tower a long way down.',
        'You wait for the second stroke. It comes when you have stopped waiting, and it is closer.',
        'Nothing after that. The water looks just as it did, which is somehow worse.',
    ]),
    ...S('story', 'seal', [
        'A seal has been following the boat for some time. It keeps an oar\'s length off the stern and watches you with great seriousness.',
        'When you look straight at it, it dives, and comes up on the other side with a fish in its mouth, as if to show you how it is done.',
        'It eats the fish in front of you, slowly, and leaves.',
    ]),
    ...S('story', 'bottle', [
        'A bottle bobs past, corked and sealed with wax. You fish it out with the boathook.',
        'Inside is a note in a careful hand: "If found, I am well. Do not come looking." It is not signed, and it is not dated.',
        'You put the note back in the bottle and the bottle back in the sea. It seems the right thing to do with it.',
    ]),
    ...S('story', 'song', [
        'Somebody is singing across the water. A working song, the kind people haul rope to, though there is no ship in sight.',
        'You find you know the chorus. You have never heard the song before in your life.',
    ]),
    ...S('story', 'raft', [
        'A raft drifts across your bow: four planks lashed together, and a cat asleep on them in the sun.',
        'You bring the boat alongside. The cat opens one eye, considers you, and closes it again.',
        'You leave it be. Wherever it is going, it seems to know.',
    ]),
    ...S('story', 'warm_water', [
        'Your hand trails over the side and finds the water warm. Not sun-warm. Warm like a bath somebody has just got out of.',
        'A hundred strokes on it is as cold as it ever was, and you could not find the place again if you tried.',
    ]),
    ...S('story', 'gulls', [
        'A gull lands on the bow and looks at your lunch.',
        'Another lands beside it. Then four more. You count eleven before you give up and eat faster.',
        'They leave all at once, as if a bell had gone that only gulls can hear. Most of your lunch goes with them.',
    ]),
    ...S('story', 'old_net', [
        'The oar snags on something. You haul up an old net, green and rotten, with a float of carved wood still knotted to it.',
        'Somebody burned a mark into the float, a fish inside a ring. The old Talador fishing families marked their gear like that, once.',
        'You turn it over in your hands for a while before you let it go back over the side.',
    ]),
    ...S('story', 'voice', [
        'Someone calls your name across the water. Clear as anything. Just the once.',
        'There is nobody. There is nothing out here to call from. You row on a little faster than you were.',
    ]),
    ...S('story', 'fisherman', [
        'An old man in a coracle is fishing in the middle of nowhere. He nods as you pass, as if you had met on a lane at home.',
        '"Biting?" you ask. "Not yet," he says. "Give it time." He has the look of a man who has given it a great deal of time already.',
    ]),
    ...S('story', 'driftwood', [
        'A piece of driftwood floats by with a face carved into it, worn soft by the sea.',
        'It turns over slowly as it passes. There is another face on the back, and that one is smiling.',
    ]),
    ...S('story', 'fog_mast', [
        'Something tall moves in the fog to port. A mast, perhaps. Perhaps not.',
        'It goes by without a sound. When the fog thins there is open water where it was, and gulls sitting on it.',
    ], 'fog'),
    ...S('story', 'mirror', [
        'The water is so still that the whole sky lies on it. For a moment you cannot tell which way is up.',
        'You put an oar in to be sure. The sky breaks into rings and mends itself behind you.',
    ], 'calm'),
    ...S('story', 'hat', [
        'A gust takes your hat clean off your head and out over the water.',
        'The next gust brings it back and drops it in the bottom of the boat, upside down and full of rain.',
    ], 'squall'),

    // The rare sighting (§8): its last step hands over the Fathom Scale.
    ...S('vast', 'lifted', [
        'The boat lifts. Not on a wave: on something broad and slow, rising under the hull. You grip the sides and hold your breath.',
        'It sinks away again into the dark, and the boat settles. Stuck to the planking where it brushed you is a scale wider than your hand.',
    ]),
    ...S('vast', 'shadow', [
        'A shadow passes under the boat, and keeps passing. You count your heartbeats. You reach thirty before the far end of it goes by.',
        'Afterward, turning in the wake, there is a single scale the colour of deep water. You lean over and take it.',
    ]),
    ...S('vast', 'back', [
        'Every gull goes quiet at once. A cable\'s length off, the sea swells into a long grey back, ridged like a hill, and rolls under without a splash.',
        'As the water flattens, something it shed comes up turning like a leaf: a scale, hard as horn. You row over and lift it out.',
    ]),
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('ship_log_lines'))) {
        await knex.schema.createTable('ship_log_lines', (t) => {
            t.increments('id').primary();
            t.string('island', 100).nullable();          // null: any island's waters
            t.string('kind', 20).notNullable();           // weather, sea, aboard, sighting, story, vast
            t.string('weather', 20).nullable();           // fair, grey, calm, fog, squall; null for any
            t.string('leg', 10).nullable();               // out, on, home; null for any
            t.string('story_key', 40).nullable();
            t.integer('step').notNullable().defaultTo(0);
            t.text('text').notNullable();
            t.integer('weight').notNullable().defaultTo(1);
            t.boolean('is_active').notNullable().defaultTo(true);
        });
    }
    if (!(await knex.schema.hasTable('ship_log_voyages'))) {
        await knex.schema.createTable('ship_log_voyages', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.string('boat', 100).notNullable();
            t.string('home', 100).notNullable();
            t.string('weather', 20).notNullable();
            t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('ended_at', { useTz: true }).nullable();
            t.index(['player_id', 'started_at']);
        });
    }
    if (!(await knex.schema.hasTable('ship_log_legs'))) {
        await knex.schema.createTable('ship_log_legs', (t) => {
            t.increments('id').primary();
            t.integer('voyage_id').notNullable().references('id').inTable('ship_log_voyages').onDelete('CASCADE');
            t.string('leg', 10).notNullable();
            t.string('to_name', 100).notNullable();
            t.timestamp('started_at', { useTz: true }).notNullable();
            t.timestamp('arrives_at', { useTz: true }).notNullable();
            t.jsonb('watches').notNullable();             // [{ at, kind, text, line }]
            t.jsonb('landing').nullable();                // the arrival card's lines, once arrived
            t.boolean('arrived').notNullable().defaultTo(false);
            // The rare sighting is paid once, on arrival, by flipping this.
            t.boolean('sighting_paid').notNullable().defaultTo(false);
            t.index(['voyage_id']);
        });
    }
    if (!(await knex.schema.hasColumn('player_voyages', 'log_voyage_id'))) {
        await knex.schema.alterTable('player_voyages', (t) => {
            t.integer('log_voyage_id').nullable().references('id').inTable('ship_log_voyages').onDelete('SET NULL');
        });
    }

    if (!(await hasContent(knex))) return;

    // Lines are replaced whole, so a rerun never doubles them.
    await knex('ship_log_lines').where({ island: ISLAND }).delete();
    await knex('ship_log_lines').insert(LINES.map(l => ({
        island: ISLAND, kind: l.kind, weather: l.weather ?? null, leg: l.leg ?? null,
        story_key: l.story ?? null, step: l.step ?? 0, text: l.text, weight: l.weight ?? 1, is_active: true,
    })));

    const had = await knex('items').where({ name: SCALE.name }).first('id');
    if (had) await knex('items').where({ id: had.id }).update(SCALE);
    else await knex('items').insert({ ...SCALE, is_active: true });

    // A case in From the Islets, by name: its kind (trophy) is shared with the fighters' trophies.
    const exhibit = await knex('museum_exhibits as e').join('museums as m', 'm.id', 'e.museum_id')
        .where({ 'm.island': ISLAND, 'e.name': 'From the Islets' }).first('e.id', 'e.match');
    if (!exhibit) throw new Error('ships_log: exhibit "From the Islets" not found (run 20261117170000 first)');
    const match = typeof exhibit.match === 'string' ? JSON.parse(exhibit.match) : (exhibit.match ?? []);
    if (!match.some((m: any) => m.name === SCALE.name)) {
        match.push({ name: SCALE.name });
        await knex('museum_exhibits').where({ id: exhibit.id }).update({ match: JSON.stringify(match) });
    }
    const scale = await knex('items').where({ name: SCALE.name }).first('id');
    if (!(await knex('museum_cases').where({ item_id: scale.id }).first())) {
        const [{ max }] = await knex('museum_cases').where({ exhibit_id: exhibit.id }).max('display_order as max');
        await knex('museum_cases').insert({ exhibit_id: exhibit.id, item_id: scale.id, display_order: Number(max ?? -1) + 1 });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_voyages', 'log_voyage_id')) {
        await knex.schema.alterTable('player_voyages', (t) => { t.dropColumn('log_voyage_id'); });
    }
    await knex.schema.dropTableIfExists('ship_log_legs');
    await knex.schema.dropTableIfExists('ship_log_voyages');
    await knex.schema.dropTableIfExists('ship_log_lines');
    if (await hasContent(knex)) {
        const exhibit = await knex('museum_exhibits as e').join('museums as m', 'm.id', 'e.museum_id')
            .where({ 'm.island': ISLAND, 'e.name': 'From the Islets' }).first('e.id', 'e.match');
        if (exhibit) {
            const match = typeof exhibit.match === 'string' ? JSON.parse(exhibit.match) : (exhibit.match ?? []);
            await knex('museum_exhibits').where({ id: exhibit.id })
                .update({ match: JSON.stringify(match.filter((m: any) => m.name !== SCALE.name)) });
        }
        // The item and its case stay, as with every content migration: players may hold it.
    }
}
