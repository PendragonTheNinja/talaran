import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
    const existing = await knex('npcs').where({ name: 'Gareth' }).first();
    if (existing) return;

    const emberra = await knex('locations').where({ name: 'Emberra' }).first();
    if (!emberra) {
        console.log('Emberra not found, skipping NPC seed');
        return;
    }

    const [gareth] = await knex('npcs').insert({
        name: 'Gareth',
        title: 'Blacksmith of Emberra',
        location_id: emberra.id,
        submenu: 'forge',
        avatar: '🔨',
        is_active: true,
    }).returning('*');

    await knex('npc_dialogues').insert([
        {
            npc_id: gareth.id,
            stage_key: 'intro',
            text_lines: [
                "Hm? Another one looking to learn the craft, are ye? I don't give lessons for free, stranger.",
                "But I'll make ye a deal. If you can smelt me 6 Ambren Ingots using my forge, I'll know you're serious. You'll need Ambren Ore and Charc, both found up in the mines to the north at Grundagr and Origrund.",
                "Fair warning — my forge isn't as efficient as having your own setup. Once you prove yourself, I'll show you how to smith your own tools and build a proper workstation. That's when the real work begins.",
            ],
            options: JSON.stringify([
                { label: '"I\'ll do it."', next_stage: 'offer', action: null },
                { label: '"Maybe later."', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: gareth.id,
            stage_key: 'offer',
            text_lines: [
                "Good. The forge is yours to use. Smelt those ingots and come back to me when you're done.",
            ],
            options: JSON.stringify([
                { label: 'Accept Quest', next_stage: 'progress', action: 'start_quest:The Blacksmith\'s Bargain' },
                { label: 'Cancel', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: gareth.id,
            stage_key: 'progress',
            text_lines: [
                "Back already? Don't rush it. Good metal takes patience.",
            ],
            options: JSON.stringify([
                { label: 'Close', next_stage: null, action: 'close' },
            ]),
        },
        {
            npc_id: gareth.id,
            stage_key: 'ready',
            text_lines: [
                "Well now. You actually did it. I'll admit, I had my doubts.",
                "A deal's a deal. You've earned access to my anvil for smithing. But hear me — this forge is slow. If you want real speed, you'll need to smith your own tools and set up your own workstation.",
                "You'll need an Ambren Anvil, an Ambren Hammer, and Ambren Tongs. All things you can smith yourself at my trust Anvil.",
            ],
            options: JSON.stringify([
                { label: '"Thank you, Gareth."', next_stage: 'complete', action: 'complete_talk_objective:The Blacksmith\'s Bargain' },
            ]),
        },
        {
            npc_id: gareth.id,
            stage_key: 'complete',
            text_lines: [
                "The forge is yours to use whenever you need it. But don't forget! Build your own workstation when you're ready. My anvil won't wait around forever.",
            ],
            options: JSON.stringify([
                { label: 'Farewell', next_stage: null, action: 'close' },
            ]),
        },
    ]);

    console.log('Seeded Gareth the Blacksmith');
}