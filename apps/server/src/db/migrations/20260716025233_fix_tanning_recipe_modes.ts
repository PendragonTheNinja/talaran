import type { Knex } from 'knex';

// Repair: the tan recipes' passive/station/bark fields didn't land, so they were
// still showing as clickable bench crafts and the rack found nothing to soak.
// Also normalises `station` to a workstations.type ('tanning'), matching
// 'carpentry'/'smithing' — it was a display name, which could never match a row.

const TANS = [
    {
        name: 'Tan Deerhide', timer_seconds: 21600, xp: 25, output_qty: 1,
        station: 'tanning', mode: 'passive',
        inputs: JSON.stringify([
            { itemName: 'Deerhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 3 },
        ]),
    },
    {
        name: 'Tan Boarhide', timer_seconds: 21600, xp: 50, output_qty: 2,
        station: 'tanning', mode: 'passive',
        inputs: JSON.stringify([
            { itemName: 'Boarhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 5 },
        ]),
    },
    {
        name: 'Tan Slothhide', timer_seconds: 21600, xp: 90, output_qty: 3,
        station: 'tanning', mode: 'passive',
        inputs: JSON.stringify([
            { itemName: 'Slothhide', qty: 1 },
            { itemName: 'Lanai Bark', qty: 8 },
        ]),
    },
];

export async function up(knex: Knex): Promise<void> {
    for (const tan of TANS) {
        const { name, ...fields } = tan;
        const existing = await knex('recipes').where({ name }).first();
        if (!existing) throw new Error(`fix_tanning_recipe_modes: recipe "${name}" not found`);
        await knex('recipes').where({ id: existing.id }).update(fields);
    }
    // Any earlier rows that used the display name
    await knex('recipes').where({ station: 'Tanning Rack' }).update({ station: 'tanning' });
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', TANS.map(t => t.name))
        .update({ mode: 'active', station: null });
}