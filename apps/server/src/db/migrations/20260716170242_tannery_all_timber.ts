import type { Knex } from 'knex';

// Carpenters don't forge. Both tannery pieces were eating Ambren Ingots, which
// only made sense for smithing recipes where the ingot is being worked.
// A tanning rack is a lashed timber frame, and coopers bound barrels with split
// wooden hoops long before iron was standard — so both are pure carpentry.
// If iron hoops ever matter, they arrive as a Smithing component (mirroring
// Lanai Tool Rod: smith makes the part, carpenter fits it).

export async function up(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Build Tanning Rack' }).update({
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 6 }]),
    });
    await knex('recipes').where({ name: 'Build Tanning Barrel' }).update({
        inputs: JSON.stringify([{ itemName: 'Lanai Planks', qty: 8 }]),
    });
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