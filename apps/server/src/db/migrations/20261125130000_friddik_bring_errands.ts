import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Seven more Friddik errands (Nathan, 2026-11-25), so every brother sends to
// both the others. These ask the player to BRING everyday goods a new player
// can gather (eggs, feathers, turnips), not carry a quest item: nothing is
// handed out, the receiver keeps the goods, and they are paid for at their
// value on top of the errand's pay (services/errands.ts, Leg.supply). Each
// leg has SUPPLY_FETCH_SECONDS more time, to fetch the goods first.

const POOL = 'friddick';
const N = 'Nathan Friddik', M = 'Matthew Friddik', C = 'Christopher Friddik';
const GOLD = 40;
const XP = 75;

interface Leg { from: string; to: string; item: string; supply: number; offer: string[]; waiting: string[]; on_time: string[]; late: string[]; very_late: string[] }
interface Line { key: string; name: string; leg: Leg }

const LINES: Line[] = [
    { key: 'eggs_for_matthew', name: 'Eggs for Matthew', leg: {
        from: N, to: M, item: 'Egg', supply: 6,
        offer: ['Matthew\'s been after eggs. I said I\'d send some, and then I didn\'t.', 'Take him {qty} eggs and tell him they\'re from me. Where they\'re really from is between us. You\'ve got {limit}.'],
        waiting: ['Eggs. Matthew. He\'s waiting, and he\'s no good at it.'],
        on_time: ['Eggs. From Nathan, are they.', 'They\'re not, are they. Never mind. Eggs are eggs.'],
        late: ['He said these were coming {late} ago.', 'I\'ve had my breakfast now. I\'ll have them tomorrow.'],
        very_late: ['I\'d given up on these. I\'ve bought a hen.'] } },
    { key: 'lavender_for_christopher', name: 'Lavender for the Rift', leg: {
        from: N, to: C, item: 'Lavender', supply: 5,
        offer: ['Christopher says the rift smells of nothing, and nothing is worse than something. His words.', 'Bring him {qty} sprigs of lavender. You\'ve got {limit}.'],
        waiting: ['Lavender, for the rift. Go on.'],
        on_time: ['That\'s better. Now it smells of lavender and nothing.', 'Tell Nathan it helped. Don\'t tell him how much.'],
        late: ['These have been round the island, haven\'t they.', 'They\'ll still do.'],
        very_late: ['I\'ve got used to the smell of nothing. I\'ll keep these for when I\'m not used to it.'] } },
    { key: 'whiting_for_nathan', name: 'Fish for Nathan', leg: {
        from: M, to: N, item: 'Whiting', supply: 4,
        offer: ['Nathan says I never send him fish. I\'ve sent him fish. He eats it and forgets.', 'Bring him {qty} whiting, raw, so he can see they\'re fresh. You\'ve got {limit}.'],
        waiting: ['Whiting, for Nathan. Before they turn.'],
        on_time: ['Fish. From Matthew.', 'First fish he\'s sent me in years. Don\'t tell him I said that.'],
        late: ['These smell like they took the long way.', 'I\'ll eat them anyway.'],
        very_late: ['I can\'t eat these. They can go on the roses.'] } },
    { key: 'straw_for_nathan', name: 'Straw for the Roof', leg: {
        from: M, to: N, item: 'Straw', supply: 20,
        offer: ['Nathan\'s roof lets the rain in. He won\'t ask, so I\'m asking for him.', 'Take him {qty} bundles of straw. You\'ve got {limit}. Don\'t say it was my idea.'],
        waiting: ['Straw, Nathan, roof. That\'s all you need to remember.'],
        on_time: ['Straw? I didn\'t ask for straw.', 'Leave it by the door. Tell Matthew I didn\'t need it.'],
        late: ['It rained {late} ago. I\'ll mend it anyway.'],
        very_late: ['The roof came in. This can go on the new one.'] } },
    { key: 'daisies_for_christopher', name: 'Daisies for the Sill', leg: {
        from: M, to: C, item: 'Daisy', supply: 6,
        offer: ['Christopher stands out at the rift all day with nothing to look at but the light.', 'Bring him {qty} daisies for his windowsill. You\'ve got {limit}.'],
        waiting: ['Daisies. For the windowsill. Go.'],
        on_time: ['Daisies.', 'I haven\'t got a windowsill. I\'ll put them in a cup.'],
        late: ['They\'ve wilted. So have I.'],
        very_late: ['These were daisies once. I\'ll take his word for it.'] } },
    { key: 'feathers_for_matthew', name: 'Feathers for Flies', leg: {
        from: C, to: M, item: 'Feathers', supply: 10,
        offer: ['Matthew ties his own flies for fishing, and he\'s always short of feathers.', 'Bring him {qty} feathers, and tell him I said nothing about his knots. You\'ve got {limit}.'],
        waiting: ['Feathers. For Matthew\'s flies.'],
        on_time: ['Feathers. He\'s said something about my knots, hasn\'t he.', 'He hasn\'t? Then he\'s thinking it.'],
        late: ['The fish have stopped biting for the day. Thanks all the same.'],
        very_late: ['I\'ve gone over to worms.'] } },
    { key: 'turnips_for_nathan', name: 'A Bet Is a Bet', leg: {
        from: C, to: N, item: 'Turnip', supply: 5,
        offer: ['I lost a bet to Nathan. Five turnips. I\'m not walking over there to say so.', 'Bring him {qty} turnips. If he asks, I lost on purpose. You\'ve got {limit}.'],
        waiting: ['The turnips. Nathan. Off you go.'],
        on_time: ['Five turnips.', 'He\'ll say he lost on purpose. He didn\'t.'],
        late: ['He owes me for the wait now. Tell him that.'],
        very_late: ['I\'d forgotten the bet. I\'d forgotten who won. Turnips, though. Lovely.'] } },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const name of [N, M, C]) {
        if (!(await knex('npcs').where({ name, errand_pool: POOL }).first('id'))) throw new Error(`friddik_bring_errands: no npc "${name}" (run 20261125120000 first)`);
    }
    for (const line of LINES) {
        if (!(await knex('items').where({ name: line.leg.item }).first('id'))) throw new Error(`friddik_bring_errands: no item "${line.leg.item}"`);
        const row = { pool: POOL, name: line.name, legs: JSON.stringify([line.leg]), reward_gold: GOLD, reward_skill: 'Wayfaring', reward_xp: XP, is_active: true };
        const had = await knex('errands').where({ key: line.key }).first('id');
        if (had) await knex('errands').where({ id: had.id }).update({ ...row, updated_at: knex.fn.now() });
        else await knex('errands').insert({ key: line.key, ...row });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    // Open errands of these kinds go with them (player_errands cascades); the goods were the player's own.
    await knex('errands').whereIn('key', LINES.map(l => l.key)).delete();
}
