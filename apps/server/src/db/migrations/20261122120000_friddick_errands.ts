import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Friddick Brothers (Nathan, 2026-11-22): Nathan in Verdale, Matthew in
// Dawncrest, and Christopher at the Talar Rift. They will not visit one
// another, for reasons none of them will give, so everything between them is
// carried. Errands repeat: each brother offers one, at random, of the lines
// that start with him (services/errands.ts). Each leg is timed from the
// roads; lateness is kept and changes what the one receiving says, and a
// late errand pays nothing.
//
//   npcs.errand_pool     the pool of errands an NPC offers and receives.
//   errands              one line: its legs (from, to, item, and what is
//                        said: offer, waiting, on_time, late, very_late;
//                        {limit}, {late}, {to}, {from} are filled in), and
//                        what it pays when no leg was late.
//   player_errands       the one errand a player has open.
//   errand_log           every leg handed over: its limit and how late.
//
// The carried things are type 'quest', which no museum takes.

const POOL = 'friddick';
const BROTHERS = [
    { name: 'Nathan Friddick', title: 'Eldest of the Friddicks', place: 'Verdale', avatar: '🧔' },
    { name: 'Matthew Friddick', title: 'Middle of the Friddicks', place: 'Dawncrest', avatar: '🧑' },
    { name: 'Christopher Friddick', title: 'Youngest of the Friddicks', place: 'Talar Rift', avatar: '👨' },
];
const N = 'Nathan Friddick', M = 'Matthew Friddick', C = 'Christopher Friddick';

const ITEMS: { name: string; description: string }[] = [
    { name: "Matthew's Good Hammer", description: 'A claw hammer with a hickory handle worn smooth by one particular hand. MATTHEW is burned into the handle, twice.' },
    { name: "Matthew's Pie", description: 'A pork pie in a cloth, still warm. For now.' },
    { name: 'Strongly Worded Letter', description: 'A letter sealed with a great deal of wax. The word "regrettable" shows through the paper four times.' },
    { name: 'Even More Strongly Worded Reply', description: 'The reply. More wax. "Regrettable" shows through five times.' },
    { name: 'Family Portrait', description: 'A portrait of three brothers who were never in the same room, painted one at a time. Each is a little taller than the last.' },
    { name: "Mother's Birthday Card", description: 'A birthday card for the Friddicks\' mother, signed in larger and larger letters.' },
];

interface Leg { from: string; to: string; item: string; offer: string[]; waiting: string[]; on_time: string[]; late: string[]; very_late: string[] }
interface Line { key: string; name: string; legs: Leg[] }

const LINES: Line[] = [
    { key: 'good_hammer', name: 'The Good Hammer', legs: [
        { from: N, to: M, item: "Matthew's Good Hammer",
          offer: ['I borrowed Matthew\'s good hammer. The good one. He has two, and this is the good one.', 'He hasn\'t noticed. Put it back on his bench before he does. You\'ve got {limit}.'],
          waiting: ['Is it back on his bench? Then why are you still here?'],
          on_time: ['Oh, that\'s where it went.', 'I hadn\'t noticed it was gone. Don\'t tell Nathan I hadn\'t noticed.'],
          late: ['I noticed.', 'Tell Nathan I noticed. I spent {late} looking for it.'],
          very_late: ['I bought a new hammer. Then I bought a second new hammer, in case.', 'Put that one with the others.'] },
    ] },
    { key: 'still_warm', name: 'Still Warm', legs: [
        { from: M, to: C, item: "Matthew's Pie",
          offer: ['A pie. For Christopher. It\'s his birthday, or it was, or it will be. I lose track.', 'It has to be warm when it gets there. You\'ve got {limit} before it isn\'t.'],
          waiting: ['Every minute you stand here, it\'s getting colder.'],
          on_time: ['It\'s warm.', 'Tell Matthew nothing. If he finds out it was warm, he\'ll be impossible.'],
          late: ['It\'s cold.', 'Of course it\'s cold. It\'s been {late} late. It\'s always cold.'],
          very_late: ['This pie has been on a long journey. I can tell. It has seen things.', 'I\'ll eat it anyway. Don\'t tell him that either.'] },
    ] },
    { key: 'strong_words', name: 'A Strongly Worded Letter', legs: [
        { from: C, to: N, item: 'Strongly Worded Letter',
          offer: ['Take this to Nathan. Don\'t read it.', 'You can read it. Just don\'t read it out loud. You\'ve got {limit}, before I change my mind.'],
          waiting: ['You\'re still holding it. I can see you holding it.'],
          on_time: ['He\'s used the word "regrettable" four times.', 'Wait there.'],
          late: ['This came {late} late. He\'ll think I\'ve been sulking.', 'Wait there.'],
          very_late: ['This letter is about something that happened last spring. He\'s still on about last spring.', 'Wait there.'] },
        { from: N, to: C, item: 'Even More Strongly Worded Reply',
          offer: ['Take him this. I\'ve used "regrettable" five times. You\'ve got {limit}.'],
          waiting: ['Five times. Go on.'],
          on_time: ['Five times.', 'He learned that from me.'],
          late: ['He took his time with this. Five "regrettable"s. Hm.'],
          very_late: ['I\'d forgotten what I said in the first one. I\'ve had to read my own letter again from the start.'] },
    ] },
    { key: 'portrait', name: 'The Family Portrait', legs: [
        { from: N, to: M, item: 'Family Portrait',
          offer: ['Mother wants a portrait of the three of us. We can\'t stand in a room together, so I\'ve painted myself in, and now it goes round.', 'Matthew next. You\'ve got {limit}. The paint is still wet.'],
          waiting: ['Wet paint. Go.'],
          on_time: ['He\'s painted himself taller than me.', 'Give it here. There. Now I\'m taller.'],
          late: ['The paint\'s dried with his thumbprint in it.', 'Give it here anyway.'],
          very_late: ['It\'s dusty. How is a painting dusty?', 'Give it here.'] },
        { from: M, to: C, item: 'Family Portrait',
          offer: ['Christopher next. Don\'t let him make himself taller. You\'ve got {limit}.'],
          waiting: ['Christopher\'s waiting. Or he isn\'t. Either way, go.'],
          on_time: ['We\'re all the same height now. Strange. I\'d have thought we\'d look bigger.', 'I\'ll take it to Mother myself. No. You take it. No. I\'ll keep it.'],
          late: ['The frame\'s warped.', 'I\'ll keep it anyway.'],
          very_late: ['Mother\'s had a different portrait done since. Of the dog.'] },
    ] },
    { key: 'birthday_card', name: "Mother's Birthday Card", legs: [
        { from: M, to: N, item: "Mother's Birthday Card",
          offer: ['Mother\'s birthday card. I\'ve signed it. Nathan signs it next, then Christopher, then it goes to her.', 'You\'ve got {limit}. Her birthday isn\'t for a month, but Nathan is slow.'],
          waiting: ['Nathan, then Christopher. Off you go.'],
          on_time: ['He\'s signed it in very big letters.', 'I\'ll sign it in bigger ones.'],
          late: ['He\'ll say I held it up. I didn\'t. You did.', 'I\'ll sign it in bigger letters anyway.'],
          very_late: ['This is last year\'s card, isn\'t it.', 'I\'ll sign it again.'] },
        { from: N, to: C, item: "Mother's Birthday Card",
          offer: ['Christopher next. You\'ve got {limit}. Tell him there\'s no room left.'],
          waiting: ['Go on. He has to have room to sign.'],
          on_time: ['There\'s no room left.', 'I\'ll sign the back. Mother always turns them over.'],
          late: ['Her birthday\'s tomorrow. Fine. Fine.'],
          very_late: ['Her birthday was last week. I\'ll write "belated" in very small letters.'] },
    ] },
];

// What an errand pays when no leg was late, per leg. Walking pays Wayfaring as
// well, so this is a bonus for being on time, not a living (Nathan to tune).
const GOLD_PER_LEG = 40;
const XP_PER_LEG = 300;

const INTROS: Record<string, string[]> = {
    [N]: ['Nathan Friddick. Eldest.', 'If you\'re going anywhere near either of my brothers, I\'ve something for them. I\'m not going myself. We don\'t, as a rule.'],
    [M]: ['Matthew Friddick. You\'ll have met one of the others. They talk about me, I expect.', 'If you\'re heading their way, there\'s something needs taking.'],
    [C]: ['Christopher Friddick. Youngest.', 'I have things that need carrying to my brothers, and I\'d sooner not carry them.'],
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('npcs', 'errand_pool'))) {
        await knex.schema.alterTable('npcs', (t) => { t.string('errand_pool', 50).nullable(); });
    }
    if (!(await knex.schema.hasTable('errands'))) {
        await knex.schema.createTable('errands', (t) => {
            t.increments('id').primary();
            t.string('key', 50).notNullable().unique();
            t.string('pool', 50).notNullable();
            t.string('name', 100).notNullable();
            t.jsonb('legs').notNullable();
            t.integer('reward_gold').notNullable().defaultTo(0);
            t.string('reward_skill', 50).nullable();
            t.integer('reward_xp').notNullable().defaultTo(0);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
        });
    }
    if (!(await knex.schema.hasTable('player_errands'))) {
        await knex.schema.createTable('player_errands', (t) => {
            t.integer('player_id').primary().references('id').inTable('players').onDelete('CASCADE');
            t.integer('errand_id').notNullable().references('id').inTable('errands').onDelete('CASCADE');
            t.integer('leg').notNullable().defaultTo(0);
            t.timestamp('leg_started_at', { useTz: true }).notNullable();
            t.integer('leg_limit_seconds').notNullable();
            t.integer('late_legs').notNullable().defaultTo(0);
            t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }
    if (!(await knex.schema.hasTable('errand_log'))) {
        await knex.schema.createTable('errand_log', (t) => {
            t.increments('id').primary();
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('errand_id').notNullable().references('id').inTable('errands').onDelete('CASCADE');
            t.integer('leg').notNullable();
            t.integer('limit_seconds').notNullable();
            t.integer('late_seconds').notNullable().defaultTo(0);
            t.timestamp('delivered_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['player_id', 'delivered_at']);
        });
    }
    if (!(await hasContent(knex))) return;
    if (!(await knex('skills').where({ name: 'Wayfaring' }).first('id'))) throw new Error('friddick_errands: no skill named Wayfaring');

    for (const it of ITEMS) {
        const row = { name: it.name, description: it.description, type: 'quest', subtype: 'quest', tier: 1, level_required: 1, value: 0, is_active: true };
        const had = await knex('items').where({ name: it.name }).first('id');
        if (had) await knex('items').where({ id: had.id }).update(row);
        else await knex('items').insert(row);
    }

    for (const b of BROTHERS) {
        const place = await knex('locations').where({ name: b.place }).first('id');
        if (!place) throw new Error(`friddick_errands: no location named ${b.place}`);
        const row = { name: b.name, title: b.title, location_id: place.id, avatar: b.avatar, is_active: true, errand_pool: POOL };
        let npc = await knex('npcs').where({ name: b.name }).first('id');
        if (npc) await knex('npcs').where({ id: npc.id }).update(row);
        else [npc] = await knex('npcs').insert(row).returning('id');
        await knex('npc_dialogues').where({ npc_id: npc.id }).delete();
        await knex('npc_dialogues').insert({
            npc_id: npc.id, stage_key: 'intro', text_lines: INTROS[b.name],
            options: JSON.stringify([
                { label: '"What needs taking?"', next_stage: null, action: 'errand_accept' },
                { label: '"Not today."', next_stage: null, action: 'close' },
            ]),
        });
    }

    const names = new Set(BROTHERS.map(b => b.name));
    const itemNames = new Set(ITEMS.map(i => i.name));
    for (const line of LINES) {
        for (const leg of line.legs) {
            if (!names.has(leg.from) || !names.has(leg.to)) throw new Error(`friddick_errands: ${line.key} names someone who is not a brother`);
            if (!itemNames.has(leg.item)) throw new Error(`friddick_errands: ${line.key} carries ${leg.item}, which is not made here`);
        }
        const row = {
            pool: POOL, name: line.name, legs: JSON.stringify(line.legs), is_active: true,
            reward_gold: GOLD_PER_LEG * line.legs.length, reward_skill: 'Wayfaring', reward_xp: XP_PER_LEG * line.legs.length,
        };
        const had = await knex('errands').where({ key: line.key }).first('id');
        if (had) await knex('errands').where({ id: had.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('errands').insert({ key: line.key, ...row });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('errand_log');
    await knex.schema.dropTableIfExists('player_errands');
    await knex.schema.dropTableIfExists('errands');
    const ids = await knex('npcs').whereIn('name', BROTHERS.map(b => b.name)).pluck('id');
    if (ids.length) {
        await knex('npc_dialogues').whereIn('npc_id', ids).delete();
        await knex('npcs').whereIn('id', ids).delete();
    }
    if (await knex.schema.hasColumn('npcs', 'errand_pool')) {
        await knex.schema.alterTable('npcs', (t) => { t.dropColumn('errand_pool'); });
    }
    // The carried things stay: a player may hold one.
}
