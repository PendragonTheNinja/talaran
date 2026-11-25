import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Friddick errands, second pass (Nathan, 2026-11-25).
//
//   The letter       rewritten: less on the nose. Christopher and Nathan are
//                    still arguing about a ladder; the items' words follow.
//   The portrait     one leg now: Nathan sends it to Matthew, who keeps it.
//                    The birthday card stays two, since all three sign it.
//   errand_again     a short greeting each, for a player who has carried for
//                    them before, so a brother does not introduce himself
//                    every time (services/errands.ts errandTalk).
//   Pay              40 gold and 75 Wayfaring a leg, as before; the code now
//                    wanders it 12.5% either side (ERRAND_PAY_SPREAD).

const POOL = 'friddick';
const N = 'Nathan Friddick', M = 'Matthew Friddick', C = 'Christopher Friddick';
const GOLD_PER_LEG = 40;
const XP_PER_LEG = 75;

interface Leg { from: string; to: string; item: string; offer: string[]; waiting: string[]; on_time: string[]; late: string[]; very_late: string[] }

const STRONG_WORDS: Leg[] = [
    { from: C, to: N, item: 'Strongly Worded Letter',
      offer: ['Take this to Nathan. It\'s about the ladder. He knows which ladder.', 'You\'ve got {limit}, before I think better of it.'],
      waiting: ['The ladder letter. Nathan. Go on.'],
      on_time: ['The ladder.', 'I gave that ladder back in the spring. He knows I gave it back.', 'Hold on. I\'ll write back.'],
      late: ['This took {late} longer than it should have. He\'ll think I kept him waiting on purpose.', 'Hold on. I\'ll write back.'],
      very_late: ['By the time this got to me, I\'d forgotten I ever had his ladder.', 'Now I remember. Hold on.'] },
    { from: N, to: C, item: 'Even More Strongly Worded Reply',
      offer: ['Give him this. It says the ladder came back with three rungs missing. He\'ll say it didn\'t. It did.', 'You\'ve got {limit}.'],
      waiting: ['Three rungs. Go on.'],
      on_time: ['Three rungs.', 'It had two missing when he lent it to me. I\'ll put that in the next one.'],
      late: ['He\'ll have counted the rungs again by now.', 'Fine.'],
      very_late: ['I\'ve bought a new ladder since. I\'ll tell him in my next letter. Slowly.'] },
];

const PORTRAIT: Leg[] = [
    { from: N, to: M, item: 'Family Portrait',
      offer: ['Mother wants a portrait of the three of us. We can\'t stand in a room together, so we\'ve been painted one at a time.', 'It\'s Matthew\'s turn to have it on his wall. You\'ve got {limit}. The paint\'s still wet.'],
      waiting: ['Wet paint. Go.'],
      on_time: ['He\'s painted himself taller than me.', 'Give it here. There. Now I\'m taller. It can stay on my wall a while.'],
      late: ['The paint\'s dried with his thumbprint in it.', 'It can go on my wall anyway.'],
      very_late: ['It\'s dusty. How is a painting dusty?', 'Hang it there. No, there.'] },
];

const ITEM_WORDS: Record<string, { before: string; after: string }> = {
    'Strongly Worded Letter': {
        before: 'A letter sealed with a great deal of wax. The word "regrettable" shows through the paper four times.',
        after: 'A letter sealed with far more wax than a letter needs. Through the paper you can just make out the word "ladder", underlined.',
    },
    'Even More Strongly Worded Reply': {
        before: 'The reply. More wax. "Regrettable" shows through five times.',
        after: 'The reply, sealed with even more wax. It seems to be mostly about rungs.',
    },
};

const AGAIN: Record<string, string[]> = {
    [N]: ['You again. Good. There\'s more wants taking.'],
    [M]: ['Back, are you? There\'s always something.'],
    [C]: ['You. Good. I\'ve another one.'],
};
const AGAIN_OPTIONS = [
    { label: '"What needs taking?"', next_stage: null, action: 'errand_accept' },
    { label: '"Not today."', next_stage: null, action: 'close' },
];

async function setLegs(knex: Knex, key: string, legs: Leg[]): Promise<void> {
    const n = await knex('errands').where({ key, pool: POOL }).update({
        legs: JSON.stringify(legs), reward_gold: GOLD_PER_LEG * legs.length, reward_xp: XP_PER_LEG * legs.length, updated_at: knex.fn.now(),
    });
    if (n !== 1) throw new Error(`friddick_errands_rework: no errand "${key}" (run 20261122120000 first)`);
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    // Anyone halfway through an errand whose legs change is let off it, the
    // carried thing taken back, so no one is left holding a leg that no longer exists.
    const changed = await knex('errands').whereIn('key', ['strong_words', 'portrait']).where({ pool: POOL }).pluck('id');
    for (const open of await knex('player_errands').whereIn('errand_id', changed).select('player_id')) {
        const items = await knex('items').whereIn('name', ['Strongly Worded Letter', 'Even More Strongly Worded Reply', 'Family Portrait']).pluck('id');
        await knex('player_inventory').where({ player_id: open.player_id }).whereIn('item_id', items).delete();
        await knex('player_errands').where({ player_id: open.player_id }).delete();
    }
    await setLegs(knex, 'strong_words', STRONG_WORDS);
    await setLegs(knex, 'portrait', PORTRAIT);
    for (const [name, words] of Object.entries(ITEM_WORDS)) {
        const n = await knex('items').where({ name }).update({ description: words.after });
        if (n !== 1) throw new Error(`friddick_errands_rework: no item "${name}"`);
    }
    for (const [name, lines] of Object.entries(AGAIN)) {
        const npc = await knex('npcs').where({ name }).first('id');
        if (!npc) throw new Error(`friddick_errands_rework: no npc "${name}"`);
        await knex('npc_dialogues').where({ npc_id: npc.id, stage_key: 'errand_again' }).delete();
        await knex('npc_dialogues').insert({ npc_id: npc.id, stage_key: 'errand_again', text_lines: lines, options: JSON.stringify(AGAIN_OPTIONS) });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    // The old two-leg portrait and the "regrettable" letter are in 20261122120000;
    // this puts back only what is short enough to keep here: the item words, and
    // the greetings go.
    for (const [name, words] of Object.entries(ITEM_WORDS)) await knex('items').where({ name }).update({ description: words.before });
    const npcs = await knex('npcs').whereIn('name', Object.keys(AGAIN)).pluck('id');
    if (npcs.length) await knex('npc_dialogues').whereIn('npc_id', npcs).where({ stage_key: 'errand_again' }).delete();
}
