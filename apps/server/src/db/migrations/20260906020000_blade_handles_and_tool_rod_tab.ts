import type { Knex } from 'knex';

/**
 * Handles on the blades, and the tool rod filed where it belongs.
 *
 * BLADES. A cooking knife and a cleaver are a piece of steel with a wooden
 * handle on it, same as every other edged tool in the game. They shipped as
 * solid ambren, which made them the only blades in Talaran with no grip. Both
 * now take a Lanai Tool Rod, and the metal drops to match: a paring knife is
 * not three ingots of work.
 *
 *   Cooking Knife   2 ingots  ->  1 ingot + 1 tool rod
 *   Meat Cleaver    3 ingots  ->  2 ingots + 1 tool rod
 *
 * TOOL ROD. It is a Carpentry recipe, made at the carpenter's bench, out of
 * planks, awarding Carpentry experience. It was tagged for_skill Smithing
 * because a smith is who wants one, but for_skill is what groups the tabs, so
 * it sat alone under a Smithing heading at Verdale: a tab of one item, in a
 * building where no smithing happens.
 *
 * Retagging it to Carpentry empties that tab, and RecipeList only draws
 * categories it actually finds, so the Smithing heading disappears with no
 * client change. When something genuinely smithing-flavoured is made at a
 * carpenter's bench, the tab comes back on its own.
 */

export async function up(knex: Knex): Promise<void> {
    const rod = await knex('items').where({ name: 'Lanai Tool Rod' }).first();
    if (!rod) {
        throw new Error('Tool rod migration: no Lanai Tool Rod item. Carpentry content must ship first.');
    }

    await knex('recipes').where({ name: 'Ambren Cooking Knife' }).update({
        inputs: JSON.stringify([
            { itemName: 'Ambren Ingot', qty: 1 },
            { itemName: 'Lanai Tool Rod', qty: 1 },
        ]),
        flavor_text: 'You are setting a keen little blade into a wooden haft.',
    });

    await knex('recipes').where({ name: 'Ambren Meat Cleaver' }).update({
        inputs: JSON.stringify([
            { itemName: 'Ambren Ingot', qty: 2 },
            { itemName: 'Lanai Tool Rod', qty: 1 },
        ]),
        flavor_text: 'You are hanging a broad blade on a haft heavy enough to swing it.',
    });

    await knex('recipes').where({ name: 'Lanai Tool Rod' }).update({ for_skill: 'Carpentry' });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Ambren Cooking Knife' }).update({
        inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 2 }]),
        flavor_text: 'You are grinding an edge onto a small knife.',
    });
    await knex('recipes').where({ name: 'Ambren Meat Cleaver' }).update({
        inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 3 }]),
        flavor_text: 'You are forging a heavy cleaver.',
    });
    await knex('recipes').where({ name: 'Lanai Tool Rod' }).update({ for_skill: 'Smithing' });
}
