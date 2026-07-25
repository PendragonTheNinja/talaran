import type { Knex } from 'knex';

// Every recipe added this patch shipped with for_skill null, so each was filed
// under whoever makes it rather than whoever it serves — the opposite of the
// convention (a Tanning Rack is Carpentry-made but tabs under Crafting).
//
// Farming's own processing chain is both made by and serves Farming, so it's set
// explicitly rather than left to the fallback.

const FOR_SKILL: Record<string, string> = {
    // Tools and materials made by one skill for another
    'Forge Ambren Hoe': 'Farming',
    'Build Fence Panel': 'Farming',
    'Hammer Ambren Nails': 'Carpentry',
    'Cut Granite Block': 'Carpentry',
    'Forge Ambren Foraging Knife': 'Foraging',
    'Weave Foraging Basket': 'Foraging',

    // Linen line — spun and woven by Crafting, and it's Crafting that uses cloth
    'Spin Linen Thread': 'Crafting',
    'Weave Linen Cloth': 'Crafting',

    // Farming's own processing
    'Thresh Grain Sheaves': 'Farming',
    'Gather Straw': 'Farming',
    'Mill Flour': 'Farming',
    'Ret Flax': 'Farming',
    'Scutch Flax': 'Farming',
};

export async function up(knex: Knex): Promise<void> {
    for (const [name, for_skill] of Object.entries(FOR_SKILL)) {
        await knex('recipes').where({ name }).update({ for_skill });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', Object.keys(FOR_SKILL)).update({ for_skill: null });
}
