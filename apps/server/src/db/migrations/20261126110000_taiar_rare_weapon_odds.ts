import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Taiar's rare weapons (Nathan, 2026-11-26):
//   - the Gouger's Legbone drops 1 in 750 (was 1 in 1,000), the Wrecker's
//     Cutlass 1 in 1,000 (was 1 in 1,250). The bad-luck count is its own
//     column, not worked out from the chance, so it moves with it: certain
//     at twice the odds, as every rare weapon is.
//   - past their 5,000 sure uses, Taiar's three break 0.1% a use (was 0.2%).

const ODDS: { key: string; item: string; oneIn: number; badLuck: number; was: [number, number] }[] = [
    { key: 'combat:sidehill_gouger', item: "Gouger's Legbone", oneIn: 750, badLuck: 1500, was: [1000, 2000] },
    { key: 'combat:wrecker', item: "Wrecker's Cutlass", oneIn: 1000, badLuck: 2000, was: [1250, 2500] },
];

const BREAK = ['Hodag Horn', "Wrecker's Cutlass", "Gouger's Legbone"];

async function dropRow(knex: Knex, key: string, item: string) {
    const row = await knex('drop_table_entries as d').join('items as i', 'i.id', 'd.item_id')
        .where({ 'd.source_key': key, 'i.name': item }).first('d.id');
    if (!row) throw new Error(`taiar_rare_weapon_odds: no ${item} under ${key}`);
    return row.id;
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const o of ODDS) {
        const id = await dropRow(knex, o.key, o.item);
        await knex('drop_table_entries').where({ id }).update({ chance_one_in: o.oneIn, chance_percent: null, bad_luck_kills: o.badLuck });
    }
    for (const name of BREAK) {
        const n = await knex('items').where({ name }).update({ durability_break_pct: 0.1 });
        if (n !== 1) throw new Error(`taiar_rare_weapon_odds: no item named ${name}`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const o of ODDS) {
        const id = await dropRow(knex, o.key, o.item);
        await knex('drop_table_entries').where({ id }).update({ chance_one_in: o.was[0], bad_luck_kills: o.was[1] });
    }
    await knex('items').whereIn('name', BREAK).update({ durability_break_pct: 0.2 });
}
