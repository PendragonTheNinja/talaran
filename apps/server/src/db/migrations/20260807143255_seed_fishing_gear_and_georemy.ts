import type { Knex } from 'knex';

// Fishing, part 2 of 2: the gear recipes, Georemy, and The Luxmere Investigation.
// Requires 20260807143012 (tables, items, species, bait values).
//
// WHO GETS THE XP (CLAUDE.md §2b-2, the Husbandry pen mistake):
//   Hook  -> Smithing   (metal drawn and filed, mirrors Hammer Ambren Nails)
//   Rod   -> Carpentry  (rigid wood at the bench, mirrors Lanai Tool Rod / Staff)
//   Net   -> Crafting   (knotted fibre, mirrors Weave Foraging Basket / Tie Snare)
// for_skill is 'Fishing' on all three, so one Fishing tab appears at every bench
// that serves the skill. The verb decides the XP, the output decides the tab.
//
// Georemy is the fifth tutorial NPC (Geoffrey/forge, Geossica/workshop,
// Geonsen/hunt, Georgic/field). submenu null: he renders at the top of Luxmere.
// He hands over the starter rod on accept, which is what lets a brand new player
// fish at all without first levelling Smithing and Carpentry.

const RECIPES = [
    {
        skill: 'Smithing', for_skill: 'Fishing', name: 'Forge Ambren Hooks',
        output_item_name: 'Ambren Hook', output_qty: 2,
        inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 1 }]),
        required_level: 1, timer_seconds: 20, xp: 25, station: null, mode: 'active', is_active: true,
        flavor_text: 'You draw the wire fine, turn the shank, and file the barb to a point.',
    },
    {
        skill: 'Carpentry', for_skill: 'Fishing', name: 'Assemble Ambren Fishing Rod',
        output_item_name: 'Ambren Fishing Rod', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Lanai Tool Rod', qty: 1 },
            { itemName: 'Ambren Hook', qty: 1 },
            { itemName: 'Linen Thread', qty: 2 },
        ]),
        required_level: 1, timer_seconds: 60, xp: 66, station: 'carpentry', mode: 'active', is_active: true,
        flavor_text: 'You whip the line down the pole and seat the hook at its end.',
    },
    {
        skill: 'Crafting', for_skill: 'Fishing', name: 'Weave Fishing Net',
        output_item_name: 'Fishing Net', output_qty: 1,
        inputs: JSON.stringify([
            { itemName: 'Linen Thread', qty: 6 },
            { itemName: 'Lanai Planks', qty: 2 },
        ]),
        required_level: 1, timer_seconds: 90, xp: 60, station: null, mode: 'active', is_active: true,
        flavor_text: 'You knot the linen row upon row until the mesh sits true.',
    },
];

export async function up(knex: Knex): Promise<void> {
    const luxmere = await knex('locations').where({ name: 'Luxmere' }).first();
    if (!luxmere) throw new Error('seed_fishing_gear_and_georemy: Luxmere not found');

    // ── Recipes (always upserted, even on a re-run where Georemy already exists) ──
    for (const recipe of RECIPES) {
        const inputs: Array<{ itemName: string; qty: number }> = JSON.parse(recipe.inputs);
        for (const input of inputs) {
            const item = await knex('items').where({ name: input.itemName }).first();
            if (!item) {
                throw new Error(`seed_fishing_gear_and_georemy: recipe input '${input.itemName}' not found`);
            }
        }
        const output = await knex('items').where({ name: recipe.output_item_name }).first();
        if (!output) {
            throw new Error(`seed_fishing_gear_and_georemy: recipe output '${recipe.output_item_name}' not found`);
        }
        const existing = await knex('recipes').where({ name: recipe.name }).first();
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert(recipe);
    }

    // ── Quest ──
    let quest = await knex('quests').where({ name: 'The Luxmere Investigation' }).first();
    if (!quest) {
        [quest] = await knex('quests').insert({
            name: 'The Luxmere Investigation',
            description: 'Georemy has followed water for thirty years, and something about Luxmere has kept him here. He wants to begin with the smallest thing in it.',
            skill: 'Fishing',
            npc_name: 'Georemy',
            location_id: luxmere.id,
            is_active: true,
        }).returning('*');

        await knex('quest_objectives').insert([
            {
                quest_id: quest.id, order: 1,
                description: 'Catch 3 Tiddle at Luxmere',
                type: 'fish', target_item: 'Tiddle', required_amount: 3,
            },
            {
                quest_id: quest.id, order: 2,
                description: 'Return to Georemy',
                type: 'talk', target_item: null, required_amount: 1,
            },
        ]);
    }

    await knex('quests').where({ id: quest.id }).update({
        start_items: JSON.stringify([
            { itemName: 'Ambren Fishing Rod', qty: 1 },
        ]),
        reward_items: JSON.stringify([
            { itemName: 'Frogspawn', qty: 2 },
        ]),
        reward_xp: 500,
    });

    // ── Georemy ──
    if (await knex('npcs').where({ name: 'Georemy' }).first()) return;

    const [georemy] = await knex('npcs').insert({
        name: 'Georemy',
        title: 'Angler of Uncertain Origin',
        location_id: luxmere.id,
        submenu: null,
        avatar: '🎣',
        is_active: true,
    }).returning('*');

    await knex('npc_dialogues').insert([
        {
            npc_id: georemy.id,
            stage_key: 'intro',
            text_lines: [
                'You are standing in my light. No matter. Sit down.',
                'Thirty years I have followed water. Rivers that have taken men and given nothing back. A sea that keeps its own counsel. I came to Luxmere because of a report.',
                'A lake this small should hold nothing worth the name. And yet not one villager here will swim after dark. That is the kind of detail I have learned to take seriously.',
            ],
            options: JSON.stringify([
                { label: '"What have you found?"', next_stage: 'offer', action: null },
                { label: '"Another time."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: georemy.id,
            stage_key: 'offer',
            text_lines: [
                'Nothing. Not yet. That is not failure. That is the beginning.',
                'Every investigation opens with the smallest witness. Never the monster. The thing the monster eats.',
                'There is a creature in these shallows the locals call a Tiddle. Half a tadpole that never finished the argument. Bring me three of them.',
                'Three, so I know it was not luck. Take the rod. I carry a spare, and no patience for a man who borrows one twice.',
            ],
            options: JSON.stringify([
                { label: 'Accept Quest', next_stage: 'progress', action: 'start_quest:The Luxmere Investigation' },
                { label: 'Cancel', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: georemy.id,
            stage_key: 'progress',
            text_lines: [
                'Three Tiddle. Cast, and then wait. The waiting is the work. Everything else is only knots.',
            ],
            options: JSON.stringify([
                { label: 'Close', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: georemy.id,
            stage_key: 'ready',
            text_lines: [
                'Three. And handled gently, which most people do not manage.',
                'Look at it. Small, absurd, entirely unafraid of you. Now ask what eats a thing like this. Then ask what eats that.',
                'That is the whole method. You follow the small ones upward until something looks back at you.',
                'Here. Frogspawn, off the creekbank at Lanaivale. Nothing in deep water has ever refused it.',
            ],
            options: JSON.stringify([
                { label: '"Thank you, Georemy."', next_stage: 'complete', action: 'complete_talk_objective:The Luxmere Investigation' },
            ]),
        },
        {
            npc_id: georemy.id,
            stage_key: 'complete',
            text_lines: [
                'The sea at Dawncrest is a different animal. Older, colder, and wholly unimpressed that you have caught a Tiddle.',
                'Put the great ones back when you can. A fish that has lived forty years in the dark has earned better than a cookpot.',
                'I will be here. I am always here.',
            ],
            options: JSON.stringify([
                { label: 'Farewell', next_stage: null, action: 'close' },
            ]),
        },
    ]);
}

export async function down(knex: Knex): Promise<void> {
    const georemy = await knex('npcs').where({ name: 'Georemy' }).first();
    if (georemy) {
        await knex('npc_dialogues').where({ npc_id: georemy.id }).delete();
        await knex('npcs').where({ id: georemy.id }).delete();
    }
    const quest = await knex('quests').where({ name: 'The Luxmere Investigation' }).first();
    if (quest) {
        await knex('player_quest_objectives')
            .whereIn('objective_id', knex('quest_objectives').where({ quest_id: quest.id }).select('id'))
            .delete();
        await knex('player_quests').where({ quest_id: quest.id }).delete();
        await knex('quest_objectives').where({ quest_id: quest.id }).delete();
        await knex('quests').where({ id: quest.id }).delete();
    }
    await knex('recipes').whereIn('name', RECIPES.map((r) => r.name)).delete();
}
