import type { Knex } from 'knex';

// Every recipe added this patch shipped without flavour_text, so they all fell
// through to the generic "You are working at the bench." Scene text is content,
// not a hard-coded per-action string — so each of these gets its own line.

const FLAVOR: Record<string, string> = {
    // Farming — processing what the fields give up
    'Thresh Grain Sheaves': 'You beat the grain free of the straw.',
    'Gather Straw': 'You bundle the loose straw and tie it off.',
    'Mill Flour': 'You turn the quern, grinding the grain to flour.',
    'Ret Flax': 'You weight the flax under still water and leave it to rot.',
    'Scutch Flax': 'You beat and comb the flax until the fibre comes free.',

    // Crafting
    'Cut Granite Block': 'You dress the granite square with chisel and mallet.',
    'Spin Linen Thread': 'You draw the flax fibre out and twist it into thread.',
    'Weave Linen Cloth': 'You work the loom, and the linen grows row by row.',
    'Weave Foraging Basket': 'You bend and weave the reeds into a basket.',

    // Smithing
    'Forge Ambren Hoe': 'You hammer out the broad blade of a hoe.',
    'Hammer Ambren Nails': 'You cut, draw, and head one nail after another.',
    'Forge Ambren Foraging Knife': 'You draw out a slim blade for cutting stems.',

    // Carpentry
    'Build Fence Panel': 'You nail rail to post, and a length of fence takes shape.',
};

export async function up(knex: Knex): Promise<void> {
    for (const [name, flavor_text] of Object.entries(FLAVOR)) {
        await knex('recipes').where({ name }).update({ flavor_text });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', Object.keys(FLAVOR)).update({ flavor_text: null });
}
