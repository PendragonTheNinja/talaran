import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The Lanai Hunting Bow came only from Geonsen's quest (Nathan, 2026-10-27:
// "it needs to be" craftable). Carpentry makes it, at the workshop.
//
// The string is linen, out of flax (CLAUDE.md §2, the circularity rule: the
// wild economy is gated on the bow, so the bow's string must come from
// outside it, and sinew is never the bowstring). Planks and thread only, no
// socketed tools, so it can be made at Geossica's bench by someone who owns
// nothing yet, at half speed, as any tool-less job can (publicStationAllows).
//
// XP: Carpentry finished goods x1.8 at level 3, 120 s: 4,153/h x 120 / 3,600 = 138.

const RECIPE = {
    name: 'String a Hunting Bow',
    skill: 'Carpentry',
    output_item_name: 'Lanai Hunting Bow',
    output_qty: 1,
    inputs: JSON.stringify([
        { itemName: 'Lanai Planks', qty: 3 },
        { itemName: 'Linen Thread', qty: 2 },
    ]),
    required_level: 3,
    timer_seconds: 120,
    xp: 138,
    station: 'carpentry',
    required_tools: JSON.stringify([]),
    for_skill: 'Hunting',
    flavor_text: 'You shave a Lanai stave to an even bend and string it with twisted linen.',
    mode: 'active',
    is_active: true,
};

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const name of [RECIPE.output_item_name, 'Lanai Planks', 'Linen Thread']) {
        if (!(await knex('items').where({ name }).first())) throw new Error(`craftable_hunting_bow: no item named ${name}`);
    }
    const existing = await knex('recipes').where({ name: RECIPE.name }).first();
    if (existing) await knex('recipes').where({ id: existing.id }).update(RECIPE);
    else await knex('recipes').insert(RECIPE);
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: RECIPE.name }).delete();
}
