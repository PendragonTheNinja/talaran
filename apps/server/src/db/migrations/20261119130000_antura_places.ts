import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's shell, part one (docs/antura-plan.md §2 and §3; docs/sailing-spec.md
// §4): its eight places, its roads, and the ferry from Talador.
//
// The roads are Claude's sketch on Nathan's map (§2), taken as the working
// layout until his final map (Nathan, 2026-11-19). Each is a row, so moving a
// road or changing its time is a data change. map_x and map_y are rough grid
// places on the same scale as Taiar's, to be set from the final map.
//
//   islands 'Antura'                tier 2; homestead at Farefield, player
//                                   shops in Wendhaven, at most 10 fields.
//   location_connections.ferry_fare    whole gold for the ferry; null where none runs.
//   location_connections.ferry_seconds the ferry's crossing, fixed: Wayfaring,
//                                      mounts, and provisions do not speed a ship a
//                                      player only rides on (sailing spec §4).
//   The crossing                     Talador to Wendhaven, travel_type 'sea':
//                                   base_travel_time 420 is a boat's crossing at
//                                   its slowest (the Skiff, about 7 minutes at
//                                   Wayfaring 1); the ferry takes 480 for a
//                                   fare of 50 (Nathan, 2026-11-15).
//   Wendhaven has a slip (settled); the Cog and Antura's islets come later.

const ISLAND = 'Antura';

const PLACES = [
    { name: 'Wendhaven', type: 'town', map_x: 6, map_y: 8, has_slip: true,
        description: 'Antura\'s port, a harbour of grey stone where the ferry from Talador ties up. Boats come and go on every tide, and so do the people who sail them.' },
    { name: 'Farefield', type: 'farmland', map_x: 5, map_y: 6, has_slip: false,
        description: 'Broad fields running down toward the sea, hedged with blackthorn. The farmers here grow what the shore plants taught them, and the field margins are thick with seed.' },
    { name: 'Mettlefell', type: 'town', map_x: 6, map_y: 4, has_slip: false,
        description: 'A forge town of soot and hammers under the fells. Every second house has a chimney, and every chimney is lit.' },
    { name: 'Underway', type: 'mine', map_x: 7, map_y: 3, has_slip: false,
        description: 'A mine that runs down under the fells in long sloping galleries. The miners say there is more Serph in it than anyone alive will dig.' },
    { name: 'Bidewater', type: 'lake', map_x: 5, map_y: 2, has_slip: false,
        description: 'A long, still lake among the hills, dark in the middle and reedy at the edges. Fish rise here at dusk in rings that spread to both shores.' },
    { name: 'Farvick Narrows', type: 'coast', map_x: 3, map_y: 6, has_slip: false,
        description: 'A narrow strait between Antura and a ridge of rock out in the sea. The water runs fast through it, and at low tide the shore is all rock pools and salt marsh.' },
    { name: 'Yondereach', type: 'mountain', map_x: 7, map_y: 1, has_slip: false,
        description: 'The high passes: a road climbing through bare stone under a cold sky, with caves in the crags above it. Something lives in every one of them.' },
    { name: 'Vergehorns', type: 'coast', map_x: 1, map_y: 7, has_slip: false,
        description: 'Twin headlands standing out into the sea like the horns of a bull, sheer and wind-bitten. Eagles nest on the ledges, and worse things than eagles.' },
];

// [from, to, seconds on foot at level 1] (docs/antura-plan.md §2).
const ROADS: [string, string, number][] = [
    ['Wendhaven', 'Farefield', 45],
    ['Farefield', 'Mettlefell', 60],
    ['Mettlefell', 'Underway', 30],
    ['Farefield', 'Farvick Narrows', 55],
    ['Farvick Narrows', 'Mettlefell', 100],
    ['Mettlefell', 'Bidewater', 130],
    ['Bidewater', 'Yondereach', 110],
    ['Farvick Narrows', 'Vergehorns', 225],
];

const CROSSING = { from: 'Talador', to: 'Wendhaven', boatSeconds: 420, ferrySeconds: 480, fare: 50 };

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('location_connections', 'ferry_fare'))) {
        await knex.schema.alterTable('location_connections', (t) => {
            t.integer('ferry_fare').nullable();
            t.integer('ferry_seconds').nullable();
        });
    }
    if (!(await hasContent(knex))) return;

    await knex('islands').insert({ name: ISLAND, tier: 2, display_order: 2, homestead_place: 'Farefield', shop_town: 'Wendhaven', plot_max: 10 })
        .onConflict('name').merge();

    const ids = new Map<string, number>();
    for (const p of PLACES) {
        const row = { ...p, region: ISLAND, is_safe: true, is_accessible: true };
        const had = await knex('locations').where({ name: p.name }).first('id', 'region');
        if (had && had.region !== ISLAND) throw new Error(`antura_places: a place named ${p.name} already stands on ${had.region}`);
        if (had) {
            await knex('locations').where({ id: had.id }).update({ ...row, updated_at: knex.fn.now() });
            ids.set(p.name, had.id);
        } else {
            const [ins] = await knex('locations').insert(row).returning('id');
            ids.set(p.name, Number(typeof ins === 'object' ? ins.id : ins));
        }
    }
    const talador = await knex('locations').where({ name: CROSSING.from }).first('id');
    if (!talador) throw new Error('antura_places: no location named Talador');
    ids.set(CROSSING.from, talador.id);

    const road = async (from: string, to: string, row: Record<string, unknown>) => {
        const a = ids.get(from)!, b = ids.get(to)!;
        const had = await knex('location_connections')
            .where((q) => q.where({ from_location_id: a, to_location_id: b }).orWhere({ from_location_id: b, to_location_id: a }))
            .first('id');
        const full = { from_location_id: a, to_location_id: b, is_bidirectional: true, ...row };
        if (had) await knex('location_connections').where({ id: had.id }).update({ ...full, updated_at: knex.fn.now() });
        else await knex('location_connections').insert(full);
    };
    for (const [from, to, seconds] of ROADS) {
        await road(from, to, { base_travel_time: seconds, travel_type: 'walking', ferry_fare: null, ferry_seconds: null });
    }
    await road(CROSSING.from, CROSSING.to, {
        base_travel_time: CROSSING.boatSeconds, travel_type: 'sea', ferry_fare: CROSSING.fare, ferry_seconds: CROSSING.ferrySeconds,
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        const places = await knex('locations').where({ region: ISLAND }).pluck('id');
        if (places.length) {
            // Anyone standing on Antura goes back to Talador first.
            const talador = await knex('locations').where({ name: CROSSING.from }).first('id');
            if (talador) await knex('players').whereIn('current_location_id', places).update({ current_location_id: talador.id });
            await knex('player_actions').whereIn('location_id', places).delete();
            await knex('location_connections').whereIn('from_location_id', places).orWhereIn('to_location_id', places).delete();
            await knex('locations').whereIn('id', places).delete();
        }
        await knex('islands').where({ name: ISLAND }).delete();
    }
    if (await knex.schema.hasColumn('location_connections', 'ferry_fare')) {
        await knex.schema.alterTable('location_connections', (t) => { t.dropColumn('ferry_fare'); t.dropColumn('ferry_seconds'); });
    }
}
