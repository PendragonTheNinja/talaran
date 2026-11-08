import type { Knex } from 'knex';

// Guild ballads, sung in four verses (Nathan, 2026-11-08: one or two sentences
// was not worth 10,000 gold). services/chronicleBallads.ts builds a ballad
// from four verse kinds, each a stanza of four lines:
//
//   ballad_open        who is being sung of
//   ballad_numbers     the roll, the hall, the leader, the skill they are best at
//   ballad_deed_*      one thing they did, chosen from what the guild has to show:
//                      win (a world event won), first (an item nobody had found
//                      before), hunt (creatures killed), road (a road nobody had
//                      walked), fallen (deaths), work (nothing else to tell yet)
//   ballad_close       the send-off
//
// Slots: guild, tag, by (who paid), leader, members (only when 2 or more),
// age, place and n (the hall's place and tier), skill, skill2, wins, event,
// firsts, item, kills, creature, roads, deaths, actions. A stanza that names a
// slot the guild cannot fill is never used, so every kind keeps some that need
// only {guild}.
//
// chronicle_lines.ballad_id ties a page's line (the first verse) to the whole
// ballad, so the book can offer the rest. The old one-line kind 'ballad' is
// switched off, not deleted: ballads already paid for keep their words.

const V: Record<string, string[]> = {
    ballad_open: [
        'Come close and set your cups down, friends,\nand hush the fiddle\'s play.\nI sing of {guild}, who wear {tag},\nand earn it every day.',
        'There\'s a name they say along the docks\nwhen the evening tide is low.\nIt\'s {guild}. I\'ll sing you why,\nif you\'ve an hour to go.',
        'Pour another, love, and let me start.\nThis one\'s been bought and paid.\nIt\'s for {guild}, who keep their word\nand finish what they\'ve made.',
        'Some songs are sung for kings, they say.\nWe\'ve none of those out here.\nSo here\'s one for {guild} instead,\nand someone buy their beer.',
        'Hear now of {guild}, hear it plain,\nfor I\'ll not sing it twice.\nThey paid me well to tell it true,\nand true comes at a price.',
        '{by} came in and paid the house\nand asked me for a song.\nSo here is one for {guild}, friends.\nIt shouldn\'t take too long.',
        'They signed the roll {age} ago\nwith ink that wasn\'t dry,\nand {guild} has been a name since then\nthat no one passes by.',
        'Lift your cups to {tag}, my friends,\nand lift them high and slow,\nfor {guild} has walked the island roads\nwhere wiser folk won\'t go.',
        'I\'ve sung of storms and sung of wrecks\nand a goat that ate a boot.\nTonight it\'s {guild}, and I\'ll be paid,\nso pass me up my lute.',
    ],
    ballad_numbers: [
        'There\'s {members} names upon the roll\nand not one idle pair of hands,\nand none of them will turn away\nwhen a friend of theirs demands.',
        'They raised a hall at {place}, friends,\nand raised it beam by beam.\nIt\'s tier {n} now, and stands up straight,\nand stouter than it seems.',
        'At {place} there stands a hall\nwith {members} at the door,\nand every one has hauled a beam\nor swept the sawdust floor.',
        'Ask them of {skill} and they\'ll talk\nuntil the lamps burn low.\nAsk them of {skill2} as well.\nThere\'s little they don\'t know.',
        '{leader} holds the roll for them,\nand holds it fair and well,\nwith {members} names beneath the seal\nand stories each could tell.',
        'Their hands know {skill} best of all,\nand you can see it plain:\nthe calluses, the patient eye,\nthe coming back again.',
        'There\'s {members} of them, give or take,\nwho answer to the name,\nand if you wrong a single one\nyou\'ve wronged them all the same.',
        '{leader} leads them, so they say,\nwith a steady, quiet hand,\nand not a one has cause to doubt\nthe ground on which they stand.',
        'You\'ll know their hall at {place}, friends.\nThere\'s {tag} above the door,\ncut deep, and cut with care, by one\nwho\'d never carved before.',
        'They work at {skill} through the rain,\nthey work at it through the cold.\nThey\'ll work at it, I\'d bet my lute,\nuntil the lot of them are old.',
    ],
    ballad_deed_win: [
        'When word went round of the {event},\nthey rolled their sleeves up high,\nand when it ended, {guild} had won,\nand no one wondered why.',
        'They\'ve carried off the prize, my friends,\nnot once but {wins} now,\nand every time they won it fair,\nby the sweat upon their brow.',
        'Remember the {event}? I do.\nI\'ve the blisters still to show.\nBut {guild} came out ahead of all,\nand that\'s the way songs go.',
        'The {event} came, the island worked,\nand everyone worked hard.\nBut {tag} worked harder still than most,\nand took it by a yard.',
    ],
    ballad_deed_first: [
        'No one had ever held {a item}\ntill one of theirs came by.\nThey\'ve {firsts} firsts like that, all told,\nand none of them a lie.',
        'Who was the first to hold {a item}?\nGo on, ask round the bar.\nIt was one of {guild}, friends,\nand they\'ll tell you who they are.',
        'There\'s things on this isle no hand had touched\nuntil {tag} reached down.\n{firsts} of them, the clerks have it,\nwritten in the town.',
    ],
    ballad_deed_hunt: [
        'They\'ve brought down {kills} beasts and more\nout in the wild and wet,\nand {a creature} more than all the rest.\nIt hasn\'t forgiven them yet.',
        'Ask {a creature} what it fears\nwhen the night comes on the hill.\nIt\'s {tag}, it\'s always {tag}, friends.\n{kills} kills, and counting still.',
        'The beasts out past the last stone wall\nhave learned to know their tread.\n{kills} of them have met {guild},\nand most of those are dead.',
    ],
    ballad_deed_road: [
        'They walked roads no one walked before,\n{roads} of them, end to end,\nand came back muddy to the knee\nwith a map for every friend.',
        'Where the path runs out and the brambles start,\nthat\'s where you\'ll find {tag}.\nThey\'ve opened {roads} roads for the rest of us\nwith a stick and a heavy bag.',
    ],
    ballad_deed_fallen: [
        'They\'ve died, oh yes, {deaths} times or more,\nface down in the cold wet sand,\nand every time they\'ve got back up\nand gone back out to stand.',
        'It hasn\'t all been glory, mind.\nThey\'ve fallen {deaths} times, I\'m told,\nand walked the long road back again\nto find their packs gone cold.',
    ],
    ballad_deed_work: [
        'They\'ve swung and hauled and stirred and sawn\n{actions} times, or near,\nand not one of them has asked for thanks,\nor for a second beer.',
        'There\'s no great deed to tell you of,\nno monster and no crown.\nJust honest work, day after day,\nthe steadiest in town.',
        'They\'re young yet. Give them time, I say.\nThe roads are long and wide,\nand {guild} has only just begun\nto see the other side.',
    ],
    ballad_close: [
        'So drink to {guild}, drink it down,\nand drink it to the end,\nand if you meet one on the road,\nyou\'ve met yourself a friend.',
        'That\'s all I have, and all they paid,\nso that\'s the song complete.\nLong life to {guild}, I say,\nand dry boots on their feet.',
        'Long may {tag} be carved in wood\nand sung in rooms like these.\nNow fill my cup, somebody, do.\nI\'ve earned it, if you please.',
        '{by} paid for every word,\nand every word was true.\nSo here\'s to {guild}, all of them.\nNext time, it might be you.',
        'I\'ll sing again another night\nif someone pays the fee.\nTill then, remember {guild}, friends,\nand leave a coin for me.',
        'The fire\'s low, the night\'s half gone,\nthe song is at its end.\nRemember {guild} out on the roads.\nYou\'ll need them yet, my friend.',
    ],
};

function needs(text: string): string[] {
    return [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map((m) => m[1].replace(/^a /, '')))];
}

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('chronicle_lines', 'ballad_id'))) {
        await knex.schema.alterTable('chronicle_lines', (t) => {
            t.integer('ballad_id').nullable().references('id').inTable('chronicle_ballads').onDelete('SET NULL');
        });
    }
    for (const [kind, texts] of Object.entries(V)) {
        const have = new Set((await knex('chronicle_verses').where({ kind }).select('text')).map((r: any) => r.text));
        const rows = texts.filter((t) => !have.has(t)).map((text) => ({ kind, text, needs: needs(text) }));
        if (rows.length) await knex('chronicle_verses').insert(rows);
    }
    await knex('chronicle_verses').where({ kind: 'ballad' }).update({ enabled: false });
}

export async function down(knex: Knex): Promise<void> {
    await knex('chronicle_verses').where({ kind: 'ballad' }).update({ enabled: true });
    for (const [kind, texts] of Object.entries(V)) {
        await knex('chronicle_verses').where({ kind }).whereIn('text', texts).delete();
    }
    if (await knex.schema.hasColumn('chronicle_lines', 'ballad_id')) {
        await knex.schema.alterTable('chronicle_lines', (t) => { t.dropColumn('ballad_id'); });
    }
}
