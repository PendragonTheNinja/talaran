import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Taiar's roads get shorter (Nathan, 2026-10-16). Players found the first island
// slow to cross, so walking there now takes what a Rouncey at riding level 1
// took: 0.3 + 0.25 × 0.03^(1/100) = 54.14% of the old base time, rounded to the
// second (the curve in services/travel.ts). Islands opened later get longer
// roads, so the first one is the quickest to cross.
//
// Mounts are a fraction of the base, so riding gets faster in the same
// proportion and keeps its lead over walking. XP is paid per base second, so a
// trip pays less and an hour on the road pays the same.
//
// Each road is named by its two towns as live stores them (from → to) with the
// time it had on live on 2026-10-16. A road at its old time is shortened, one
// already at its new time is left alone (re-run), and anything else stops the
// migration rather than overwriting a time someone set since. down() puts the
// old times back the same way.

const ROADS: Array<[from: string, to: string, before: number, after: number]> = [
    ['Emberra', 'Grundagr', 66, 36],
    ['Novita', 'Eld Grove', 83, 45],
    ['Caliwen', 'Verdale', 96, 52],
    ['Verdale', 'Lanaivale', 104, 56],
    ['Eld Grove', 'Caliwen', 109, 59],
    ['Talador', 'Emberra', 111, 60],
    ['Talador', 'Origrund', 119, 64],
    ['Phoenwick', 'Origrund', 119, 64],
    ['Phoenwick', 'Luxmere', 120, 65],
    ['Phoenwick', 'Dawncrest', 137, 74],
    ['Talador', 'Phoenwick', 145, 79],
    ['Lanaivale', 'Luxmere', 160, 87],
    ['Grundagr', 'Novita', 180, 97],
    ['Lanaivale', 'Phoenwick', 180, 97],
    ['Emberra', 'Origrund', 200, 108],
    ['Grundagr', 'Talar Rift', 242, 131],
    ['Dawncrest', 'Luxmere', 255, 138],
    ['Novita', 'Talar Rift', 300, 162],
];

async function setTimes(knex: Knex, direction: 'up' | 'down'): Promise<void> {
    // A fresh database before content:import (lib/migrationContent.ts).
    if (!(await hasContent(knex))) return;

    await knex.transaction(async (trx) => {
        for (const [from, to, before, after] of ROADS) {
            const [expected, target] = direction === 'up' ? [before, after] : [after, before];
            const road = await trx('location_connections as c')
                .join('locations as a', 'a.id', 'c.from_location_id')
                .join('locations as b', 'b.id', 'c.to_location_id')
                .where('a.name', from).andWhere('b.name', to)
                .select('c.id', 'c.base_travel_time')
                .first();
            if (!road) throw new Error(`taiar_road_times: no road from ${from} to ${to}`);

            const now = Number(road.base_travel_time);
            if (now === target) continue;
            if (now !== expected) {
                throw new Error(`taiar_road_times: ${from} to ${to} is ${now}s, expected ${expected}s; changed since 2026-10-16, so it is left for a person to decide`);
            }
            await trx('location_connections').where({ id: road.id }).update({ base_travel_time: target });
        }
    });
}

export async function up(knex: Knex): Promise<void> {
    await setTimes(knex, 'up');
}

export async function down(knex: Knex): Promise<void> {
    await setTimes(knex, 'down');
}
