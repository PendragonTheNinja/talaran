import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 3c (docs/talar-spec.md §1; Nathan, 2026-10-27): Georome, the
// Laranist priest and Talar tutor, and his church at the Talar Rift.
//
//   churches / church_writings   a church is a building opened from its
//                                location's menu, on the museum's pattern. A
//                                lore building first: its writings are rows.
//                                Spells are learned at churches (Nathan,
//                                2026-10-27), which step 4 adds to it.
//   The Priest's Portion         he gives a Cut Quartz: fill it at the Rift,
//                                take the light into yourself, come back. Pays
//                                Talar XP and a Lit Quartz, so the reservoir
//                                holds something when spells arrive. Objective
//                                types 'talar_fill' and 'talar_absorb' are
//                                reported by services/talar.ts after commit.
//
// Lore rule (spec §1): player-facing text never names what lies under the
// Rift. Laranists are right that the world was made, that there were two, and
// that something lies at the seam; they are wrong about what.

const LOCATION = 'Talar Rift';
const NPC_NAME = 'Georome';
const QUEST_NAME = "The Priest's Portion";

const CHURCH = {
    key: 'seam_chapel',
    name: 'The Seam Chapel',
    faith: 'Laranist',
    description: 'A low stone chapel built hard against the lip of the Rift. Its east wall was never finished, and the light comes in through the gap.',
};

const WRITINGS = [
    {
        title: 'The Making',
        body: [
            'Before there was anything there were two. The ground, heavy and patient. The sky, light and never still.',
            'They lay apart a long while, and neither could make anything alone. Then they were pressed together, the one upon the other, and from the pressing came all that grows and walks and swims.',
            'But they did not close true. Where they met there is a seam, and the seam is here. Stand at the edge and look down. That is where the world was joined.',
            'What rises out of it is what was left between them when they met. We call it the light, because we have no better word. Neither did our mothers.',
        ],
    },
    {
        title: 'On the Light',
        body: [
            'The light rises strongest at night and in the cold months. In high summer you may stand at the edge an hour and feel nothing but the wind.',
            'It will not stay in the hand. It runs off skin like water off a duck. A cut stone holds it, because a stone is a piece of the ground, and the ground was always the patient half.',
            'The better the stone is cut, the more it holds and the quicker it drinks. A flawless stone is greedy. Give it time.',
            'A person can take the light out of a stone and keep it, the way a well keeps rain. Some can do more with it than keep it. That is a matter for those who have learned.',
        ],
    },
    {
        title: 'The Rule of the Chapel',
        body: [
            'No lamps past the doorstep. The light we keep here does not need help.',
            'Do not throw anything into the Rift. Nine winters ago a carter threw his dog\'s bones in, and the light did not rise for a month.',
            'Leave the edge as you found it. The stones along the lip were set by people older than this chapel.',
            'Speak quietly. Not for our sake.',
        ],
    },
    {
        title: 'A Song for the Seam',
        body: [
            'Ground below and sky above,',
            'pressed together, out of love',
            'or out of need, the old songs say;',
            'the seam is here and here to stay.',
            'What is left between the two',
            'comes up at night like morning dew.',
            'Hold out your stone and let it fill.',
            'The ground is patient. Keep it still.',
        ],
    },
];

const START_ITEMS = [{ itemName: 'Cut Quartz', qty: 1 }];
const REWARD_ITEMS = [{ itemName: 'Lit Quartz', qty: 1 }];
const REWARD_SKILL = 'Talar';
const REWARD_XP = 500;

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('churches'))) {
        await knex.schema.createTable('churches', t => {
            t.increments('id').primary();
            t.string('key', 50).notNullable().unique();
            t.integer('location_id').notNullable().references('id').inTable('locations');
            t.string('name', 100).notNullable();
            t.string('faith', 50).nullable();
            t.text('description').nullable();
            t.timestamps(true, true);
        });
    }
    if (!(await knex.schema.hasTable('church_writings'))) {
        await knex.schema.createTable('church_writings', t => {
            t.increments('id').primary();
            t.integer('church_id').notNullable().references('id').inTable('churches').onDelete('CASCADE');
            t.string('title', 100).notNullable();
            t.text('body').notNullable();
            t.integer('display_order').notNullable().defaultTo(0);
            t.timestamps(true, true);
        });
    }

    if (!(await hasContent(knex))) return;

    const rift = await knex('locations').where({ name: LOCATION }).first();
    if (!rift) throw new Error(`georome_church: no location named ${LOCATION}`);
    for (const { itemName } of [...START_ITEMS, ...REWARD_ITEMS]) {
        if (!(await knex('items').where({ name: itemName }).first())) throw new Error(`georome_church: no item named ${itemName}`);
    }
    if (!(await knex('skills').where({ name: REWARD_SKILL }).first())) throw new Error(`georome_church: no skill named ${REWARD_SKILL}`);

    // ── The church and its writings ─────────────────────────────────────────
    let church = await knex('churches').where({ key: CHURCH.key }).first();
    if (church) await knex('churches').where({ id: church.id }).update({ ...CHURCH, location_id: rift.id, updated_at: knex.fn.now() });
    else [church] = await knex('churches').insert({ ...CHURCH, location_id: rift.id }).returning('*');
    await knex('church_writings').where({ church_id: church.id }).delete();
    await knex('church_writings').insert(WRITINGS.map((w, i) => ({
        church_id: church.id, title: w.title, body: w.body.join('\n\n'), display_order: i + 1,
    })));

    // ── Quest ───────────────────────────────────────────────────────────────
    const questRow = {
        name: QUEST_NAME,
        description: 'Georome keeps the chapel at the Rift. He will give you a cut stone to fill, and show you what to do with the light once it is in.',
        skill: REWARD_SKILL,
        npc_name: NPC_NAME,
        location_id: rift.id,
        is_active: true,
        is_tutorial: true,
        start_items: JSON.stringify(START_ITEMS),
        reward_items: JSON.stringify(REWARD_ITEMS),
        reward_xp: REWARD_XP,
        reward_gold: 0,
    };
    let quest = await knex('quests').where({ name: QUEST_NAME }).first();
    if (quest) await knex('quests').where({ id: quest.id }).update({ ...questRow, updated_at: knex.fn.now() });
    else [quest] = await knex('quests').insert(questRow).returning('*');

    if (!(await knex('quest_objectives').where({ quest_id: quest.id }).first())) {
        await knex('quest_objectives').insert([
            { quest_id: quest.id, order: 1, description: 'Fill the Cut Quartz at the edge of the Rift', type: 'talar_fill', target_item: 'Lit Quartz', required_amount: 1 },
            { quest_id: quest.id, order: 2, description: 'Take the light of a Lit Quartz into yourself', type: 'talar_absorb', target_item: 'Lit Quartz', required_amount: 1 },
            { quest_id: quest.id, order: 3, description: 'Return to Georome', type: 'talk', target_item: null, required_amount: 1 },
        ]);
    }

    // ── Georome ─────────────────────────────────────────────────────────────
    let npc = await knex('npcs').where({ name: NPC_NAME }).first();
    if (!npc) {
        [npc] = await knex('npcs').insert({
            name: NPC_NAME, title: 'Priest of the Seam Chapel', location_id: rift.id,
            submenu: null, avatar: '🕯️', is_active: true,
        }).returning('*');
    }

    // Quest ID, never the name, in every action (resolveActionQuest in routes/npcs.ts).
    await knex('npc_dialogues').where({ npc_id: npc.id }).delete();
    await knex('npc_dialogues').insert([
        {
            npc_id: npc.id, stage_key: 'intro',
            text_lines: [
                'Careful at the edge. People come up here to look down, and some of them lean.',
                'Georome. I keep the chapel. Somebody has to sweep it.',
                'You feel it, I expect. A sort of warmth coming up, like standing over a bread oven. That is the light. It has been coming up out of the seam since before anyone thought to build a wall beside it.',
                'You cannot hold it in your hand. But you can hold it in a stone, and then you can hold it in yourself. Would you like to learn how?',
            ],
            options: JSON.stringify([
                { label: '"Show me."', next_stage: 'offer', action: null },
                { label: '"Another day."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: npc.id, stage_key: 'offer',
            text_lines: [
                'Here. A quartz, cut clean. Geosper in Caliwen cuts them for me, and grumbles about it.',
                'Hold it out over the Rift and let it drink. It takes half an hour or so for a stone like that. Do not hurry it.',
                'When it is full it will glow. Then take the light out of it. Hold it, and let it go into you. You will know how when the time comes. Everybody does.',
                'Come back to me after.',
            ],
            options: JSON.stringify([
                { label: '"I\'ll fill it."', next_stage: 'accepted', action: `start_quest:${quest.id}` },
                { label: '"Not just now."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: npc.id, stage_key: 'accepted',
            text_lines: [
                'Stand anywhere along the lip and hold the stone out. Fill a Gem, they call it in the town, as if it were a bucket at a pump. Near enough.',
                'Once it glows, find it in your pack and take the light in.',
            ],
            options: JSON.stringify([{ label: '"Half an hour."', next_stage: null, action: 'close' }]),
        },
        {
            npc_id: npc.id, stage_key: 'progress',
            text_lines: [
                'Still filling? Patience. The ground was always the patient half.',
                'When it glows, take the light in, then come and see me.',
            ],
            options: JSON.stringify([{ label: '"Going."', next_stage: null, action: 'close' }]),
        },
        {
            npc_id: npc.id, stage_key: 'ready',
            text_lines: [
                'There. You are standing a little straighter. They all do, the first time.',
                'That light stays in you. It does not leak and it does not spoil, and it does not leave you if you fall. The more you work with it, the more room you find for it.',
                'Take this one too. Already full. Keep it for when you need it.',
                'There are things a person can do with the light inside them. We teach some of them here, in time. Read the writings in the chapel while you wait. They are short. Mostly.',
            ],
            options: JSON.stringify([
                { label: '"Thank you, Georome."', next_stage: null, action: `complete_talk_objective:${quest.id}` },
            ]),
        },
        {
            npc_id: npc.id, stage_key: 'complete',
            text_lines: [
                'Back again. The light is strong tonight.',
                'Bring cut stones and fill them here whenever you like. Quartz drinks quickest. Garnet holds more, once you have the knack for it.',
            ],
            options: JSON.stringify([{ label: '"Goodnight."', next_stage: null, action: 'close' }]),
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
    await knex.schema.dropTableIfExists('church_writings');
    await knex.schema.dropTableIfExists('churches');
}
