import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The scythe (Nathan, 2026-11-12). Held in the main hand at harvest, it cuts
// grain and flax low: more of the field comes in, and quicker
// (SCYTHE_YIELD_SHARE, SCYTHE_TIMER_SHARE in services/farming.ts). It never
// threshes; straw still comes from threshing the sheaves. Never required, so
// a break carries on by hand (services/toolWear.ts, `optional`).
//
// Worn from Farming 5, the level Wild Grain is sown from. Forged like the hoe,
// a finished good on the Smithing band: level 3, 60 s, 2,307 an hour x 1.8,
// so 69. Merrick sells it too (seeds/08_merchants.ts). Its value comes from
// `values:derive`.

const ITEM = {
    name: 'Ambren Scythe', type: 'tool', subtype: 'scythe', slot: 'mainhand', tier: 1, level_required: 5,
    description: 'A long curved Ambren blade on a bent snath, with two grips. Swung low and level, it lays a swathe of standing grain flat in one stroke.',
};

const RECIPE = {
    name: 'Forge Ambren Scythe', skill: 'Smithing', output_item_name: 'Ambren Scythe', output_qty: 1,
    inputs: JSON.stringify([{ itemName: 'Ambren Ingot', qty: 2 }, { itemName: 'Lanai Planks', qty: 1 }]),
    required_level: 3, timer_seconds: 60, xp: 69, station: 'smithing',
    required_tools: JSON.stringify(['anvil', 'hammer', 'tongs']), for_skill: 'Farming', mode: 'active',
    flavor_text: 'You draw out the long blade and set its curve against the anvil horn.',
};

async function upsert(knex: Knex, table: string, row: Record<string, unknown>) {
    const existing = await knex(table).where({ name: row.name }).first();
    if (existing) await knex(table).where({ id: existing.id }).update(row);
    else await knex(table).insert(row);
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const name of ['Ambren Ingot', 'Lanai Planks']) {
        if (!(await knex('items').where({ name }).first())) throw new Error(`scythe: item ${name} not found`);
    }
    await upsert(knex, 'items', { ...ITEM, is_active: true });
    await upsert(knex, 'recipes', { ...RECIPE, is_active: true });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: RECIPE.name }).delete();
    const item = await knex('items').where({ name: ITEM.name }).first('id');
    if (!item) return;
    // An item someone holds stays, hidden, rather than failing on their rows.
    const held = await knex('player_inventory').where({ item_id: item.id }).first()
        || await knex('player_equipment').where({ mainhand_item_id: item.id }).first();
    if (held) await knex('items').where({ id: item.id }).update({ is_active: false });
    else await knex('items').where({ id: item.id }).delete();
}
