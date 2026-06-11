import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
    // ── Geoffrey — Blacksmith of Emberra ──────────────────────
    const emberra = await knex('locations').where({ name: 'Emberra' }).first();
    if (emberra && !(await knex('npcs').where({ name: 'Geoffrey' }).first())) {
        const [geoffrey] = await knex('npcs').insert({
            name: 'Geoffrey',
            title: 'Blacksmith of Emberra',
            location_id: emberra.id,
            submenu: 'forge',
            avatar: '🔨',
            is_active: true,
        }).returning('*');

        await knex('npc_dialogues').insert([
            {
                npc_id: geoffrey.id,
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
                npc_id: geoffrey.id,
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
                npc_id: geoffrey.id,
                stage_key: 'progress',
                text_lines: [
                    "Back already? Don't rush it. Good metal takes patience.",
                ],
                options: JSON.stringify([
                    { label: 'Close', next_stage: null, action: 'close' },
                ]),
            },
            {
                npc_id: geoffrey.id,
                stage_key: 'ready',
                text_lines: [
                    "Well now. You actually did it. I'll admit, I had my doubts.",
                    "A deal's a deal. You've earned access to my anvil for smithing. But hear me — this forge is slow. If you want real speed, you'll need to smith your own tools and set up your own workstation.",
                    "You'll need an Ambren Anvil, an Ambren Hammer, and Ambren Tongs. All things you can smith yourself at my trust Anvil.",
                ],
                options: JSON.stringify([
                    { label: '"Thank you, Geoffrey."', next_stage: 'complete', action: 'complete_talk_objective:The Blacksmith\'s Bargain' },
                ]),
            },
            {
                npc_id: geoffrey.id,
                stage_key: 'complete',
                text_lines: [
                    "The forge is yours to use whenever you need it. But don't forget! Build your own workstation when you're ready. My anvil won't wait around forever.",
                ],
                options: JSON.stringify([
                    { label: 'Farewell', next_stage: null, action: 'close' },
                ]),
            },
        ]);

        console.log('Seeded Geoffrey the Blacksmith');
    }

    // ── Geossica — Carpenter of Verdale ────────────────────────
    const verdale = await knex('locations').where({ name: 'Verdale' }).first();
    if (verdale && !(await knex('npcs').where({ name: 'Geossica' }).first())) {
        const [geossica] = await knex('npcs').insert({
            name: 'Geossica',
            title: 'Carpenter of Verdale',
            location_id: verdale.id,
            submenu: 'workshop',
            avatar: '🪚',
            is_active: true,
        }).returning('*');

        await knex('npc_dialogues').insert([
            {
                npc_id: geossica.id,
                stage_key: 'intro',
                text_lines: [
                    "New face in Verdale, eh? Come to learn the grain, have you?",
                    "Tell you what... prove your hands are honest. Saw me 6 good batches of planks at the bench here, and I'll know you're serious.",
                    "Mind, the public bench is slow going. Earn your keep and I'll show you how to set up your own — that's when the wood really starts to sing.",
                ],
                options: JSON.stringify([
                    { label: '"I\'ll do it."', next_stage: 'offer', action: null },
                    { label: '"Maybe later."', next_stage: null, action: 'close' },
                ]),
            },
            {
                npc_id: geossica.id,
                stage_key: 'offer',
                text_lines: [
                    "Good. The bench is yours. Saw your planks and come find me when the sawdust settles.",
                ],
                options: JSON.stringify([
                    { label: 'Accept Quest', next_stage: 'progress', action: "start_quest:The Carpenter's Commission" },
                    { label: 'Cancel', next_stage: null, action: 'close' },
                ]),
            },
            {
                npc_id: geossica.id,
                stage_key: 'progress',
                text_lines: [
                    "Still at it? Don't force the cut. The saw does the work if you let it.",
                ],
                options: JSON.stringify([
                    { label: 'Close', next_stage: null, action: 'close' },
                ]),
            },
            {
                npc_id: geossica.id,
                stage_key: 'ready',
                text_lines: [
                    "Well, look at that. Clean lines, every one. You've got the feel for it.",
                    "A deal's a deal — the workshop's open to you. But this old bench is slow. For real speed, build your own: a Lanai Sawhorse, an Ambren Saw, and an Ambren Plane.",
                    "Saw the sawhorse here from your own planks; the saw and plane you'll forge at a smithy. Put them together and you'll have a proper workstation.",
                ],
                options: JSON.stringify([
                    { label: '"Thank you, Geossica."', next_stage: 'complete', action: "complete_talk_objective:The Carpenter's Commission" },
                ]),
            },
            {
                npc_id: geossica.id,
                stage_key: 'complete',
                text_lines: [
                    "The bench is yours whenever you need it. But build your own setup when you can — your back will thank you.",
                ],
                options: JSON.stringify([
                    { label: 'Farewell', next_stage: null, action: 'close' },
                ]),
            },
        ]);
        console.log('Seeded Geossica the Carpenter');
    }
}