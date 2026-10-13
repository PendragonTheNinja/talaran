import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Georold, the combat tutor (Nathan, 2026-10-13). Jerrold with the Geo- swap.
//
// A retired warden of the Talador docks who still keeps the quay clear of
// rats, and counts everything: ships, rats, years. Short orders, dry asides,
// never impressed.
//
// The lesson is the Bestiary. On accept the player picks a mace or a spear
// (crush or pierce) and gets some cooked fish. Ten Dock Rats later the
// Bestiary says the rat is weak to slash, and Georold hands over a scimitar:
// find out what a thing hates, then bring it. Bracers too, and experience in
// all three combat skills.
//
// Two things the quest system did not do before, added here as columns:
//
//   quests.start_choices    JSON [{ key, label, items: [{ itemName, qty }] }].
//                           Accepting names one: "start_quest:<id>:<key>"
//                           (routes/npcs.ts), and that choice's items come
//                           with start_items.
//   quests.reward_skill_xp  JSON [{ skill, xp }], paid beside skill/reward_xp
//                           (questXpAwards in routes/quests.ts).
//
// The objective is the new 'kill' type: target is the creature's name, counted
// after each fight commits (afterFight in services/combatFights.ts), and kills
// before the quest count (backfillQuestObjectives).

const QUEST_NAME = 'The Warden\'s Count';
const NPC_NAME = 'Georold';
const CREATURE = 'Dock Rat';
const KILLS = 10;

const START_ITEMS = [{ itemName: 'Cooked Whiting', qty: 5 }];
const START_CHOICES = [
    { key: 'mace', label: 'Ambren Mace', items: [{ itemName: 'Ambren Mace', qty: 1 }] },
    { key: 'spear', label: 'Ambren Spear', items: [{ itemName: 'Ambren Spear', qty: 1 }] },
];
const REWARD_ITEMS = [{ itemName: 'Ambren Scimitar', qty: 1 }, { itemName: 'Ambren Bracers', qty: 1 }];
const REWARD_SKILL = 'Melee';
const REWARD_XP = 1000;
const REWARD_SKILL_XP = [{ skill: 'Defense', xp: 1500 }, { skill: 'Constitution', xp: 750 }];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('quests', 'start_choices'))) {
        await knex.schema.alterTable('quests', t => { t.text('start_choices'); });
    }
    if (!(await knex.schema.hasColumn('quests', 'reward_skill_xp'))) {
        await knex.schema.alterTable('quests', t => { t.text('reward_skill_xp'); });
    }

    // A fresh database before content:import (lib/migrationContent.ts): schema only.
    if (!(await hasContent(knex))) return;

    const talador = await knex('locations').where({ name: 'Talador' }).first();
    if (!talador) throw new Error('georold_combat_tutor: no location named Talador');
    if (!(await knex('creatures').where({ name: CREATURE }).first())) throw new Error(`georold_combat_tutor: no creature named ${CREATURE}`);
    const itemNames = [...START_ITEMS, ...START_CHOICES.flatMap(c => c.items), ...REWARD_ITEMS].map(i => i.itemName);
    for (const name of itemNames) {
        if (!(await knex('items').where({ name }).first())) throw new Error(`georold_combat_tutor: no item named ${name}`);
    }
    for (const skill of [REWARD_SKILL, ...REWARD_SKILL_XP.map(r => r.skill)]) {
        if (!(await knex('skills').where({ name: skill }).first())) throw new Error(`georold_combat_tutor: no skill named ${skill}`);
    }

    // ── Quest ───────────────────────────────────────────────────────────────
    const questRow = {
        name: QUEST_NAME,
        description: 'Georold kept the Talador docks for thirty-one years and still keeps count of the rats. '
            + 'He will teach you to fight, starting with ten of them.',
        skill: REWARD_SKILL,
        npc_name: NPC_NAME,
        location_id: talador.id,
        is_active: true,
        start_items: JSON.stringify(START_ITEMS),
        start_choices: JSON.stringify(START_CHOICES),
        reward_items: JSON.stringify(REWARD_ITEMS),
        reward_xp: REWARD_XP,
        reward_skill_xp: JSON.stringify(REWARD_SKILL_XP),
        reward_gold: 0,
    };
    let quest = await knex('quests').where({ name: QUEST_NAME }).first();
    if (quest) {
        await knex('quests').where({ id: quest.id }).update({ ...questRow, updated_at: knex.fn.now() });
    } else {
        [quest] = await knex('quests').insert(questRow).returning('*');
    }

    if (!(await knex('quest_objectives').where({ quest_id: quest.id }).first())) {
        await knex('quest_objectives').insert([
            {
                quest_id: quest.id,
                order: 1,
                description: `Kill ${KILLS} Dock Rats at The Docks`,
                type: 'kill',
                target_item: CREATURE,
                required_amount: KILLS,
            },
            {
                quest_id: quest.id,
                order: 2,
                description: 'Return to Georold',
                type: 'talk',
                target_item: null,
                required_amount: 1,
            },
        ]);
    }

    // ── Georold ─────────────────────────────────────────────────────────────
    let npc = await knex('npcs').where({ name: NPC_NAME }).first();
    if (!npc) {
        [npc] = await knex('npcs').insert({
            name: NPC_NAME,
            title: 'Retired Warden of the Docks',
            location_id: talador.id,
            submenu: null,
            avatar: '⚓',
            is_active: true,
        }).returning('*');
    }

    // Quest ID, never the name, in every action (resolveActionQuest in routes/npcs.ts).
    await knex('npc_dialogues').where({ npc_id: npc.id }).delete();
    await knex('npc_dialogues').insert([
        {
            npc_id: npc.id,
            stage_key: 'intro',
            text_lines: [
                'Stand there. No. There, on the line. Good.',
                'Georold. Warden of these docks for thirty-one years, retired for four. The rats did not retire.',
                'Seven ships tied up today. Every one of them brought rats ashore with the cargo. I have the number. You do not want it.',
                'You want to learn to fight. Everybody does, until something bites back. Ten rats. Then we talk.',
            ],
            options: JSON.stringify([
                { label: '"Ten rats. Fine."', next_stage: 'offer', action: null },
                { label: '"Not today."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: npc.id,
            stage_key: 'offer',
            text_lines: [
                'Pick one. I have two to spare and you are not having both.',
                'The mace. Heavy head, breaks what it lands on. The spear. Long reach, goes in where you point it.',
                'Neither one is the right answer. That is the lesson, and you will learn it on rats.',
                'Take the fish as well. Whiting, cooked last night. Health low, you eat. Lower than that, you walk away. Nobody on this quay is carrying you home.',
            ],
            options: JSON.stringify([
                { label: '"The mace."', next_stage: 'accepted', action: `start_quest:${quest.id}:mace` },
                { label: '"The spear."', next_stage: 'accepted', action: `start_quest:${quest.id}:spear` },
                { label: '"I\'ll come back."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: npc.id,
            stage_key: 'accepted',
            text_lines: [
                'Put it on. A weapon in a pack has never killed anything.',
                'The Docks are down the quay, among the warehouses. They come at you one after another down there. Keep count. I will.',
                'Every creature you put down goes in the Bestiary. There is a link to it beside your count when you fight. The more of a thing you kill, the more it tells you.',
                'Ten rats and it starts telling you something worth knowing.',
            ],
            options: JSON.stringify([{ label: '"Ten rats."', next_stage: null, action: 'close' }]),
        },
        {
            npc_id: npc.id,
            stage_key: 'progress',
            text_lines: [
                'That is not ten. I would know.',
                'Eat before you need to. Not after.',
            ],
            options: JSON.stringify([{ label: '"Going."', next_stage: null, action: 'close' }]),
        },
        {
            npc_id: npc.id,
            stage_key: 'ready',
            text_lines: [
                'Ten. I counted. Open your Bestiary and tell me what it says about rats.',
                'Weak to slash. Yes. Thirty-one years and they still do not care for an edge.',
                'So you have been hitting them with the wrong thing. Find out what a creature hates, then bring it. That was the lesson.',
                'Here. A scimitar, which slashes. And bracers, because the next thing along this coast will bite harder than a rat, and you will want something between it and your arm.',
                'Change weapons before you go back down there. I will be watching.',
            ],
            options: JSON.stringify([
                { label: '"Thank you, Warden."', next_stage: null, action: `complete_talk_objective:${quest.id}` },
            ]),
        },
        {
            npc_id: npc.id,
            stage_key: 'complete',
            text_lines: [
                'Still here? The rats are not. Two hundred and six this morning.',
                'Further along the coast there are worse things than rats. Read the Bestiary before you fight them.',
                'Eat. Watch your health. Leave while you still can. Nobody listens to that last part. I have fished two out of the harbour who did not.',
            ],
            options: JSON.stringify([{ label: '"I\'ll listen."', next_stage: null, action: 'close' }]),
        },
    ]);
}

export async function down(knex: Knex): Promise<void> {
    const npc = await knex('npcs').where({ name: NPC_NAME }).first();
    if (npc) {
        await knex('npc_dialogues').where({ npc_id: npc.id }).delete();
        await knex('npcs').where({ id: npc.id }).delete();
    }
    const quest = await knex('quests').where({ name: QUEST_NAME }).first();
    if (quest) {
        const objectiveIds = await knex('quest_objectives').where({ quest_id: quest.id }).pluck('id');
        if (objectiveIds.length) await knex('player_quest_objectives').whereIn('objective_id', objectiveIds).delete();
        await knex('quest_objectives').where({ quest_id: quest.id }).delete();
        await knex('player_quests').where({ quest_id: quest.id }).delete();
        await knex('quests').where({ id: quest.id }).delete();
    }
    if (await knex.schema.hasColumn('quests', 'reward_skill_xp')) {
        await knex.schema.alterTable('quests', t => { t.dropColumn('reward_skill_xp'); });
    }
    if (await knex.schema.hasColumn('quests', 'start_choices')) {
        await knex.schema.alterTable('quests', t => { t.dropColumn('start_choices'); });
    }
}
