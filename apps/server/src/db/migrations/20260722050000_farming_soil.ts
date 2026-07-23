import type { Knex } from 'knex';

// Farming M2 — soil. Plots carry Rich / Normal / Depleted (the soil_state column
// already exists from M1, previously inert). Harvesting a hungry crop drops the
// soil a step; legumes lift it; leaving a field to rest lifts it slowly; manure
// lifts it at once.
//
//   rested_since — when the plot last became cropless. Fallow recovery is measured
//                  from here and applied on read, the same way growth is.
//   Manure       — the fast restore. It has NO SOURCE until Husbandry ships; the
//                  item and the action exist now so the loop is ready to close.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('farm_plots', 'rested_since'))) {
        await knex.schema.alterTable('farm_plots', (t) => {
            t.timestamp('rested_since').nullable();
        });
    }

    // Existing empty/tilled plots start their rest clock now.
    await knex('farm_plots')
        .whereNull('rested_since')
        .whereIn('state', ['empty', 'tilled'])
        .update({ rested_since: knex.fn.now() });

    const manure = {
        name: 'Manure', type: 'material', subtype: 'fertiliser', tier: 1,
        quality: null, slot: null, level_required: 1,
        description: 'Well-rotted muck from the byre. Unlovely, and worth more to a field than gold.',
        stackable: true,
    };
    const existing = await knex('items').where({ name: manure.name }).first();
    if (existing) await knex('items').where({ id: existing.id }).update(manure);
    else await knex('items').insert(manure);
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('farm_plots', 'rested_since')) {
        await knex.schema.alterTable('farm_plots', (t) => t.dropColumn('rested_since'));
    }
    // Manure item left in place.
}
