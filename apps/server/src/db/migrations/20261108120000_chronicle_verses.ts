import type { Knex } from 'knex';

// The Chronicle, step 2 (docs/chronicle-spec.md §8, §17): verse batch one, so
// the composer has words to sing with. Verses are content: inserted when the
// same text is not already there for that kind, never overwriting an edit.
//
// Changes from the batch in the spec, found writing the composer:
//   - "a {item}" is "{a item}" throughout, so an eel is "an eel" and tears are
//     "some tears".
//   - record_fish deeds carry no place (fishing records keep none), so two
//     verses without one are added; the spec's three need {place}.
//   - Kinds the journal already writes but the batch had no verse for get a
//     few: trophy, total_level_mark, bestiary_mark, event_winner_guild (the
//     guild verse moves there from event_winner) and guest_claimed.
//   - "Wenna's chair" settings for the composer: composer_enabled (off until
//     Nathan turns it on, so no page is frozen before the weights are tuned).

const V: Record<string, string[]> = {
    heading: [
        'Tidings for the {date}, as told at the Salty Sloth.',
        'The {date}. Wenna sets down what the island did today.',
        'What was heard at the Salty Sloth on the {date}.',
        'Tidings for the {date}. Pull up a stool.',
        'The {date}, and the [taps are open|fire is lit|benches are full].',
        'Here is the {date}, as near as Wenna could get it from people who were there.',
        'Tidings for the {date}. Some of this is even true.',
        'The {date}. The ink is fresh and the gossip fresher.',
    ],
    drop_rare: [
        '{player} turned up {a item} at {place}, and looked at it for a long while before putting it away.',
        'At {place}, {player} found {a item}. Nobody else did.',
        '{a item} came out of {place} today, in the hands of {player}.',
        '{player} is the one with {a item} now. Ask nicely and they may show you.',
        'Of all the people working {place} today, only {player} came away with {a item}.',
        '{player} found {a item} at {place} and has not stopped mentioning it.',
        "Luck sat on {player}'s shoulder at {place}: {a item}, of all things.",
        "They will be talking about {player}'s {item} at {place} for a week. Possibly two.",
    ],
    cryptid: [
        '{player} came back from {place} with {a item}, and nobody at the Salty Sloth believed it until it was on the table.',
        'There are things in {place} most of us will never see. {player} saw one today, and has {a item} to prove it.',
        'Mark the day: {player} found {a item}. The old ones at the bar went very quiet.',
        '{player} swears the thing looked right at them before it left {a item} behind.',
        '{a item}. From {place}. {player} has it, and the rest of us have questions.',
    ],
    world_first_item: [
        'No one in Talaran had ever held {a item} until {player} did, today, at {place}.',
        '{player} is the first. {a item}, out of {place}, and the island has never seen one before.',
        'Something new under the sky: {a item}, found by {player}. Whatever it is for, they had it first.',
        'Ask anyone in a year who found the first {item}. If they are honest, they will say {player}.',
    ],
    trophy: [
        '{player} brought {a item} back from {place}, and it is going on the wall.',
        'A trophy for {player} today: {a item}, out of {place}.',
        '{player} has {a item} to hang over the fire. {place} gave it up at last.',
    ],
    server_first_level: [
        'Before anyone else on the island, {player} reached {skill} {level}.',
        '{player} is the first in Talaran to {skill} {level}. Everyone else is now second at best.',
        'Of all of us, {player} got there first: {skill}, level {level}.',
        'The first to {skill} {level} was {player}, and nobody can take that back.',
    ],
    level_milestone: [
        '{player} reached {skill} {level} today.',
        '{skill} {level} for {player}. The hands are getting good.',
        '{player} went to bed a little better at {skill} than they woke: level {level}.',
        'Raise a cup to {player}, {skill} {level}.',
        '{player} has {skill} at {level} now, which is further than most will bother to go.',
        '{level} in {skill}, and {player} did not even stop for supper.',
    ],
    level_max: [
        '{player} has mastered {skill}. There is nothing left on this island to teach them about it.',
        '{skill}, level {level}. {player} has gone as far as the craft goes.',
        'Today {player} put down the last lesson {skill} had to give. Mastered.',
        'There are masters of {skill} in the stories. As of today there is one in Talaran: {player}.',
    ],
    total_level_mark: [
        '{player} has {level} levels to their name across every trade, all told.',
        'Count up every skill {player} has and you get {level}. That is a great deal of work.',
        '{level} levels in all, for {player}. The island has kept them busy.',
    ],
    record_fish: [
        '{player} landed {a item} of {weight} at {place}, the heaviest anyone has pulled from these waters.',
        "The scales at {place} creaked for {player}'s {item}: {weight}, and a new record.",
        'A {weight} {item} for {player}. The old record holder has been told.',
        '{player} pulled {a item} of {weight} out of the water today. Nobody has landed a heavier one.',
        'The heaviest {item} anyone has seen weighed {weight}, and {player} caught it.',
    ],
    first_kill: [
        '{player} is the first ever to bring down {a creature}.',
        'Nobody had beaten {a creature} until today. {player} did.',
        '{a creature} fell today for the first time anyone knows of, to {player}, near {place}.',
    ],
    strong_kill: [
        '{player} took on {a creature} that had no business losing to them, and won.',
        "{a creature} near {place} met {player} today and came off the worse, to everyone's surprise including the creature's.",
        '{player} should not have beaten {a creature}. Nobody has told {player}.',
        'Brave or foolish, {player} went at {a creature} and walked away. Mostly walked.',
    ],
    bestiary_mark: [
        '{player} has made {n} kills of {creature} now, and is not done.',
        'That is {n} {creature} kills for {player}. Somebody ought to count them properly.',
        'The {creature} near {place} have learned to fear {player}. {n} of them, so far.',
    ],
    death: [
        '{player} fell to {a creature} near {place}. They will be back. They always are.',
        '{a creature} near {place} had the better of {player} today.',
        '{player} went to {place} with more courage than armour, and {a creature} was waiting.',
        'Lost at {place}: one {player}, to {a creature}. Found again at Talador, a little sorer.',
        '{player} met {a creature} today. The meeting did not go their way.',
    ],
    museum_first_give: [
        '{player} gave the first {item} to the {museum}, and their name goes on the plaque.',
        'The {museum} has {a item} on show now, thanks to {player}.',
    ],
    exhibit_complete: [
        'The last case in {exhibit} at the {museum} is filled. {player} set the final piece.',
        '{exhibit} is whole. It took the island a long while, and {player} finished it.',
    ],
    event_winner: [
        'When the call went out at {place}, {player} answered it hardest.',
        'Nobody worked the event at {place} like {player}.',
    ],
    event_winner_guild: [
        '{guild} came to {place} in force and left with the honours.',
        'When the call went out at {place}, {guild} turned up more hands than anyone.',
    ],
    merchant_arrived: [
        "A merchant's sail came into {place} today, low in the water with goods from elsewhere.",
        'The travelling merchant is at {place}. Bring coin, and do not believe everything he says.',
    ],
    road_first: [
        '{player} walked the road from {place} to {place2} before anyone else had.',
    ],
    mount_raised: [
        '{player} led {a item} out of the pens at Novita today, fit to ride.',
        "A new {item} out of {player}'s pens, and already eating like a lord.",
    ],
    field_twenty: [
        '{player} fenced a twentieth field at Novita. That is a farm now, not a garden.',
    ],
    guild_founded: [
        "A new banner on the island: {guild}, with {tag} beside its people's names.",
    ],
    guild_hall_tier: [
        '{guild} finished another tier of their hall at {place}. The hammering can stop for a while.',
        'The walls of the {guild} hall at {place} stand higher tonight.',
    ],
    newcomers: [
        '{n} strangers came ashore at Talador today. Be kind; we were all new once.',
        'The docks saw {n} new faces today. Several of them already look lost.',
        '{n} came to the island for the first time today. Point them toward Geoffrey.',
    ],
    guest_claimed: [
        '{n} who came ashore to look around have decided to stay.',
        '{n} visitors put their names down today and meant it.',
    ],
    maker_generic: [
        'Word came from the Maker, and the island is not quite as it was this morning.',
        'The Maker has been at work again. Mind where you step.',
        'There is news from the Maker. Read the board at Talador.',
    ],
    roll: [
        'Also seen at their work: {names}.',
        'Not to be forgotten today: {names}.',
        'Others worth a nod: {names}.',
    ],
    quiet: [
        'A quiet day on Taiar. The fishing was fair and nobody fell in.',
        'Not much to tell today. Sometimes that is the best news.',
        'The island kept its head down today. Wenna polished glasses.',
    ],
    rumour_unkilled: ['They say {a creature} still walks near {place}, and nobody has ever brought one down.'],
    rumour_unfilled_case: ['There is a case in {exhibit} at the {museum} that nobody has ever filled.'],
    rumour_unfound_item: ['Old hands say {place} keeps something nobody has found yet.'],
    rumour_unwalked_road: ['Nobody has walked the road from {place} to {place2}. Somebody should.'],
    rumour_merchant: ['A sail was sighted off {place}. If it is who Wenna thinks, bring coin.'],
    'today:drop_rare': [
        "Somebody came out of {place} this morning with {a item}. You'll hear who tomorrow.",
        "{a item} turned up at {place} today. Wenna knows whose hands it was in. She isn't telling yet.",
    ],
    'today:cryptid': ["Something strange came out of {place} today. Ask again tomorrow, and bring a strong drink."],
    'today:world_first_item': ["Someone has found a thing nobody on this island has ever held. It's in the book tomorrow."],
    'today:server_first_level': ['Somebody is first to {skill} {level} as of today. Not saying who. Not yet.'],
    'today:level_max': ["There's a new master of {skill} on Taiar. The name keeps till morning."],
    'today:death': ["{a creature} near {place} had the better of somebody today. They'll live. Everyone does, here."],
    'today:strong_kill': ["Somebody took down {a creature} they had no right to beat. Wenna's still laughing about it."],
    'today:record_fish': ["There's {a item} on the scales heavier than any before it."],
    'today:guild_hall_tier': ["The hammering at {place} stopped this afternoon. Somebody's hall stands a storey higher."],
    'today:newcomers': ['{n} new faces at the docks so far today.'],
    'today:quiet': ["Quiet so far. Give it time; the day's young."],
    signoff: [
        'That is the day. Drink up.',
        'Wenna Halloway, the Salty Sloth, Talador.',
        'More tomorrow, if the island obliges.',
        'That is all the tidings there are. Go to bed.',
        'Set down by Wenna Halloway, who was there for most of it.',
        'Mind the step on your way out.',
    ],
    ballad: [
        'Sing of {guild}, who keep a hall of tier {n} at {place} and {members} names on the roll. Their best hands are at {skill}, and they are not shy about it.',
        'Here is a song for {guild}. They raised their hall at {place} one nail at a time, and every nail was paid for.',
    ],
};

// New deed kinds the composer weighs that step 1 did not list.
const NEW_KINDS = [
    { key: 'road_first', section: 'island', base_weight: 30, max_per_page: null, label: 'First on the island to walk a road' },
];

const SETTINGS: Record<string, unknown> = {
    composer_enabled: false,   // off until Nathan turns it on in the admin panel
    quiet_below: 4,            // §3: fewer scoring deeds than this is a quiet day
    death_heavy_stacks: 10,    // §6: a death that dropped this many stacks is a heavy loss
};

function needs(text: string): string[] {
    return [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map(m => m[1].replace(/^a /, '')))];
}

export async function up(knex: Knex): Promise<void> {
    for (const [kind, texts] of Object.entries(V)) {
        const have = new Set((await knex('chronicle_verses').where({ kind }).select('text')).map((r: any) => r.text));
        const rows = texts.filter(t => !have.has(t)).map(text => ({ kind, text, needs: needs(text) }));
        if (rows.length) await knex('chronicle_verses').insert(rows);
    }
    // The guild verse that used to sit under event_winner (if step 1 loaded it there).
    await knex('chronicle_verses').where({ kind: 'event_winner', text: '{guild} came to {place} in force and left with the honours.' }).delete();
    for (const k of NEW_KINDS) await knex('chronicle_deed_kinds').insert(k).onConflict('key').ignore();
    for (const [key, value] of Object.entries(SETTINGS)) {
        await knex('chronicle_settings').insert({ key, value: JSON.stringify(value) }).onConflict('key').ignore();
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const [kind, texts] of Object.entries(V)) {
        await knex('chronicle_verses').where({ kind }).whereIn('text', texts).delete();
    }
    await knex('chronicle_deed_kinds').whereIn('key', NEW_KINDS.map(k => k.key)).delete();
    await knex('chronicle_settings').whereIn('key', Object.keys(SETTINGS)).delete();
}
