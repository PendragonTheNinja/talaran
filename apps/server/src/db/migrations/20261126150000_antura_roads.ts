import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's roads as Nathan drew them on the final map (2026-11-26), replacing
// the proposed ones it was built on (20261119130000):
//   - Farvick Narrows is reached from Wendhaven, up the east shore, not from
//     Farefield or Mettlefell.
//   - Underway's road comes down to the Mettlefell-Farefield road, so it leads
//     to both.
// Times by road length on the map, against the roads already there.

const DROP: [string, string][] = [
    ['Farefield', 'Farvick Narrows'],
    ['Farvick Narrows', 'Mettlefell'],
];

const ADD: [string, string, number][] = [
    ['Wendhaven', 'Farvick Narrows', 55],
    ['Underway', 'Farefield', 65],
];

async function idOf(knex: Knex, name: string): Promise<number> {
    const row = await knex('locations').where({ name }).first('id');
    if (!row) throw new Error(`antura_roads: no place named ${name}`);
    return row.id;
}

/** The road between two places, whichever way it was entered. */
function between(knex: Knex, a: number, b: number) {
    return knex('location_connections').where(q => q
        .where({ from_location_id: a, to_location_id: b })
        .orWhere({ from_location_id: b, to_location_id: a }));
}

async function setRoads(knex: Knex, drop: [string, string][], add: [string, string, number][]): Promise<void> {
    for (const [x, y] of drop) {
        await between(knex, await idOf(knex, x), await idOf(knex, y)).delete();
    }
    for (const [x, y, seconds] of add) {
        const a = await idOf(knex, x), b = await idOf(knex, y);
        if (await between(knex, a, b).first('id')) continue;
        await knex('location_connections').insert({
            from_location_id: a, to_location_id: b, base_travel_time: seconds,
            travel_type: 'walking', is_bidirectional: true,
        });
    }
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setRoads(knex, DROP, ADD);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setRoads(knex, ADD.map(([x, y]) => [x, y]), [['Farefield', 'Farvick Narrows', 55], ['Farvick Narrows', 'Mettlefell', 100]]);
}
