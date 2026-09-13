import type { Knex } from 'knex';

/**
 * Name the wildcard inputs properly.
 *
 * Fish Stew and Fish Pie take ANY cooked fish, which is the whole reason the
 * subtype wildcard exists: naming one species would make the other seventeen
 * useless in composites.
 *
 * The label shipped as "cooked fish", which reads as an item that does not
 * exist. "Any Cooked Fish" says the actual rule, and capitalised it sits beside
 * "1× Bucket of Milk" without looking like a mistake.
 */

export async function up(knex: Knex): Promise<void> {
    const recipes = await knex('recipes').where({ skill: 'Cooking' }).select('id', 'inputs');
    for (const recipe of recipes as any[]) {
        let inputs: any[];
        try { inputs = JSON.parse(recipe.inputs || '[]'); } catch { continue; }
        if (!Array.isArray(inputs)) continue;

        let touched = false;
        for (const input of inputs) {
            if (input?.subtype === 'cooked_fish' && input.label !== 'Any Cooked Fish') {
                input.label = 'Any Cooked Fish';
                touched = true;
            }
        }
        if (touched) {
            await knex('recipes').where({ id: recipe.id }).update({ inputs: JSON.stringify(inputs) });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    const recipes = await knex('recipes').where({ skill: 'Cooking' }).select('id', 'inputs');
    for (const recipe of recipes as any[]) {
        let inputs: any[];
        try { inputs = JSON.parse(recipe.inputs || '[]'); } catch { continue; }
        if (!Array.isArray(inputs)) continue;

        let touched = false;
        for (const input of inputs) {
            if (input?.subtype === 'cooked_fish') { input.label = 'cooked fish'; touched = true; }
        }
        if (touched) {
            await knex('recipes').where({ id: recipe.id }).update({ inputs: JSON.stringify(inputs) });
        }
    }
}
