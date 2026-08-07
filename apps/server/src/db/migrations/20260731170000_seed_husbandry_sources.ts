import type { Knex } from 'knex';

// Husbandry content, part two: where young animals come from, and the NPC who
// starts you off.
//
// Livestock has no breeding (deliberately out of scope), so every animal in a
// pen began as a live young thing found in the wild. Two faucets:
//
//   Trapping — a snare that closes on something small and unhurt. Two new
//              targets at the bottom of the weight table, rarer than a rabbit
//              but nowhere near the Squonk.
//   Hunting  — a calf or a foal found beside the animal you were tracking.
//              Rare, and pointedly not the thing you were hunting.
//
// Weights are relative within the trap table (Rabbit 640, Pheasant 355,
// Squonk 5). 90 and 45 put a chick a little under one catch in ten and a
// piglet around one in twenty — enough to stock a coop over a session without
// making the snare line feel like a livestock shop.

const NEW_TRAP_TARGETS = [
    {
        name: 'Nesting Hen', weight: 90, xp: 520, is_active: true,
        drop_table: JSON.stringify([
            { itemName: 'Chick', min: 1, max: 2, chance: 100, notable: true },
            { itemName: 'Feathers', min: 2, max: 4, chance: 80 },
        ]),
    },
    {
        name: 'Wild Sow', weight: 45, xp: 900, is_active: true,
        drop_table: JSON.stringify([
            { itemName: 'Piglet', min: 1, max: 1, chance: 100, notable: true },
        ]),
    },
];

// Rare live-young additions to the existing hunt tables. Appended, so the
// hides, meat and notable trophies already there are untouched.
const HUNT_YOUNG: Record<string, { itemName: string; min: number; max: number; chance: number; notable: boolean }[]> = {
    // A calf at heel, orphaned or strayed from a drove. Cattle are Husbandry 9,
    // so this sits usefully ahead of where a player can pen it.
    Deer: [{ itemName: 'Calf', min: 1, max: 1, chance: 1.5, notable: true }],
    // Foals: the Rouncey line off the mid animal, the finer Palfrey off the
    // deepest one, so the better mount stays behind the harder hunt.
    Boar: [
        { itemName: 'Calf', min: 1, max: 1, chance: 1.5, notable: true },
        { itemName: 'Rouncey Foal', min: 1, max: 1, chance: 1, notable: true },
    ],
    'Ground Sloth': [
        { itemName: 'Rouncey Foal', min: 1, max: 1, chance: 1, notable: true },
        { itemName: 'Palfrey Foal', min: 1, max: 1, chance: 0.5, notable: true },
    ],
};

export async function up(knex: Knex): Promise<void> {
    // ── Trapping: two new targets ──
    // trap_targets are per-location and per-trap-type: both columns are NOT NULL,
    // and the uniqueness the seed migration relies on is (location_id, name).
    const eldGrove = await knex('locations').where({ name: 'Eld Grove' }).first();
    if (!eldGrove) throw new Error('seed_husbandry_sources: Eld Grove not found');

    const snare = await knex('trap_types').where({ name: 'Snare' }).first();
    if (!snare) throw new Error('seed_husbandry_sources: Snare trap type not found');

    for (const t of NEW_TRAP_TARGETS) {
        const row = { ...t, location_id: eldGrove.id, trap_type_id: snare.id };
        const existing = await knex('trap_targets')
            .where({ location_id: eldGrove.id, name: t.name }).first();
        if (existing) await knex('trap_targets').where({ id: existing.id }).update(row);
        else await knex('trap_targets').insert(row);
    }

    // ── Hunting: append live young to the existing tables ──
    for (const [animalName, additions] of Object.entries(HUNT_YOUNG)) {
        const animal = await knex('huntable_animals').where({ name: animalName }).first();
        if (!animal) throw new Error(`seed_husbandry_sources: huntable animal ${animalName} not found`);

        const table: any[] = JSON.parse(animal.drop_table || '[]');
        for (const add of additions) {
            if (table.some((d) => d.itemName === add.itemName)) continue;   // idempotent
            table.push(add);
        }
        await knex('huntable_animals').where({ id: animal.id }).update({ drop_table: JSON.stringify(table) });
    }

    // ── The Stockman's Lesson — Geothro of Novita ──
    // Fifth of the Geo- tutorial NPCs (Geoffrey/forge, Geossica/workshop,
    // Geonsen/hunt, Georgic/field, Geothro/pen). Jethro kept flocks for Moses
    // and Jethro Tull rebuilt English farming; the name is livestock at both ends.
    const novita = await knex('locations').where({ name: 'Novita' }).first();
    if (!novita) throw new Error('seed_husbandry_sources: Novita not found');


    let quest = await knex('quests').where({ name: "The Stockman's Lesson" }).first();
    if (!quest) {
        [quest] = await knex('quests').insert({
            name: "The Stockman's Lesson",
            description: 'Geothro keeps the pens at Novita. He has offered you a start: two chicks, a coop to put them in, and the habits that keep them laying.',
            skill: 'Husbandry',
            npc_name: 'Geothro',
            location_id: novita.id,
            is_active: true,
        }).returning('*');

        await knex('quest_objectives').insert([
            {
                quest_id: quest.id, order: 1,
                description: 'Raise a coop at your farmstead',
                type: 'build', target_item: 'Coop', required_amount: 1,
            },
            {
                quest_id: quest.id, order: 2,
                description: 'Put a chick in the coop',
                type: 'place_animal', target_item: 'Chicken', required_amount: 1,
            },
            {
                quest_id: quest.id, order: 3,
                description: 'Feed and water your birds',
                type: 'feed', target_item: 'Chicken', required_amount: 1,
            },
            {
                quest_id: quest.id, order: 4,
                description: 'Return to Geothro',
                type: 'talk', target_item: null, required_amount: 1,
            },
        ]);
    }

    // Start items cover the whole first loop: the pail to feed with, the fork
    // for the bedding, two chicks, and grain enough to get them to laying.
    await knex('quests').where({ id: quest.id }).update({
        start_items: JSON.stringify([
            { itemName: 'Feed Pail', qty: 1 },
            { itemName: 'Mucking Fork', qty: 1 },
            { itemName: 'Chick', qty: 2 },
            { itemName: 'Grain', qty: 40 },
        ]),
        reward_items: JSON.stringify([
            { itemName: 'Calf', qty: 1 },
            { itemName: 'Grain', qty: 60 },
        ]),
        reward_xp: 500,
    });

    if (await knex('npcs').where({ name: 'Geothro' }).first()) return;

    const [geothro] = await knex('npcs').insert({
        name: 'Geothro',
        title: 'Stockman of Novita',
        location_id: novita.id,
        submenu: null,
        avatar: '🐄',
        is_active: true,
    }).returning('*');

    await knex('npc_dialogues').insert([
        {
            npc_id: geothro.id,
            stage_key: 'intro',
            text_lines: [
                "You've the look of someone who's been fed by fields and thinks that's the whole of it. Fields are patient. Fields wait for you.",
                "An animal does not wait. An animal is hungry now, and will be hungry again this evening, and that is the entire trade in one sentence.",
                "Georgic sends me the ones who've taken to the soil. I've two chicks spare and no one to mind them.",
            ],
            options: JSON.stringify([
                { label: '"Show me the work."', next_stage: 'offer', action: null },
                { label: '"I\'ve enough to mind already."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: geothro.id,
            stage_key: 'offer',
            text_lines: [
                "Build them a coop first — boarded tight, and a door that latches. Then put a chick in it. Then feed them, and keep feeding them.",
                "Understand what feeding buys you. A bird that isn't fed doesn't sicken and it doesn't die. It simply stops. Stops growing, stops laying, stands there waiting on you. Come back in a month and you'll find it exactly as you left it, and a month behind where it might have been.",
                "That's the cruelty of it, if you want one. Nothing here punishes you. It only waits.",
            ],
            options: JSON.stringify([
                { label: 'Accept Quest', next_stage: 'progress', action: "start_quest:The Stockman's Lesson" },
                { label: 'Cancel', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: geothro.id,
            stage_key: 'progress',
            text_lines: [
                "Coop, chick, feed. In that order, and the pail in your hand — carrying it in your pack feeds nobody.",
                "Muck them out when it wants doing, too. A fouled pen stops just as surely as a hungry one.",
            ],
            options: JSON.stringify([
                { label: 'Close', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: geothro.id,
            stage_key: 'ready',
            text_lines: [
                "Fed and housed. Good. They'll lay for you now, and go on laying until they're old — and they will get old, and slow with it. That's your signal, not a failure.",
                "An elder bird still eats. Take her for the pot and put a young one in her place, and the wheel turns. Keep her if you're fond of her; plenty do. It costs you eggs, not much else.",
                "Here — a calf, for when you've the level to pen her. Now that's the real choice of this trade. Milk her for as long as you keep her, or take the hide and the beef the day you stop. Both are honest. Only don't stand about deciding while she eats her way through your grain.",
            ],
            options: JSON.stringify([
                { label: '"Thank you, Geothro."', next_stage: 'complete', action: "complete_talk_objective:The Stockman's Lesson" },
            ]),
        },
        {
            npc_id: geothro.id,
            stage_key: 'complete',
            text_lines: [
                "Mind the muck heap. It's not waste — it's next year's field, and Georgic will take all you can barrow over.",
                "And if you ever bring a foal back from the wood, bring it here. A horse grown in your own paddock carries you differently than one bought at market. I've no proof of that. I'm right all the same.",
            ],
            options: JSON.stringify([
                { label: 'Farewell', next_stage: null, action: 'close' },
            ]),
        },
    ]);
}

export async function down(knex: Knex): Promise<void> {
    const geothro = await knex('npcs').where({ name: 'Geothro' }).first();
    if (geothro) {
        await knex('npc_dialogues').where({ npc_id: geothro.id }).delete();
        await knex('npcs').where({ id: geothro.id }).delete();
    }

    const quest = await knex('quests').where({ name: "The Stockman's Lesson" }).first();
    if (quest) {
        await knex('quest_objectives').where({ quest_id: quest.id }).delete();
        await knex('quests').where({ id: quest.id }).delete();
    }

    const grove = await knex('locations').where({ name: 'Eld Grove' }).first();
    if (grove) {
        await knex('trap_targets')
            .where({ location_id: grove.id })
            .whereIn('name', NEW_TRAP_TARGETS.map((t) => t.name))
            .delete();
    }

    for (const [animalName, additions] of Object.entries(HUNT_YOUNG)) {
        const animal = await knex('huntable_animals').where({ name: animalName }).first();
        if (!animal) continue;
        const names = additions.map((a) => a.itemName);
        const table: any[] = JSON.parse(animal.drop_table || '[]').filter((d: any) => !names.includes(d.itemName));
        await knex('huntable_animals').where({ id: animal.id }).update({ drop_table: JSON.stringify(table) });
    }
}
