import type { Knex } from 'knex';

// Combat drop rates, first pass (Nathan, 2026-10-11). Forward-fix on
// 20261010140000_taiar_creatures, which was already delivered.
//
//   Wrecker   Linen Cloth 1 in 40, Locked Rusty Chest 1 in 55, Ambren Tinderbox 1 in 80
//   Jumper    Charc 1 in 10, his mine's ore 1 in 20 (still 2 to 4)
//
// Granary Rat, against the sources it must stay under. A drawn Novita fight
// meets ~40 to 57 Granary Rats an hour at combat 9 to 30 (combatSim kitAt,
// one-hand slash, Ambren). At 1 in 5 (1-3) Grain and 1 in 8 (1-2) Wild Grain
// that was ~17 to 23 Grain and ~8 to 11 Wild Grain an hour: 140+ Grain over an
// 8-hour day, more than a Farming 30 player's Wild Grain plots thresh (~110),
// and half of what the Sunlit Meadow gives a forager in Wild Grain (14 to 25
// an hour, its seed source). Now:
//
//   Grain       1 in 10, 1-2   ~6 to 9 an hour   (~50 to 70 over 8 hours)
//   Wild Grain  1 in 20, 1     ~2 to 3 an hour   (~10 to 15% of foraging)

// [source key, item, 1 in N now, min, max, 1 in N before, min before, max before]
const RATES: [string, string, number, number, number, number, number, number][] = [
    ['combat:wrecker', 'Linen Cloth', 40, 1, 1, 25, 1, 1],
    ['combat:wrecker', 'Locked Rusty Chest', 55, 1, 1, 40, 1, 1],
    ['combat:wrecker', 'Ambren Tinderbox', 80, 1, 1, 60, 1, 1],
    ['combat:jumper', 'Charc', 10, 1, 2, 8, 1, 2],
    ['combat:jumper@origrund_spoil', 'Ambren Ore', 20, 2, 4, 6, 2, 4],
    ['combat:jumper@grundagr_workings', 'Burgh Ore', 20, 2, 4, 6, 2, 4],
    ['combat:granary_rat', 'Grain', 10, 1, 2, 5, 1, 3],
    ['combat:granary_rat', 'Wild Grain', 20, 1, 1, 8, 1, 2],
];

async function apply(knex: Knex, before: boolean): Promise<void> {
    for (const [sourceKey, itemName, oneIn, min, max, oneInWas, minWas, maxWas] of RATES) {
        const item = await knex('items').where({ name: itemName }).first();
        if (!item) throw new Error(`combat_drop_rates: item ${itemName} not found`);
        const updated = await knex('drop_table_entries')
            .where({ source_key: sourceKey, item_id: item.id })
            .update(before
                ? { chance_one_in: oneInWas, min_qty: minWas, max_qty: maxWas, updated_at: knex.fn.now() }
                : { chance_one_in: oneIn, min_qty: min, max_qty: max, updated_at: knex.fn.now() });
        if (updated !== 1) throw new Error(`combat_drop_rates: expected one ${sourceKey} row for ${itemName}, found ${updated}`);
    }
}

export async function up(knex: Knex): Promise<void> {
    await apply(knex, false);
}

export async function down(knex: Knex): Promise<void> {
    await apply(knex, true);
}
