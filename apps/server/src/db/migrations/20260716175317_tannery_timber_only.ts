import type { Knex } from 'knex';

// Forward fix: tannery_all_timber was recorded as run while it was still an empty
// stub, so its up() never executed and knex will never re-run it.
// Carpenters don't forge — a lashed timber rack and a wooden-hooped barrel need
// no ingots. If iron hoops ever matter, they arrive as a Smithing component
// (mirroring Lanai Tool Rod: smith makes the part, carpenter fits it).

export async function up(knex: Knex): Promise<void> {
    const rack = await knex('recipes').where({ name: 'Build Tanning Rack' })
        .update({ inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 6 }]) });
    if (rack === 0) throw new Error('tannery_timber_only: Build Tanning Rack not found');

    const barrel = await knex('recipes').where({ name: 'Build Tanning Barrel' })
        .update({ inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 8 }]) });
    if (barrel === 0) throw new Error('tannery_timber_only: Build Tanning Barrel not found');

    await knex('items').where({ name: 'Lanai Tanning Barrel' }).update({
        description: 'A stout Lanai barrel, bound with split wooden hoops. Bark liquor goes in dark and comes out darker.',
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Build Tanning Rack' }).update({
        inputs: JSON.stringify([
            { itemName: 'Lanai Planks', qty: 4 },
            { itemName: 'Ambren Ingot', qty: 2 },
        ]),
    });
    await knex('recipes').where({ name: 'Build Tanning Barrel' }).update({
        inputs: JSON.stringify([
            { itemName: 'Lanai Planks', qty: 6 },
            { itemName: 'Ambren Ingot', qty: 1 },
        ]),
    });
}