import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
    // Don't wipe existing quest progress
    const existing = await knex('quests').where({ name: "The Blacksmith's Bargain" }).first();
    if (existing) return;

    const emberra = await knex('locations').where({ name: 'Emberra' }).first();
    if (!emberra) {
        console.log('Emberra location not found, skipping quest seed');
        return;
    }

    const [quest] = await knex('quests').insert({
        name: "The Blacksmith's Bargain",
        description: 'Gareth, the blacksmith of Emberra, has offered to let you use his forge — for a price.',
        skill: 'Smithing',
        npc_name: 'Gareth',
        location_id: emberra.id,
        is_active: true,
    }).returning('*');

    await knex('quest_objectives').insert([
        {
            quest_id: quest.id,
            order: 1,
            description: 'Smelt 6 Ambren Ingot batches at Gareth\'s forge',
            type: 'smelt',
            target_item: 'Ambren Ingot',
            required_amount: 6,
        },
        {
            quest_id: quest.id,
            order: 2,
            description: 'Speak to Gareth to complete the bargain',
            type: 'talk',
            target_item: null,
            required_amount: 1,
        },
    ]);

    console.log("Seeded The Blacksmith's Bargain quest");
}