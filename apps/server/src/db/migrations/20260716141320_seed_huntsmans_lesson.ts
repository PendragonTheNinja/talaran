import type { Knex } from 'knex';

// The Huntsman's Lesson — Geonsen of Eld Grove.
// Third of the tutorial NPCs (Geoffrey/forge, Geossica/workshop, Geonsen/hunt).
// He hands over the starter bow + arrows on accept (moved out of auth.ts), and
// snares on completion — which is what bootstraps the feather -> arrow loop.
// submenu is null: he renders at the top of Eld Grove's action list.

export async function up(knex: Knex): Promise<void> {
    const eldGrove = await knex('locations').where({ name: 'Eld Grove' }).first();
    if (!eldGrove) throw new Error('seed_huntsmans_lesson: Eld Grove not found');

    // ── Quest ──
    let quest = await knex('quests').where({ name: "The Huntsman's Lesson" }).first();
    if (!quest) {
        [quest] = await knex('quests').insert({
            name: "The Huntsman's Lesson",
            description: 'Geonsen keeps the Eld Grove. He has offered to teach you to take game from it, and to leave some behind.',
            skill: 'Hunting',
            npc_name: 'Geonsen',
            location_id: eldGrove.id,
            is_active: true,
        }).returning('*');

        await knex('quest_objectives').insert([
            {
                quest_id: quest.id, order: 1,
                description: 'Take 3 Deer in the Eld Grove',
                type: 'hunt', target_item: 'Deer', required_amount: 3,
            },
            {
                quest_id: quest.id, order: 2,
                description: 'Return to Geonsen',
                type: 'talk', target_item: null, required_amount: 1,
            },
        ]);
    }

    await knex('quests').where({ id: quest.id }).update({
        start_items: JSON.stringify([
            { itemName: 'Lanai Hunting Bow', qty: 1 },
            { itemName: 'Ambren Arrow', qty: 100 },
        ]),
        reward_items: JSON.stringify([
            { itemName: 'Snare', qty: 3 },
            { itemName: 'Feathers', qty: 20 },
        ]),
        reward_xp: 500,
    });

    // ── Geonsen ──
    if (await knex('npcs').where({ name: 'Geonsen' }).first()) return;

    const [geonsen] = await knex('npcs').insert({
        name: 'Geonsen',
        title: 'Huntsman of the Eld Grove',
        location_id: eldGrove.id,
        submenu: null,
        avatar: '🏹',
        is_active: true,
    }).returning('*');

    await knex('npc_dialogues').insert([
        {
            npc_id: geonsen.id,
            stage_key: 'intro',
            text_lines: [
                "Stand still a moment. You walk like a man crossing a market square, and the grove has already told everything in it that you're here.",
                "I keep this wood. That means I take from it, and I leave it able to give again. Most who come through only learn the first half.",
                "You've no bow. I've a spare, and no great use for it. Learn to use it properly and it's yours.",
            ],
            options: JSON.stringify([
                { label: '"Teach me."', next_stage: 'offer', action: null },
                { label: '"Another time."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: geonsen.id,
            stage_key: 'offer',
            text_lines: [
                "Take it. Arrows too. You'll lose fewer than you think if you mind where they fall.",
                "Bring down three deer. Not two, not one lucky shot. Three, so I know it wasn't the grove being generous.",
            ],
            options: JSON.stringify([
                { label: 'Accept Quest', next_stage: 'progress', action: "start_quest:The Huntsman's Lesson" },
                { label: 'Cancel', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: geonsen.id,
            stage_key: 'progress',
            text_lines: [
                "Three deer. Track first, then close the distance, then loose. Rushing any of the three costs you an arrow and tells the wood you're a fool.",
            ],
            options: JSON.stringify([
                { label: 'Close', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: geonsen.id,
            stage_key: 'ready',
            text_lines: [
                "Three. And you've still most of your arrows, which says more than the deer do.",
                "Now the other half. A bow feeds a man who's watching. A snare feeds him while he sleeps — rabbits, pheasant, and things I'll not name in daylight.",
                "Here. Three snares, my own tying. Set them, walk your line, and don't leave a catch to the foxes. Learn to tie your own and you'll never want for arrows; it's the pheasant that gives you your fletching, not the deer.",
            ],
            options: JSON.stringify([
                { label: '"Thank you, Geonsen."', next_stage: 'complete', action: "complete_talk_objective:The Huntsman's Lesson" },
            ]),
        },
        {
            npc_id: geonsen.id,
            stage_key: 'complete',
            text_lines: [
                "The grove's yours to hunt, so long as you hunt it kindly. Take what you need. Leave the rest breeding.",
                "And if you ever haul a hide worth keeping, Caliwen's the place — bark and time make leather of it. Nothing I do here does.",
            ],
            options: JSON.stringify([
                { label: 'Farewell', next_stage: null, action: 'close' },
            ]),
        },
    ]);
}

export async function down(knex: Knex): Promise<void> {
    const geonsen = await knex('npcs').where({ name: 'Geonsen' }).first();
    if (geonsen) {
        await knex('npc_dialogues').where({ npc_id: geonsen.id }).delete();
        await knex('npcs').where({ id: geonsen.id }).delete();
    }
    const quest = await knex('quests').where({ name: "The Huntsman's Lesson" }).first();
    if (quest) {
        await knex('quest_objectives').where({ quest_id: quest.id }).delete();
        await knex('quests').where({ id: quest.id }).delete();
    }
}