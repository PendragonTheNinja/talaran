import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's first quests (Nathan, 2026-11-22): Nan's window box in Wendhaven
// (three errands, one after another), the cabbage quarrel in Farefield (two
// neighbors, and you take one side), and a complaint about the Snallygaster
// at the Wendhaven harbor desk. No tutors, no Geo- names (CLAUDE.md §8).
//
// Three things the quest system did not do before, added here as columns and
// read in routes/npcs.ts and routes/quests.ts:
//
//   quests.stage_prefix       a quest's own dialogue stages ("nan2:intro"), so
//                             one giver can hand out several. Null keeps the
//                             plain keys every earlier quest uses.
//   quests.requires_quest_id  held back until that quest is done (Nan's
//                             second errand waits on her first).
//   quests.exclusive_group    rivals: start one and the rest of its group are
//                             closed for good, and their givers are at their
//                             'rival' stage (Wat and Ebba).
//
// And one objective type, 'give': bring the giver something to keep. It is
// met while the pack holds enough and taken at the hand-in, in the
// transaction that pays the reward.

type Line = string;
interface Stage { key: string; lines: Line[]; options: { label: string; next_stage: string | null; action: string | null }[] }
interface QuestDef {
    name: string; description: string; npc: string; place: string
    prefix: string | null; requires: string | null; group: string | null
    skill: string | null; xp: number; skillXp: { skill: string; xp: number }[]; gold: number
    startItems: { itemName: string; qty: number }[]; rewardItems: { itemName: string; qty: number }[]
    objectives: { type: string; target: string | null; amount: number; description: string }[]
}
interface NpcDef { name: string; title: string; place: string; avatar: string }

const NPCS: NpcDef[] = [
    { name: 'Nan', title: 'Keeps a Window Box', place: 'Wendhaven', avatar: '🌸' },
    { name: 'Aldous Penhallow', title: 'Clerk to the Harbormaster', place: 'Wendhaven', avatar: '📜' },
    { name: 'Wat Greening', title: 'Grows Cabbages', place: 'Farefield', avatar: '🥬' },
    { name: 'Ebba Furrow', title: 'Also Grows Cabbages', place: 'Farefield', avatar: '🥬' },
];

const QUESTS: QuestDef[] = [
    {
        name: "Nan's Window Box", npc: 'Nan', place: 'Wendhaven', prefix: 'nan1:', requires: null, group: null,
        description: 'An old woman in Wendhaven wants her window box filled, and she cannot get up the cliff roads anymore.',
        skill: 'Wayfaring', xp: 1500, skillXp: [], gold: 100, startItems: [], rewardItems: [],
        objectives: [
            { type: 'give', target: 'Sea Thrift', amount: 10, description: 'Bring Nan ten Sea Thrift, picked along the roads' },
            { type: 'talk', target: null, amount: 1, description: 'Give them to Nan' },
        ],
    },
    {
        name: 'Something Nobody Else Has', npc: 'Nan', place: 'Wendhaven', prefix: 'nan2:', requires: "Nan's Window Box", group: null,
        description: 'Nan has decided thrift is too common for her window box.',
        skill: 'Wayfaring', xp: 1500, skillXp: [], gold: 150, startItems: [], rewardItems: [],
        objectives: [
            { type: 'give', target: 'Spring Gentian', amount: 3, description: 'Bring Nan three Spring Gentian from the high roads' },
            { type: 'talk', target: null, amount: 1, description: 'Give them to Nan' },
        ],
    },
    {
        name: 'Over the Edge', npc: 'Nan', place: 'Wendhaven', prefix: 'nan3:', requires: 'Something Nobody Else Has', group: null,
        description: 'Nan wants something trailing over the edge of her window box.',
        skill: 'Foraging', xp: 2000, skillXp: [], gold: 300, startItems: [], rewardItems: [],
        objectives: [
            { type: 'give', target: 'Samphire', amount: 10, description: 'Bring Nan ten Samphire from the tidal shore at Farvick Narrows' },
            { type: 'talk', target: null, amount: 1, description: 'Give them to Nan' },
        ],
    },
    {
        name: 'A Complaint Regarding the Snallygaster', npc: 'Aldous Penhallow', place: 'Wendhaven', prefix: null, requires: null, group: null,
        description: 'The harbor clerk in Wendhaven has a complaint ready to file. It wants only the creature\'s acknowledgment.',
        skill: 'Melee', xp: 2500, skillXp: [{ skill: 'Defense', xp: 3000 }, { skill: 'Constitution', xp: 1500 }], gold: 250, startItems: [], rewardItems: [],
        objectives: [
            { type: 'kill', target: 'Snallygaster', amount: 1, description: 'Kill a Snallygaster on the Horns at Vergehorns' },
            { type: 'give', target: 'Snallyscale', amount: 1, description: 'Bring the clerk a Snallyscale for the margin' },
            { type: 'talk', target: null, amount: 1, description: 'Return to Aldous Penhallow' },
        ],
    },
    {
        name: "Wat's Cabbages", npc: 'Wat Greening', place: 'Farefield', prefix: null, requires: null, group: 'farefield_cabbage',
        description: 'Wat Greening says his cabbages are bigger than his neighbor\'s, and wants it proved on the scale.',
        skill: 'Farming', xp: 2500, skillXp: [], gold: 400,
        startItems: [{ itemName: 'Cabbage Seeds', qty: 30 }], rewardItems: [],
        objectives: [
            { type: 'harvest', target: 'Cabbage', amount: 3, description: 'Bring in three fields of cabbage from Wat\'s seed' },
            { type: 'give', target: 'Cabbage', amount: 10, description: 'Bring Wat the ten best heads' },
            { type: 'talk', target: null, amount: 1, description: 'Put them on the scale for Wat' },
        ],
    },
    {
        name: "Ebba's Cabbages", npc: 'Ebba Furrow', place: 'Farefield', prefix: null, requires: null, group: 'farefield_cabbage',
        description: 'Ebba Furrow says her cabbages are bigger than her neighbor\'s, and wants it settled for good.',
        skill: 'Farming', xp: 2500, skillXp: [], gold: 0,
        startItems: [{ itemName: 'Cabbage Seeds', qty: 30 }],
        rewardItems: [{ itemName: 'Beet Seeds', qty: 15 }, { itemName: 'Leek Seeds', qty: 15 }],
        objectives: [
            { type: 'harvest', target: 'Cabbage', amount: 3, description: 'Bring in three fields of cabbage from Ebba\'s seed' },
            { type: 'give', target: 'Cabbage', amount: 10, description: 'Bring Ebba the ten best heads' },
            { type: 'talk', target: null, amount: 1, description: 'Put them on the scale for Ebba' },
        ],
    },
];

const close = (label: string) => ({ label, next_stage: null, action: 'close' });

/** Every NPC's stages, built once the quest ids are known. */
function dialogues(q: Record<string, number>): Record<string, Stage[]> {
    const start = (name: string, label: string, next: string) => ({ label, next_stage: next, action: `start_quest:${q[name]}` });
    const handIn = (name: string, label: string) => ({ label, next_stage: null, action: `complete_talk_objective:${q[name]}` });
    return {
        Nan: [
            { key: 'nan1:intro', lines: [
                'You\'ll do. You have the look of someone who walks about.',
                'That box under my window has been bare since the frost. I can\'t get up the cliff roads the way I used to.',
                'Sea thrift. The pink. It grows along every wall on this island, so it can\'t be hard to find. Ten heads of it.',
            ], options: [start("Nan's Window Box", '"Ten. I can do that."', 'nan1:accepted'), close('"Not today."')] },
            { key: 'nan1:accepted', lines: [
                'Not the pale ones. The pale ones look tired.',
                'You\'ll see it by the roads. Pick it as you go.',
            ], options: [close('"Pink. Not tired."')] },
            { key: 'nan1:progress', lines: [
                'That isn\'t ten. I counted the box twice.',
                'By the roads. It grows on the walls.',
            ], options: [close('"Still looking."')] },
            { key: 'nan1:ready', lines: [
                'Let me see them.',
                'Yes. These will do. Most of them.',
            ], options: [handIn("Nan's Window Box", '"Here you are."')] },
            { key: 'nan2:intro', lines: [
                'I\'ve been looking at it all morning.',
                'Thrift grows on every wall from here to the Narrows. Anyone walking past sees my box and thinks, she\'s only put thrift in it.',
                'Gentian. The blue ones, up on the high roads. Three. Three is plenty. I\'m not greedy.',
            ], options: [start('Something Nobody Else Has', '"Three gentians."', 'nan2:accepted'), close('"Another time."')] },
            { key: 'nan2:accepted', lines: [
                'They shut when a cloud comes over, so look for them in the sun.',
            ], options: [close('"In the sun."')] },
            { key: 'nan2:progress', lines: [
                'Three gentians. Up where it\'s cold.',
            ], options: [close('"I know."')] },
            { key: 'nan2:ready', lines: [
                'Oh, that\'s the blue I meant.',
                'Put them at the front. No, the front. That\'s the back.',
            ], options: [handIn('Something Nobody Else Has', '"At the front."')] },
            { key: 'nan3:intro', lines: [
                'It wants something hanging over the edge. A box looks mean with nothing hanging over the edge.',
                'There\'s a green that grows down on the tidal shore at Farvick Narrows. Samphire, the fishwives call it. Ten stems.',
                'It\'s down among the rock pools, and it wants someone who knows the shore to find it.',
            ], options: [start('Over the Edge', '"Ten stems of samphire."', 'nan3:accepted'), close('"Not just now."')] },
            { key: 'nan3:accepted', lines: [
                'Mind the tide.',
            ], options: [close('"I will."')] },
            { key: 'nan3:progress', lines: [
                'Still nothing hanging over the edge.',
            ], options: [close('"Soon."')] },
            { key: 'nan3:ready', lines: [
                'Samphire. It smells of the sea. Good.',
                'Now, I\'ve been thinking about the thrift.',
            ], options: [handIn('Over the Edge', '"What about the thrift?"')] },
            { key: 'nan3:complete', lines: [
                'I took the thrift out after you\'d gone. The box looked bare without it, so I put it all back in.',
                'It\'s a good box now. Look at it whenever you\'re passing.',
            ], options: [close('"It\'s a good box."')] },
        ],
        'Aldous Penhallow': [
            { key: 'intro', lines: [
                'Complaints are made in writing, at this desk, between the morning tide and the evening one.',
                'You\'ve come about the Snallygaster. Everyone comes about the Snallygaster. It took a ram off the Vergehorns road last month, and a line of washing the month before.',
                'I have the form. The form is complete, except for the creature\'s part. A complaint must be acknowledged by the party complained of.',
                'A scale will do. Pressed in the margin.',
            ], options: [start('A Complaint Regarding the Snallygaster', '"I\'ll get you a scale."', 'accepted'), close('"I\'ll leave you to it."')] },
            { key: 'accepted', lines: [
                'It keeps to the Horns, out on the Vergehorns. It does not sign anything willingly.',
                'Bring the scale flat, if you can. A curled one won\'t press.',
            ], options: [close('"Flat. Understood."')] },
            { key: 'progress', lines: [
                'The form is still waiting on its signature.',
            ], options: [close('"I\'m working on it."')] },
            { key: 'ready', lines: [
                'That is a scale. That is a Snallygaster\'s scale.',
                'Pressed in the margin, so. Signed, dated, and filed. The harbormaster will reply in due course.',
            ], options: [handIn('A Complaint Regarding the Snallygaster', '"How long is due course?"')] },
            { key: 'complete', lines: [
                'Six to eight years, as a rule. I\'ll send word.',
                'If it takes another ram in the meantime, that\'s a second complaint, and a second form.',
            ], options: [close('"Of course it is."')] },
        ],
        'Wat Greening': [
            { key: 'intro', lines: [
                'See that, over the hedge? That\'s Ebba Furrow\'s cabbage patch.',
                'She tells people hers are bigger. Her cabbages are not bigger. Her cabbages are puffed up, same as her.',
                'I need someone with no side in it. Grow three fields from my seed and bring me the ten best heads. Then we weigh them in front of everyone.',
            ], options: [start("Wat's Cabbages", '"I\'ll grow them."', 'accepted'), close('"I\'d rather stay out of it."')] },
            { key: 'accepted', lines: [
                'That\'s my own seed. Thirty of them. Don\'t let her near it.',
            ], options: [close('"I won\'t."')] },
            { key: 'progress', lines: [
                'Three fields, then the ten best heads. The best, mind.',
            ], options: [close('"The best."')] },
            { key: 'ready', lines: [
                'Look at the size of that one. Ebba\'s never grown a head like that in her life.',
                'On the scale with them. Everyone watching.',
            ], options: [handIn("Wat's Cabbages", '"They\'re good cabbages."')] },
            { key: 'complete', lines: [
                'The whole village saw it. She\'s gone inside and shut the door.',
                'You\'re welcome at my table any time.',
            ], options: [close('"Thank you, Wat."')] },
            { key: 'rival', lines: [
                'Oh. It\'s you.',
                'I hear you\'ve been growing for the other side of the hedge.',
                'Mind the gate on your way out.',
            ], options: [close('"Good day, Wat."')] },
        ],
        'Ebba Furrow': [
            { key: 'intro', lines: [
                'You\'ll have met Wat. Everybody meets Wat. He makes sure of it.',
                'Forty years he\'s been leaning on that hedge, telling people his cabbages are bigger than mine.',
                'I don\'t want to argue. I want it settled. Grow three fields from my seed, bring me the ten best heads, and we\'ll put them on the scale.',
            ], options: [start("Ebba's Cabbages", '"I\'ll grow them."', 'accepted'), close('"I\'d rather stay out of it."')] },
            { key: 'accepted', lines: [
                'Thirty seeds. Plant them deep. They like their feet cold.',
            ], options: [close('"Deep and cold."')] },
            { key: 'progress', lines: [
                'Three fields, then the ten best heads.',
            ], options: [close('"Soon."')] },
            { key: 'ready', lines: [
                'Well. Put them on the scale.',
                'Heavier than his. I knew it, but it\'s nice to have it seen.',
            ], options: [handIn("Ebba's Cabbages", '"Heavier than his."')] },
            { key: 'complete', lines: [
                'I\'ve no more to say about cabbages. I said it all, and I was right.',
                'There\'s seed in it for you. Beets and leeks. Grow those. They don\'t argue.',
            ], options: [close('"Thank you, Ebba."')] },
            { key: 'rival', lines: [
                'I know whose seed you planted.',
                'Good day to you.',
            ], options: [close('"Good day."')] },
        ],
    };
}

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('quests', 'stage_prefix'))) {
        await knex.schema.alterTable('quests', (t) => {
            t.string('stage_prefix', 30).nullable();
            t.integer('requires_quest_id').nullable().references('id').inTable('quests').onDelete('SET NULL');
            t.string('exclusive_group', 50).nullable();
        });
    }
    if (!(await hasContent(knex))) return;

    const placeId = async (name: string) => {
        const row = await knex('locations').where({ name }).first('id');
        if (!row) throw new Error(`antura_quests: no location named ${name}`);
        return Number(row.id);
    };
    for (const d of QUESTS) {
        for (const it of [...d.startItems, ...d.rewardItems]) {
            if (!(await knex('items').where({ name: it.itemName }).first('id'))) throw new Error(`antura_quests: no item named ${it.itemName}`);
        }
        for (const o of d.objectives) {
            if (o.type === 'kill' && !(await knex('creatures').where({ name: o.target }).first('id'))) throw new Error(`antura_quests: no creature named ${o.target}`);
            if ((o.type === 'give' || o.type === 'harvest') && !(await knex('items').where({ name: o.target }).first('id'))) throw new Error(`antura_quests: no item named ${o.target}`);
        }
        for (const s of [d.skill, ...d.skillXp.map(x => x.skill)].filter(Boolean)) {
            if (!(await knex('skills').where({ name: s }).first('id'))) throw new Error(`antura_quests: no skill named ${s}`);
        }
    }

    const npcIds: Record<string, number> = {};
    for (const n of NPCS) {
        const row = { name: n.name, title: n.title, location_id: await placeId(n.place), avatar: n.avatar, is_active: true };
        const had = await knex('npcs').where({ name: n.name }).first('id');
        if (had) { await knex('npcs').where({ id: had.id }).update(row); npcIds[n.name] = Number(had.id); }
        else npcIds[n.name] = Number((await knex('npcs').insert(row).returning('id'))[0].id);
    }

    const questIds: Record<string, number> = {};
    for (const d of QUESTS) {
        const row = {
            name: d.name, description: d.description, skill: d.skill, npc_name: d.npc, location_id: await placeId(d.place),
            is_active: true, is_tutorial: false, reward_xp: d.xp, reward_gold: d.gold,
            reward_skill_xp: d.skillXp.length ? JSON.stringify(d.skillXp) : null,
            start_items: d.startItems.length ? JSON.stringify(d.startItems) : null,
            reward_items: d.rewardItems.length ? JSON.stringify(d.rewardItems) : null,
            stage_prefix: d.prefix,
            requires_quest_id: d.requires ? questIds[d.requires] : null,
            exclusive_group: d.group,
        };
        if (d.requires && !questIds[d.requires]) throw new Error(`antura_quests: ${d.name} requires ${d.requires}, which comes later in the list`);
        const had = await knex('quests').where({ name: d.name }).first('id');
        let id: number;
        if (had) { id = Number(had.id); await knex('quests').where({ id }).update({ ...row, updated_at: knex.fn.now() }); }
        else id = Number((await knex('quests').insert(row).returning('id'))[0].id);
        questIds[d.name] = id;
        // Objectives by order, upserted, so a re-run keeps every player's progress rows.
        for (const [i, o] of d.objectives.entries()) {
            const orow = { quest_id: id, order: i + 1, description: o.description, type: o.type, target_item: o.target, required_amount: o.amount };
            const had2 = await knex('quest_objectives').where({ quest_id: id, order: i + 1 }).first('id');
            if (had2) await knex('quest_objectives').where({ id: had2.id }).update(orow);
            else await knex('quest_objectives').insert(orow);
        }
    }

    // Dialogue: text_lines is text[] (a plain array), options jsonb (stringified).
    for (const [npcName, stages] of Object.entries(dialogues(questIds))) {
        const npcId = npcIds[npcName];
        await knex('npc_dialogues').where({ npc_id: npcId }).delete();
        for (const st of stages) {
            await knex('npc_dialogues').insert({ npc_id: npcId, stage_key: st.key, text_lines: st.lines, options: JSON.stringify(st.options) });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    // Cascades take each quest's player rows and objectives with it.
    const names = QUESTS.map(q => q.name);
    const ids = await knex('quests').whereIn('name', names).pluck('id');
    if (ids.length) {
        await knex('player_quest_objectives').whereIn('objective_id', knex('quest_objectives').whereIn('quest_id', ids).select('id')).delete();
        await knex('quest_objectives').whereIn('quest_id', ids).delete();
        await knex('player_quests').whereIn('quest_id', ids).delete();
        await knex('quests').whereIn('id', ids).delete();
    }
    const npcIds = await knex('npcs').whereIn('name', NPCS.map(n => n.name)).pluck('id');
    if (npcIds.length) {
        await knex('npc_dialogues').whereIn('npc_id', npcIds).delete();
        await knex('npcs').whereIn('id', npcIds).delete();
    }
    if (await knex.schema.hasColumn('quests', 'stage_prefix')) {
        await knex.schema.alterTable('quests', (t) => {
            t.dropColumn('exclusive_group');
            t.dropColumn('requires_quest_id');
            t.dropColumn('stage_prefix');
        });
    }
}
