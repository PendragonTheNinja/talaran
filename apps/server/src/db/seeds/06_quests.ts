import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
    // ── The Blacksmith's Bargain ────────────────────────────
    const emberra = await knex('locations').where({ name: 'Emberra' }).first();
    if (emberra && !(await knex('quests').where({ name: "The Blacksmith's Bargain" }).first())) {
        const [quest] = await knex('quests').insert({
            name: "The Blacksmith's Bargain",
            description: 'Geoffrey, the blacksmith of Emberra, has offered to let you use his forge — for a price.',
            skill: 'Smithing',
            npc_name: 'Geoffrey',
            location_id: emberra.id,
            is_active: true,
        }).returning('*');

        await knex('quest_objectives').insert([
            {
                quest_id: quest.id,
                order: 1,
                description: 'Smelt 6 Ambren Ingot batches at Geoffrey\'s forge',
                type: 'smelt',
                target_item: 'Ambren Ingot',
                required_amount: 6,
            },
            {
                quest_id: quest.id,
                order: 2,
                description: 'Speak to Geoffrey to complete the bargain',
                type: 'talk',
                target_item: null,
                required_amount: 1,
            },
        ]);

        console.log("Seeded The Blacksmith's Bargain quest");
    }

    // ── The Carpenter's Commission ──────────────────────────
    const verdale = await knex('locations').where({ name: 'Verdale' }).first();
    if (verdale && !(await knex('quests').where({ name: "The Carpenter's Commission" }).first())) {
        const [cquest] = await knex('quests').insert({
            name: "The Carpenter's Commission",
            description: 'Geossica, the carpenter of Verdale, will share the workshop — once you prove you can handle a saw.',
            skill: 'Carpentry',
            npc_name: 'Geossica',
            location_id: verdale.id,
            is_active: true,
        }).returning('*');

        await knex('quest_objectives').insert([
            {
                quest_id: cquest.id,
                order: 1,
                description: 'Saw 6 batches of planks at the workshop bench',
                type: 'saw',
                target_item: 'Lanai Planks',
                required_amount: 6,
            },
            {
                quest_id: cquest.id,
                order: 2,
                description: 'Speak to Geossica to complete the commission',
                type: 'talk',
                target_item: null,
                required_amount: 1,
            },
        ]);
        console.log("Seeded The Carpenter's Commission quest");
    }
}