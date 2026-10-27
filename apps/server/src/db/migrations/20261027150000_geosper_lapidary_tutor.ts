import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Geosper, the Crafting tutor at Caliwen (Nathan, 2026-10-27). Jesper with the
// Geo- swap; Jesper is the Danish Jasper, and a jasper is a stone.
//
// Caliwen was the one trade town with nobody in it. Geosper cuts gems, and his
// quest is the lapidary's way in: he hands over two rough quartz, the player
// cuts them on his old wheel (PUBLIC_STATIONS in services/workstations.ts, half
// speed, his tools lent for every job), and he pays a chisel and Crafting XP so
// a lapidary of one's own is half built. The quest stays the key to his wheel
// afterwards, as Geoffrey's, Geossica's and Geomima's do.
//
// The objective is the existing 'crafting' type: resolveRecipe reports every
// craft under its skill, by the recipe's output (Cut Quartz whatever grade
// came off the wheel).

const QUEST_NAME = "The Lapidary's Lesson";
const NPC_NAME = 'Geosper';
const LOCATION = 'Caliwen';

const START_ITEMS = [{ itemName: 'Rough Quartz', qty: 2 }];
const REWARD_ITEMS = [{ itemName: 'Ambren Gem Chisel', qty: 1 }];
const REWARD_SKILL = 'Crafting';
const REWARD_XP = 500;

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    const caliwen = await knex('locations').where({ name: LOCATION }).first();
    if (!caliwen) throw new Error(`geosper_lapidary_tutor: no location named ${LOCATION}`);
    for (const { itemName } of [...START_ITEMS, ...REWARD_ITEMS, { itemName: 'Cut Quartz' }]) {
        if (!(await knex('items').where({ name: itemName }).first())) throw new Error(`geosper_lapidary_tutor: no item named ${itemName}`);
    }
    if (!(await knex('skills').where({ name: REWARD_SKILL }).first())) throw new Error(`geosper_lapidary_tutor: no skill named ${REWARD_SKILL}`);

    // ── Quest ───────────────────────────────────────────────────────────────
    const questRow = {
        name: QUEST_NAME,
        description: 'Geosper cuts stones at Caliwen. Cut two rough quartz on his old wheel and he will let you go on using it.',
        skill: REWARD_SKILL,
        npc_name: NPC_NAME,
        location_id: caliwen.id,
        is_active: true,
        start_items: JSON.stringify(START_ITEMS),
        reward_items: JSON.stringify(REWARD_ITEMS),
        reward_xp: REWARD_XP,
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
                description: 'Cut 2 Rough Quartz at the lapidary in Caliwen',
                type: 'crafting',
                target_item: 'Cut Quartz',
                required_amount: 2,
            },
            {
                quest_id: quest.id,
                order: 2,
                description: 'Return to Geosper',
                type: 'talk',
                target_item: null,
                required_amount: 1,
            },
        ]);
    }

    // ── Geosper ─────────────────────────────────────────────────────────────
    let npc = await knex('npcs').where({ name: NPC_NAME }).first();
    if (!npc) {
        [npc] = await knex('npcs').insert({
            name: NPC_NAME,
            title: 'Gem Cutter of Caliwen',
            location_id: caliwen.id,
            submenu: null,
            avatar: '💎',
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
                'Mind the dust. Granite grit gets into everything. My tea, mostly.',
                'Geosper. I cut stones. Everybody else in Caliwen works leather and cloth, and they think a man who sits at a wheel all day is a bit odd. They are not wrong.',
                'My mother named me after a stone she never owned. I have owned a great many since. Sold most of them.',
                'You have the look of somebody who found a pebble that glinted and put it in their pocket. Have you?',
            ],
            options: JSON.stringify([
                { label: '"I might have."', next_stage: 'offer', action: null },
                { label: '"Not today."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: npc.id,
            stage_key: 'offer',
            text_lines: [
                'Here. Two bits of rough quartz, out of the granite at Grundagr. Dull as old soap, both of them.',
                'Sit at my wheel. Split each one along its grain with the chisel first, then hold it to the stone and let the wheel do the work. Do not push.',
                'Most come off plain cut. Some come off polished. Now and then one comes off flawless, and you will remember the day.',
                'My wheel is slow, mind. It is old. So am I. Cut those two and come back.',
            ],
            options: JSON.stringify([
                { label: '"I\'ll cut them."', next_stage: 'accepted', action: `start_quest:${quest.id}` },
                { label: '"Another time."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: npc.id,
            stage_key: 'accepted',
            text_lines: [
                'The lapidary is in the Craftworks. Use mine until you have your own.',
                'A wheel is carpenter\'s work: Lanai planks and a face of granite. The chisel comes off an anvil. Neither is hard to come by.',
            ],
            options: JSON.stringify([{ label: '"Two stones."', next_stage: null, action: 'close' }]),
        },
        {
            npc_id: npc.id,
            stage_key: 'progress',
            text_lines: [
                'Two dull stones still in your pack, I would guess. The wheel will not turn itself.',
                'Gently. Let the grit do the cutting, not your arm.',
            ],
            options: JSON.stringify([{ label: '"Going."', next_stage: null, action: 'close' }]),
        },
        {
            npc_id: npc.id,
            stage_key: 'ready',
            text_lines: [
                'Let me see. Hold it up to the window. There. That is a stone somebody will want.',
                'A gem is only a rock that somebody bothered with. You bothered.',
                'Take this chisel. It is a spare, and sharper than it looks. Build a wheel to go with it and you will cut twice as fast as you can at mine.',
                'Quartz comes out of the granite, and out of the ore veins too. Garnet, if you are patient. Bring me something red one day.',
            ],
            options: JSON.stringify([
                { label: '"Thank you, Geosper."', next_stage: null, action: `complete_talk_objective:${quest.id}` },
            ]),
        },
        {
            npc_id: npc.id,
            stage_key: 'complete',
            text_lines: [
                'Back again? The wheel is where you left it.',
                'A rough stone in a pack is just a rock. A cut one is worth the walk to market.',
                'There are folk out at the Rift who will want cut stones. Do not ask me what for. I cut them. I do not pray over them.',
            ],
            options: JSON.stringify([{ label: '"I\'ll remember."', next_stage: null, action: 'close' }]),
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
}
