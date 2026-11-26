import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// More Hodags in the Deep Wood (Nathan, 2026-11-26). A Hodag was 15 fights in
// 100 there, so its Horn at 1 in 300 Hodags came out at 1 in 2,000 fights, the
// slowest of Taiar's rare weapons by far. Hodags are now 25 in 100, the other
// two giving up the ten in their own proportion (50:35 becomes 44:31), and the
// Horn drops 1 in 250 Hodags, certain at 500: 1 in 1,000 fights, level with
// the Wrecker's Cutlass at its chosen spot.

const SPOT = 'eld_grove_deep';
const WEIGHTS: Record<string, [number, number]> = {   // creature: [new, was]
    'Grey Wolf': [44, 50],
    Agropelter: [31, 35],
    Hodag: [25, 15],
};
const HORN = { key: 'combat:hodag', item: 'Hodag Horn', oneIn: 250, badLuck: 500, was: [300, 600] as [number, number] };

async function setWeights(knex: Knex, which: 0 | 1): Promise<void> {
    const spot = await knex('fighting_spots').where({ key: SPOT }).first('id');
    if (!spot) throw new Error(`deep_wood_hodags: no fighting spot ${SPOT}`);
    for (const [name, w] of Object.entries(WEIGHTS)) {
        const creature = await knex('creatures').where({ name }).first('id');
        if (!creature) throw new Error(`deep_wood_hodags: no creature ${name}`);
        const n = await knex('fighting_spot_creatures').where({ spot_id: spot.id, creature_id: creature.id }).update({ weight: w[which] });
        if (n !== 1) throw new Error(`deep_wood_hodags: ${name} is not at ${SPOT}`);
    }
}

async function setHorn(knex: Knex, oneIn: number, badLuck: number): Promise<void> {
    const row = await knex('drop_table_entries as d').join('items as i', 'i.id', 'd.item_id')
        .where({ 'd.source_key': HORN.key, 'i.name': HORN.item }).first('d.id');
    if (!row) throw new Error(`deep_wood_hodags: no ${HORN.item} under ${HORN.key}`);
    await knex('drop_table_entries').where({ id: row.id }).update({ chance_one_in: oneIn, chance_percent: null, bad_luck_kills: badLuck });
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setWeights(knex, 0);
    await setHorn(knex, HORN.oneIn, HORN.badLuck);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setWeights(knex, 1);
    await setHorn(knex, HORN.was[0], HORN.was[1]);
}
