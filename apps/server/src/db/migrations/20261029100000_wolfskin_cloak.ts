import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Wolfskin Cloak (docs/talar-spec.md §9): the use for the Wolf Pelts Grey
// Wolves have dropped since 20261027120000 (1 in 15). Twenty pelts, sewn in
// Crafting with no bench, as the leather boots are. The back slot, unused until
// now; about 5 armour, gated at Defense 8 (gateSkill: armour means Defense),
// between the early and late Ambren sets' small pieces. Crafting 8, 180 s,
// finished goods by the law: 1.8 x 1.10 x band(8) x 180 / 3600 = 234.
// The item stays on down(), as items do: players may wear it.

const CLOAK = {
    name: 'Wolfskin Cloak', type: 'armor', subtype: 'cloak', slot: 'back', tier: 1,
    level_required: 8, armour: 5,
    description: 'Twenty grey pelts sewn fur-side out, heavy at the shoulders and long enough to sit on. It turns the wind and the odd tooth.',
};

const RECIPE = {
    name: 'Sew Wolfskin Cloak', skill: 'Crafting', output_item_name: CLOAK.name, output_qty: 1,
    inputs: JSON.stringify([{ itemName: 'Wolf Pelt', qty: 20 }]),
    required_level: 8, timer_seconds: 180, xp: 234, station: null, required_tools: null, for_skill: 'Defense',
    flavor_text: 'You lay the pelts out in rows, match the grain of the fur, and stitch them together edge to edge.',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    if (!(await knex('items').where({ name: 'Wolf Pelt' }).first())) throw new Error('wolfskin_cloak: no item named Wolf Pelt');

    const item = await knex('items').where({ name: CLOAK.name }).first();
    if (item) await knex('items').where({ id: item.id }).update(CLOAK);
    else await knex('items').insert({ ...CLOAK, is_active: true });

    const recipe = await knex('recipes').where({ name: RECIPE.name }).first();
    if (recipe) await knex('recipes').where({ id: recipe.id }).update(RECIPE);
    else await knex('recipes').insert({ ...RECIPE, mode: 'active', is_active: true });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: RECIPE.name }).delete();
}
