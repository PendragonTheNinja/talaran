import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's road times against Nathan's final map (2026-11-26). Each road was
// traced along its drawn line on the 1080-pixel map and timed at Taiar's own
// rate, about 0.4 seconds a pixel of road, so the two islands share one scale.
// Mountain roads take longer for the climb (Bidewater to Yondereach a quarter
// more, Underway's spur a tenth), and Farvick Narrows to Vergehorns, the long
// winding road over the headland, is the longest in the game by far (Nathan).
//
//   road                          traced   was   now
//   Wendhaven - Farefield           96px    45    38
//   Wendhaven - Farvick Narrows    208px    55    83
//   Mettlefell - Underway          193px    30    85   hill spur
//   Mettlefell - Bidewater         228px   130    91
//   Mettlefell - Farefield         242px    60    97
//   Underway - Farefield           243px    65   102   hill spur
//   Bidewater - Yondereach         273px   110   137   mountain road
//   Farvick Narrows - Vergehorns   482px   225   240   the longest

const ROADS: [string, string, number, number][] = [   // a, b, now, was
    ['Wendhaven', 'Farefield', 38, 45],
    ['Wendhaven', 'Farvick Narrows', 83, 55],
    ['Mettlefell', 'Underway', 85, 30],
    ['Mettlefell', 'Bidewater', 91, 130],
    ['Farefield', 'Mettlefell', 97, 60],
    ['Underway', 'Farefield', 102, 65],
    ['Bidewater', 'Yondereach', 137, 110],
    ['Farvick Narrows', 'Vergehorns', 240, 225],
];

async function idOf(knex: Knex, name: string): Promise<number> {
    const row = await knex('locations').where({ name }).first('id');
    if (!row) throw new Error(`antura_road_times: no place named ${name}`);
    return row.id;
}

async function setTimes(knex: Knex, which: 2 | 3): Promise<void> {
    for (const road of ROADS) {
        const a = await idOf(knex, road[0]), b = await idOf(knex, road[1]);
        const n = await knex('location_connections')
            .where(q => q.where({ from_location_id: a, to_location_id: b }).orWhere({ from_location_id: b, to_location_id: a }))
            .whereNotIn(knex.raw("coalesce(travel_type, '')") as any, ['sea', 'ferry'])
            .update({ base_travel_time: road[which] });
        if (n < 1) throw new Error(`antura_road_times: no road between ${road[0]} and ${road[1]}`);
    }
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setTimes(knex, 2);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await setTimes(knex, 3);
}
