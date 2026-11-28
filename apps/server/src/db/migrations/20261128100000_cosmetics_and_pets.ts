import type { Knex } from 'knex';

// Supporter cosmetics and pets (docs/taler-perks-ideas.md, docs/pets-spec.md;
// Nathan, 2026-11-28: the plumbing now, the art separately).
//
//   players.avatar_frame       frame worn around the avatar (services/cosmetics.ts FRAMES)
//   players.profile_backdrop   picture behind the profile (BACKDROPS)
//   players.worn_pet           pet shown beside the name (pets.key)
//   player_shops.sign_style    the shop's sign (SHOP_SIGNS)
//   player_shops.awning_color  the shop's awning (AWNING_COLORS)
//   chat_messages.emotes       the emote keys this line may draw, fixed when it
//                              was sent from what the sender owned then
//   pets                       one row a pet: content (registered in lib/contentTables.ts)
//   player_pets                who has found which; the unique pair is the gate
//   chronicle pet_found        a deed and its verses

const PETS: {
    key: string; name: string; skill: string | null; kind: 'skill' | 'supporter' | 'holiday';
    chance_one_in: number | null; supporter_cents: number | null; emoji: string; description: string; found_line: string | null;
}[] = [
    // Skill pets: about 2,920 hours of the skill on average (its actions an hour x 2,920).
    { key: 'stoat', name: 'Stoat', skill: 'Woodcutting', kind: 'skill', chance_one_in: 205000, supporter_cents: null, emoji: '🦦', description: 'A stoat that took to living in the woodpile.', found_line: '{player} has found a stoat living in the woodpile, and it has decided to stay.' },
    { key: 'rock-wren', name: 'Rock Wren', skill: 'Mining', kind: 'skill', chance_one_in: 350000, supporter_cents: null, emoji: '🐦', description: 'A small brown wren that nests in the spoil heaps.', found_line: '{player} has a rock wren riding on their pickaxe now. Nobody asked it to.' },
    { key: 'otter-pup', name: 'Otter Pup', skill: 'Fishing', kind: 'skill', chance_one_in: 146000, supporter_cents: null, emoji: '🦦', description: 'An otter pup that steals bait and gives back fish.', found_line: '{player} has been adopted by an otter pup at the water\'s edge.' },
    { key: 'hedgehog', name: 'Hedgehog', skill: 'Foraging', kind: 'skill', chance_one_in: 175000, supporter_cents: null, emoji: '🦔', description: 'A hedgehog with a leaf stuck on its spines.', found_line: '{player} turned over a pile of leaves and found a hedgehog that will not leave them alone.' },
    { key: 'fox-kit', name: 'Fox Kit', skill: 'Hunting', kind: 'skill', chance_one_in: 146000, supporter_cents: null, emoji: '🦊', description: 'A red fox kit that follows the scent of the hunt.', found_line: 'A fox kit has followed {player} home from the hunting grounds.' },
    { key: 'sawdust-mouse', name: 'Sawdust Mouse', skill: 'Carpentry', kind: 'skill', chance_one_in: 263000, supporter_cents: null, emoji: '🐭', description: 'A mouse dusted pale with sawdust.', found_line: '{player} has a mouse living under their workbench, and it is always covered in sawdust.' },
    { key: 'ember-sprite', name: 'Ember Sprite', skill: 'Smithing', kind: 'skill', chance_one_in: 205000, supporter_cents: null, emoji: '🔥', description: 'A coal that did not go out, and has eyes.', found_line: 'One of the coals in {player}\'s forge has opened its eyes and will not go out.' },
    { key: 'kitchen-cat', name: 'Kitchen Cat', skill: 'Cooking', kind: 'skill', chance_one_in: 292000, supporter_cents: null, emoji: '🐈', description: 'A tabby cat that sits by the hearth and waits.', found_line: 'A kitchen cat has claimed {player}\'s hearth, and {player} along with it.' },
    { key: 'magpie', name: 'Magpie', skill: 'Crafting', kind: 'skill', chance_one_in: 175000, supporter_cents: null, emoji: '🐦‍⬛', description: 'A magpie with an eye for anything that shines.', found_line: 'A magpie has taken a liking to {player}\'s bench, and to everything shiny on it.' },
    { key: 'field-hare', name: 'Field Hare', skill: 'Farming', kind: 'skill', chance_one_in: 35000, supporter_cents: null, emoji: '🐇', description: 'A brown hare that lives among the wheat.', found_line: 'A field hare has moved into {player}\'s furrows and shows no sign of moving out.' },
    { key: 'lamb', name: 'Lamb', skill: 'Husbandry', kind: 'skill', chance_one_in: 73000, supporter_cents: null, emoji: '🐑', description: 'A white lamb that follows at your heel.', found_line: 'A lamb has been following {player} around the homestead all morning, and now it is theirs.' },
    { key: 'wisp', name: 'Wisp', skill: 'Talar', kind: 'skill', chance_one_in: 175000, supporter_cents: null, emoji: '✨', description: 'A blue-white light that drifted up from the Rift.', found_line: 'A small light rose out of the Rift and settled beside {player}. It has not gone back.' },
    { key: 'road-dog', name: 'Road Dog', skill: 'Wayfaring', kind: 'skill', chance_one_in: 44000, supporter_cents: null, emoji: '🐕', description: 'A scruffy brown dog that knows every road.', found_line: 'A scruffy dog has walked the last three roads beside {player}, and seems to mean to walk the rest.' },
    { key: 'war-hound-pup', name: 'War Hound Pup', skill: 'Melee', kind: 'skill', chance_one_in: 175000, supporter_cents: null, emoji: '🐶', description: 'A bold war hound puppy in a tiny spiked collar.', found_line: 'A war hound pup has picked {player} to follow into every fight.' },
    { key: 'tortoise', name: 'Tortoise', skill: 'Defense', kind: 'skill', chance_one_in: 175000, supporter_cents: null, emoji: '🐢', description: 'A tortoise whose shell looks like a little shield.', found_line: 'A tortoise has wandered up to {player} after the fight and will not be moved.' },
    { key: 'ox-calf', name: 'Ox Calf', skill: 'Constitution', kind: 'skill', chance_one_in: 175000, supporter_cents: null, emoji: '🐂', description: 'A sturdy ox calf that never tires.', found_line: 'An ox calf has stood beside {player} through one fight too many to be sent home now.' },
    // Supporter pets: given with each supporter step, taken back with it.
    { key: 'candle-moth', name: 'Candle Moth', skill: null, kind: 'supporter', chance_one_in: null, supporter_cents: 500, emoji: '🦋', description: 'A pale moth with a candle-flame glow. A thank-you for supporting Talaran.', found_line: null },
    { key: 'lantern-owlet', name: 'Lantern Owlet', skill: null, kind: 'supporter', chance_one_in: null, supporter_cents: 2000, emoji: '🦉', description: 'A small owl with lantern-gold eyes. A thank-you for supporting Talaran.', found_line: null },
    { key: 'badger', name: 'Badger', skill: null, kind: 'supporter', chance_one_in: null, supporter_cents: 5000, emoji: '🦡', description: 'A badger, broad and steady. A thank-you for supporting Talaran.', found_line: null },
    { key: 'stag-fawn', name: 'Stag Fawn', skill: null, kind: 'supporter', chance_one_in: null, supporter_cents: 10000, emoji: '🦌', description: 'A fawn with tiny golden antler buds. A thank-you for supporting Talaran.', found_line: null },
    { key: 'firebird-chick', name: 'Firebird Chick', skill: null, kind: 'supporter', chance_one_in: null, supporter_cents: 100000, emoji: '🐦‍🔥', description: 'A small gold and crimson firebird chick. A thank-you for supporting Talaran.', found_line: null },
    // Holiday pets: sold in the store in their season (services/cosmetics.ts).
    { key: 'snow-robin', name: 'Snow Robin', skill: null, kind: 'holiday', chance_one_in: null, supporter_cents: null, emoji: '🐦', description: 'A robin with a red breast and a dusting of snow.', found_line: null },
];

const DEED = { key: 'pet_found', section: 'island', base_weight: 45, max_per_page: 2, enabled: true, label: 'A pet found' };
const VERSES = [
    '{player} came home from a day of {skill} with company: a {pet}, and it is staying.',
    'A {pet} has chosen {player}. Nobody chooses a {pet}; it goes the other way round.',
    'After a long while at {skill}, {player} has a {pet} to show for it, and is showing it to everyone.',
    'Some work for years and never see one. {player} has a {pet} now.',
    'The {pet} that has been following {player} about turns out to be theirs to keep.',
    '{player} found a {pet}, or the {pet} found {player}. Either way, they are together now.',
    'Ask {player} about the {pet}. Actually, do not. They will not stop.',
    'Word is that {player} has a {pet}. Word is right.',
    'A {pet} sat down beside {player} today and has not got up since.',
    'There is a {pet} in {player}\'s company now, earned the slow way, at {skill}.',
];

function needs(text: string): string[] {
    return [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map(m => m[1]))];
}

export async function up(knex: Knex): Promise<void> {
    for (const [col, len] of [['avatar_frame', 40], ['profile_backdrop', 40], ['worn_pet', 40]] as const) {
        if (!(await knex.schema.hasColumn('players', col))) {
            await knex.schema.alterTable('players', t => { t.string(col, len).nullable(); });
        }
    }
    for (const [col, len] of [['sign_style', 40], ['awning_color', 20]] as const) {
        if (!(await knex.schema.hasColumn('player_shops', col))) {
            await knex.schema.alterTable('player_shops', t => { t.string(col, len).nullable(); });
        }
    }
    if (!(await knex.schema.hasColumn('chat_messages', 'emotes'))) {
        await knex.schema.alterTable('chat_messages', t => { t.specificType('emotes', 'text[]').nullable(); });
    }

    if (!(await knex.schema.hasTable('pets'))) {
        await knex.schema.createTable('pets', t => {
            t.increments('id').primary();
            t.string('key', 40).notNullable().unique();
            t.string('name', 60).notNullable();
            t.string('skill', 40).nullable();                 // skill pets: the skill whose actions roll for it
            t.string('kind', 20).notNullable();               // skill | supporter | holiday
            t.integer('chance_one_in').nullable();            // skill pets: 1 in N per action paying the skill
            t.integer('supporter_cents').nullable();          // supporter pets: the step that gives it
            t.string('emoji', 16).notNullable().defaultTo('🐾'); // shown until the sprite exists
            t.text('description').notNullable().defaultTo('');
            t.text('found_line').nullable();                  // chat line when found; {player}
            t.boolean('is_active').notNullable().defaultTo(true);
        });
    }
    if (!(await knex.schema.hasTable('player_pets'))) {
        await knex.schema.createTable('player_pets', t => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('pet_id').notNullable().references('id').inTable('pets').onDelete('CASCADE');
            t.string('source', 20).notNullable();             // found | supporter | store
            t.timestamp('found_at').notNullable().defaultTo(knex.fn.now());
            t.unique(['player_id', 'pet_id']);
        });
    }

    // Pets are the feature itself, so they go in on any database, as
    // announcement_lines did; the snapshot carries staff edits after.
    for (const p of PETS) {
        const had = await knex('pets').where({ key: p.key }).first('id');
        if (!had) await knex('pets').insert(p);
    }

    if (await knex.schema.hasTable('chronicle_deed_kinds')) {
        await knex('chronicle_deed_kinds').insert(DEED).onConflict('key').merge();
        for (const text of VERSES) {
            const had = await knex('chronicle_verses').where({ kind: DEED.key, text }).first('id');
            if (!had) await knex('chronicle_verses').insert({ kind: DEED.key, text, needs: needs(text), enabled: true });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('chronicle_verses')) {
        await knex('chronicle_verses').where({ kind: DEED.key }).delete();
        await knex('chronicle_deed_kinds').where({ key: DEED.key }).update({ enabled: false });
    }
    await knex.schema.dropTableIfExists('player_pets');
    await knex.schema.dropTableIfExists('pets');
    for (const col of ['avatar_frame', 'profile_backdrop', 'worn_pet']) {
        if (await knex.schema.hasColumn('players', col)) await knex.schema.alterTable('players', t => { t.dropColumn(col); });
    }
    for (const col of ['sign_style', 'awning_color']) {
        if (await knex.schema.hasColumn('player_shops', col)) await knex.schema.alterTable('player_shops', t => { t.dropColumn(col); });
    }
    if (await knex.schema.hasColumn('chat_messages', 'emotes')) await knex.schema.alterTable('chat_messages', t => { t.dropColumn('emotes'); });
}
