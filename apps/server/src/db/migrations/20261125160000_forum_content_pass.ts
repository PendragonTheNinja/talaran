import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Four small changes from the forum (Nathan, 2026-11-25).
//
//   Wild Sow      a caught sow gives 1 to 2 Pork beside her Piglet, perishable
//                 like a rabbit's meat, so "Scavengers got here first" now
//                 means something lost ("Missing Meat (Piglets)").
//   Turnip        no longer drains the soil. Pea still restores it; a turnip
//                 is a cover crop that takes nothing out ("Farming").
//   Agropelter    the tree-throwing beast drops Lanai Bark, 1 to 2, every
//                 other kill: a fighter's road to tannin ("Bark Buffs").
//   Rods and nets last in proportion to what they cost to make, against a
//                 plain Ambren tool (value 57): a rod (126) about twice as
//                 long, the Fishing Net (345) about six times
//                 ("Fishing Rod needs balanced"). items.durability_life_factor
//                 stretches a tool's guarantee and average life alike
//                 (services/toolWear.ts), so it is a number to tune, not code.

const SOW = 'Wild Sow';
const PORK = { itemName: 'Pork', min: 1, max: 2, chance: 100, perishable: true };

const TURNIP = 'Turnip';

const AGROPELTER_KEY = 'combat:agropelter';
const BARK = 'Lanai Bark';
const BARK_DROP = { chance_one_in: 2, min_qty: 1, max_qty: 2 };

const LIFE_FACTORS: { subtype: string; factor: number }[] = [
    { subtype: 'fishing_rod', factor: 2 },
    { subtype: 'fishing_net', factor: 6 },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'durability_life_factor'))) {
        await knex.schema.alterTable('items', (t) => { t.float('durability_life_factor').nullable(); });
    }
    if (!(await hasContent(knex))) return;

    // Wild Sow: Pork beside the Piglet, once.
    const sow = await knex('trap_targets').where({ name: SOW }).first('id', 'drop_table');
    if (!sow) throw new Error(`forum_content_pass: no trap target "${SOW}"`);
    if (!(await knex('items').where({ name: PORK.itemName }).first('id'))) throw new Error(`forum_content_pass: no item "${PORK.itemName}"`);
    const table: any[] = typeof sow.drop_table === 'string' ? JSON.parse(sow.drop_table) : sow.drop_table;
    if (!table.some((d) => d.itemName === PORK.itemName)) {
        table.push(PORK);
        await knex('trap_targets').where({ id: sow.id }).update({ drop_table: JSON.stringify(table) });
    }

    // Turnip: neither drains nor feeds the soil.
    const turnip = await knex('crops').where({ name: TURNIP }).update({ soil_effect: 'neutral' });
    if (turnip !== 1) throw new Error(`forum_content_pass: no crop "${TURNIP}"`);

    // Agropelter: bark.
    const bark = await knex('items').where({ name: BARK }).first('id');
    if (!bark) throw new Error(`forum_content_pass: no item "${BARK}"`);
    if (!(await knex('drop_table_entries').where({ source_key: AGROPELTER_KEY }).first('id'))) {
        throw new Error(`forum_content_pass: no drops under "${AGROPELTER_KEY}"`);
    }
    const row = { source_key: AGROPELTER_KEY, item_id: bark.id, chance_percent: null, ...BARK_DROP, is_active: true };
    const existing = await knex('drop_table_entries').where({ source_key: AGROPELTER_KEY, item_id: bark.id }).first('id');
    if (existing) await knex('drop_table_entries').where({ id: existing.id }).update(row);
    else await knex('drop_table_entries').insert(row);

    // Rods and nets.
    for (const { subtype, factor } of LIFE_FACTORS) {
        const n = await knex('items').where({ type: 'tool', subtype }).update({ durability_life_factor: factor });
        if (n < 1) throw new Error(`forum_content_pass: no tools of subtype "${subtype}"`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        const sow = await knex('trap_targets').where({ name: SOW }).first('id', 'drop_table');
        if (sow) {
            const table: any[] = typeof sow.drop_table === 'string' ? JSON.parse(sow.drop_table) : sow.drop_table;
            await knex('trap_targets').where({ id: sow.id })
                .update({ drop_table: JSON.stringify(table.filter((d) => d.itemName !== PORK.itemName)) });
        }
        await knex('crops').where({ name: TURNIP }).update({ soil_effect: 'deplete' });
        const bark = await knex('items').where({ name: BARK }).first('id');
        if (bark) await knex('drop_table_entries').where({ source_key: AGROPELTER_KEY, item_id: bark.id }).delete();
    }
    if (await knex.schema.hasColumn('items', 'durability_life_factor')) {
        await knex.schema.alterTable('items', (t) => { t.dropColumn('durability_life_factor'); });
    }
}
