import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's rare weapons (Nathan, 2026-11-26), as Taiar's were made the same day
// (20261126110000): the Dripstone Cudgel drops 1 in 750 (was 1 in 1,000), Eagle
// Talons and the Reaver's Dane Axe 1 in 1,000 (were 1 in 1,250), each certain
// at twice its odds; all three break 0.1% a use past their 6,250 sure uses
// (was 0.17%).

const ODDS: { key: string; item: string; oneIn: number; badLuck: number; was: [number, number] }[] = [
    { key: 'combat:cave_bear', item: 'Dripstone Cudgel', oneIn: 750, badLuck: 1500, was: [1000, 2000] },
    { key: 'combat:sea_eagle', item: 'Eagle Talons', oneIn: 1000, badLuck: 2000, was: [1250, 2500] },
    { key: 'combat:reaver', item: "Reaver's Dane Axe", oneIn: 1000, badLuck: 2000, was: [1250, 2500] },
];

async function dropRow(knex: Knex, key: string, item: string) {
    const row = await knex('drop_table_entries as d').join('items as i', 'i.id', 'd.item_id')
        .where({ 'd.source_key': key, 'i.name': item }).first('d.id');
    if (!row) throw new Error(`antura_rare_weapon_odds: no ${item} under ${key}`);
    return row.id;
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const o of ODDS) {
        const id = await dropRow(knex, o.key, o.item);
        await knex('drop_table_entries').where({ id }).update({ chance_one_in: o.oneIn, chance_percent: null, bad_luck_kills: o.badLuck });
        const n = await knex('items').where({ name: o.item }).update({ durability_break_pct: 0.1 });
        if (n !== 1) throw new Error(`antura_rare_weapon_odds: no item named ${o.item}`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const o of ODDS) {
        const id = await dropRow(knex, o.key, o.item);
        await knex('drop_table_entries').where({ id }).update({ chance_one_in: o.was[0], bad_luck_kills: o.was[1] });
        await knex('items').where({ name: o.item }).update({ durability_break_pct: 0.17 });
    }
}
