import type { Knex } from 'knex';

/**
 * Wild hive: per node, and rarer.
 *
 * The beekeeping migration keyed the drop on wood SUBTYPE, so both Lanai nodes
 * shared one rate. Eld Grove's Old Growth Lanai takes 60s a chop against
 * Lanaivale's 45s, which made the higher-level tree the WORSE bee hunt: fewer
 * chops an hour at identical odds. Exactly backwards.
 *
 * Now keyed per node, at odds that put both on about the same clock while
 * leaving the deeper wood marginally ahead:
 *
 *   Lanai Tree (Lanaivale)        1 in 650   ~8.1h base, ~4.5h at min timer
 *   Old Growth Lanai (Eld Grove)  1 in 480   ~8.0h base, ~4.3h at min timer
 *
 * Rarer than the 1 in 400 it shipped with, which was landing a hive every 3 to
 * 5 hours. A full apiary is three hives, and since bees never breed this is the
 * permanent ceiling on honey supply, so it should feel like a find.
 */

const NODE_ODDS: Array<{ node: string; oneIn: number }> = [
    { node: 'Lanai Tree', oneIn: 650 },
    { node: 'Old Growth Lanai Tree', oneIn: 480 },
];

export async function up(knex: Knex): Promise<void> {
    const hive = await knex('items').where({ name: 'Wild Hive' }).first();
    if (!hive) return; // beekeeping has not run; nothing to move

    // Drop the subtype-keyed entries the beekeeping migration wrote.
    await knex('drop_table_entries')
        .where({ item_id: hive.id })
        .whereLike('source_key', 'woodcutting:%')
        .whereRaw("source_key NOT LIKE 'woodcutting:node:%'")
        .delete();

    for (const { node, oneIn } of NODE_ODDS) {
        const rows = await knex('resource_nodes').where({ name: node, skill: 'woodcutting' });
        for (const row of rows) {
            const sourceKey = `woodcutting:node:${row.id}`;
            const existing = await knex('drop_table_entries')
                .where({ source_key: sourceKey, item_id: hive.id })
                .first();
            if (existing) {
                await knex('drop_table_entries')
                    .where({ id: existing.id })
                    .update({ chance_one_in: oneIn });
                continue;
            }
            await knex('drop_table_entries').insert({
                source_key: sourceKey,
                item_id: hive.id,
                chance_one_in: oneIn,
                min_qty: 1,
                max_qty: 1,
                discovery_xp: 40,
                is_active: true,
            });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    const hive = await knex('items').where({ name: 'Wild Hive' }).first();
    if (!hive) return;

    await knex('drop_table_entries')
        .where({ item_id: hive.id })
        .whereLike('source_key', 'woodcutting:node:%')
        .delete();

    // Put back the subtype keying at its original odds.
    const subtypes = await knex('items')
        .whereIn('subtype', ['lanai', 'bearn', 'craxial', 'hatch', 'mirrith'])
        .distinct('subtype')
        .pluck('subtype');
    for (const subtype of subtypes) {
        const sourceKey = `woodcutting:${subtype}`;
        const existing = await knex('drop_table_entries')
            .where({ source_key: sourceKey, item_id: hive.id }).first();
        if (existing) continue;
        await knex('drop_table_entries').insert({
            source_key: sourceKey,
            item_id: hive.id,
            chance_one_in: 400,
            min_qty: 1,
            max_qty: 1,
            discovery_xp: 40,
            is_active: true,
        });
    }
}
