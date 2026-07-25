import type { Knex } from 'knex';

// Georgic of Novita — the farming tutorial. Fourth of the Geo- tutorial NPCs
// (Geoffrey/forge, Geossica/workshop, Geonsen/hunt, Georgic/field). Named for the
// Georgics, Virgil's poem on working the land.
//
// He walks the whole loop: raise a farmstead, break a field, sow it, wait, lift the
// crop — then explains the parts that aren't discoverable on your own (soil going
// poor, rest and peas bringing it back, water hurrying a crop along) and points at
// Lanaivale for more seed.
//
// He does NOT hand over the farmstead materials. That grind is the point of the
// thing; what he gives is the tools and the first seed, so the work has somewhere
// to go.

export async function up(knex: Knex): Promise<void> {
    const novita = await knex('locations').where({ name: 'Novita' }).first();
    if (!novita) throw new Error('seed_georgics_lesson: Novita not found');

    // ── Quest ──
    let quest = await knex('quests').where({ name: "Georgic's Lesson" }).first();
    if (!quest) {
        [quest] = await knex('quests').insert({
            name: "Georgic's Lesson",
            description: 'Georgic has farmed at Novita longer than anyone can remember. He has offered to walk you through a full season, from raising a farmstead to lifting your first crop.',
            skill: 'Farming',
            npc_name: 'Georgic',
            location_id: novita.id,
            is_active: true,
        }).returning('*');

        await knex('quest_objectives').insert([
            {
                quest_id: quest.id, order: 1,
                description: 'Raise a farmstead at Novita',
                type: 'build', target_item: 'Farmstead', required_amount: 1,
            },
            {
                quest_id: quest.id, order: 2,
                description: 'Break a field with your hoe',
                type: 'till', target_item: 'Field', required_amount: 1,
            },
            {
                quest_id: quest.id, order: 3,
                description: 'Sow 10 carrot seeds',
                type: 'sow', target_item: 'Carrot', required_amount: 10,
            },
            {
                quest_id: quest.id, order: 4,
                description: 'Lift the carrot crop when it is ready',
                type: 'harvest', target_item: 'Carrot', required_amount: 1,
            },
            {
                quest_id: quest.id, order: 5,
                description: 'Return to Georgic',
                type: 'talk', target_item: null, required_amount: 1,
            },
        ]);
    }

    await knex('quests').where({ id: quest.id }).update({
        start_items: JSON.stringify([
            { itemName: 'Ambren Hoe', qty: 1 },
            { itemName: 'Lanai Bucket', qty: 1 },
            { itemName: 'Carrot Seeds', qty: 20 },
        ]),
        reward_items: JSON.stringify([
            { itemName: 'Pea Seeds', qty: 10 },
            { itemName: 'Manure', qty: 10 },
        ]),
        reward_xp: 500,
    });

    // ── Georgic ──
    if (await knex('npcs').where({ name: 'Georgic' }).first()) return;

    const [georgic] = await knex('npcs').insert({
        name: 'Georgic',
        title: 'Old Farmer of Novita',
        location_id: novita.id,
        submenu: null,
        avatar: '🌾',
        is_active: true,
    }).returning('*');

    await knex('npc_dialogues').insert([
        {
            npc_id: georgic.id,
            stage_key: 'intro',
            text_lines: [
                "You've the look of someone who thinks food comes from a barrel. It comes from here, and it comes slow.",
                "I've worked this ground longer than I care to count. Nothing about it is quick, and nothing about it is difficult either; it only wants doing in the right order, and then leaving alone.",
                "If you've the patience for it, I'll walk you through a season. If you haven't, there's no shame in it. Go and chop something down.",
            ],
            options: JSON.stringify([
                { label: '"Teach me."', next_stage: 'offer', action: null },
                { label: '"Another time."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: georgic.id,
            stage_key: 'offer',
            text_lines: [
                "First you'll want land of your own. A farmstead—timber, dressed stone, and a great many nails. It's a long haul and I'll not pretend otherwise. Half the folk who mean to farm never get past it.",
                "I'll not carry that for you. But here, a hoe, a bucket, and enough carrot seed to fill your first field. When the farmstead stands, the rest of it is easy.",
                "Raise it. Break a field. Sow it. Then leave it be, and come back when it's ready. That's the whole of it.",
            ],
            options: JSON.stringify([
                { label: 'Accept Quest', next_stage: 'progress', action: "start_quest:Georgic's Lesson" },
                { label: 'Cancel', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: georgic.id,
            stage_key: 'progress',
            text_lines: [
                "Still at it? Good. Order matters: the farmstead first, then a field broken with the hoe, then the seed in.",
                "And once it's sown, leave it. Standing over a field does nothing for it. Go and do something useful and let the ground work while you're gone. That's the whole trick of farming, and it's why most folk are bad at it.",
                "If you've a mind to hurry it along, carry water down the rows and pull the weeds. Won't do much at the end. Does a great deal at the start.",
            ],
            options: JSON.stringify([
                { label: 'Close', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: georgic.id,
            stage_key: 'ready',
            text_lines: [
                "Carrots out of your own ground. There's not much better, and it never stops being true.",
                "Now the part nobody tells you. That field is poorer than it was; the crop took it out of the soil, and the next sowing there will come up thinner. Every hungry crop does it. Carrots, onions, grain, flax, all of them.",
                "Three ways back. Let it lie idle and it mends on its own, slow. Spread muck on it and it mends at once. Here, take what's left of mine, though you'll want beasts of your own before long if you mean to keep it up.",
                "Or sow peas. Peas give back to the ground instead of taking from it, the only crop I know that leaves a field better than it found it. Take these. You'll want the knack of it by the time you can plant them.",
                "That's farming. Break it, sow it, leave it, lift it, and mind what you've taken out of the earth.",
            ],
            options: JSON.stringify([
                { label: '"Thank you, Georgic."', next_stage: 'complete', action: "complete_talk_objective:Georgic's Lesson" },
            ]),
        },
        {
            npc_id: georgic.id,
            stage_key: 'complete',
            text_lines: [
                "Fields are yours to work now. Build more as you learn; you'll manage more ground the better you get, and there's no hurry about it.",
                "Seed's the thing you'll run short of, not land. Go out to Lanaivale and forage properly. There's carrot and onion and turnip seed in the meadow there, flax and peas down by the creek, and berry runners in the thickets if you fancy something that fruits year on year.",
                "And what you grow wants working before it's worth much. Grain wants threshing and milling. Flax wants rotting and beating before it'll ever be linen. But that's a lesson for a day you've time for.",
            ],
            options: JSON.stringify([
                { label: 'Farewell', next_stage: null, action: 'close' },
            ]),
        },
    ]);
}

export async function down(knex: Knex): Promise<void> {
    const georgic = await knex('npcs').where({ name: 'Georgic' }).first();
    if (georgic) {
        await knex('npc_dialogues').where({ npc_id: georgic.id }).delete();
        await knex('npcs').where({ id: georgic.id }).delete();
    }
    const quest = await knex('quests').where({ name: "Georgic's Lesson" }).first();
    if (quest) {
        await knex('quest_objectives').where({ quest_id: quest.id }).delete();
        await knex('player_quests').where({ quest_id: quest.id }).delete();
        await knex('quests').where({ id: quest.id }).delete();
    }
}
