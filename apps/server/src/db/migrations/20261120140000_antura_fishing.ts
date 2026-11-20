import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's water (docs/antura-plan.md §9; Nathan, 2026-11-15: three or four
// fish a water across 13 to 24, Rudd for Grayling). Bidewater is fresh,
// Farvick Narrows salt. A cast there is 80 s at Fishing 13 (WATER_TIERS in
// services/fishing.ts), and each fish pays the band for that cast, as Taiar's
// pay it for 70 s: 65, 70, 75, and 81. Glassback is the invented lake fish,
// named by Claude for Nathan to change.
//
//   fish_species  unique on (name, water) now, not name: salvage is reused in
//                 the new waters (§9: nothing new without a use), and a salvage
//                 row is named for its item. Every fish name stays unique.
//   The net      hauls Tench and Rudd, Mackerel and Pollock (3 levels over the
//                 rung, services/fishing.ts netMaxSpeciesLevel).
//   Serph rod    Lanai Tool Rod, Serph Hook, 2 Linen Thread, Carpentry 15, worn
//                 from Fishing 13 as every Serph tool is.

const FISH = [
    // Bidewater
    { name: 'Tench', place: 'Bidewater', water: 'fresh', required_level: 13, xp: 65, bait_category: 'grain', time_window: 'dusk', window_exclusive: false, seasons: 'summer', season_exclusive: false, min_weight_cw: 80, max_weight_cw: 1000, bait_value: 3, display_order: 1,
      description: 'A thick olive-green lake fish, slimy as a wet stone, with small red eyes. It lives in the mud and likes it there.' },
    { name: 'Rudd', place: 'Bidewater', water: 'fresh', required_level: 16, xp: 70, bait_category: 'egg', time_window: 'day', window_exclusive: false, seasons: 'spring,summer', season_exclusive: false, min_weight_cw: 20, max_weight_cw: 300, bait_value: 3, display_order: 2,
      description: 'A golden lake fish with bright red fins. It feeds near the top and spooks at a shadow.' },
    { name: 'Zander', place: 'Bidewater', water: 'fresh', required_level: 19, xp: 75, bait_category: 'meat', time_window: 'dusk', window_exclusive: false, seasons: 'autumn', season_exclusive: false, min_weight_cw: 200, max_weight_cw: 2000, bait_value: 4, display_order: 3,
      description: 'A long gray hunter of the lake with glassy eyes and a row of teeth. It sees well in murky water, which is how it catches everything else.' },
    { name: 'Glassback', place: 'Bidewater', water: 'fresh', required_level: 22, xp: 81, bait_category: 'spawn', time_window: 'night', window_exclusive: true, seasons: 'autumn,winter', season_exclusive: false, min_weight_cw: 300, max_weight_cw: 4000, bait_value: 4, display_order: 4,
      description: 'A pale fish from the deep middle of Bidewater, so clear along the back that you can see the line of its spine. It only rises after dark.' },
    // Farvick Narrows
    { name: 'Mackerel', place: 'Farvick Narrows', water: 'salt', required_level: 13, xp: 65, bait_category: 'meat', time_window: 'day', window_exclusive: false, seasons: 'summer,autumn', season_exclusive: false, min_weight_cw: 30, max_weight_cw: 400, bait_value: 3, display_order: 1,
      description: 'A sleek fish with tiger stripes of green and blue down its back. Oily, quick, and best eaten the day it is caught.' },
    { name: 'Pollock', place: 'Farvick Narrows', water: 'salt', required_level: 16, xp: 70, bait_category: 'spawn', time_window: null, window_exclusive: false, seasons: 'winter', season_exclusive: false, min_weight_cw: 100, max_weight_cw: 2500, bait_value: 3, display_order: 2,
      description: 'A bronze-green fish of the strait, long-jawed, with a dark line down each side.' },
    { name: 'Sea Bass', place: 'Farvick Narrows', water: 'salt', required_level: 19, xp: 75, bait_category: 'egg', time_window: 'dusk', window_exclusive: true, seasons: 'summer', season_exclusive: false, min_weight_cw: 100, max_weight_cw: 1500, bait_value: 4, display_order: 3,
      description: 'A silver fish with a spiny back fin, strong enough to bend a rod double. The fishermen of the strait boast about these.' },
    { name: 'Turbot', place: 'Farvick Narrows', water: 'salt', required_level: 22, xp: 81, bait_category: 'meat', time_window: 'night', window_exclusive: false, seasons: 'spring,summer', season_exclusive: true, min_weight_cw: 200, max_weight_cw: 5000, bait_value: 4, display_order: 4,
      description: 'A broad flat fish, round as a shield, both eyes on one side and freckled to match the sand.' },
];

// Salvage, reused (§9), with Taiar's weights and XP: the strait has the sea's,
// the lake the fresh water's.
const SALVAGE = [
    { name: 'Locked Rusty Chest', place: 'Farvick Narrows', water: 'salt', base_weight: 85 },
    { name: 'Amber', place: 'Farvick Narrows', water: 'salt', base_weight: 15 },
    { name: 'River Mussel', place: 'Bidewater', water: 'fresh', base_weight: 80 },
    { name: 'Frogspawn', place: 'Bidewater', water: 'fresh', base_weight: 15 },
];

const ROD_ITEM = {
    name: 'Serph Fishing Rod', type: 'tool', subtype: 'fishing_rod', tier: 2, slot: 'mainhand', level_required: 13, is_active: true,
    description: 'A Lanai rod with a hook of Serph and a line of doubled linen. It holds what an Ambren hook would lose.',
};

const ROD_RECIPE = {
    name: 'Assemble Serph Fishing Rod', skill: 'Carpentry', output_item_name: 'Serph Fishing Rod', output_qty: 1,
    inputs: JSON.stringify([{ itemName: 'Lanai Tool Rod', qty: 1 }, { itemName: 'Serph Hook', qty: 1 }, { itemName: 'Linen Thread', qty: 2 }]),
    required_level: 15, timer_seconds: 60, xp: 92, station: 'carpentry', is_active: true, mode: 'active', for_skill: 'Fishing',
    flavor_text: 'You double the line, whip it down the pole, and seat the Serph hook at its end.',
    required_tools: JSON.stringify([]),
};

const NEW_NAMES = FISH.map(f => f.name);

async function placeId(knex: Knex, name: string): Promise<number> {
    const row = await knex('locations').where({ name }).first('id');
    if (!row) throw new Error(`antura_fishing: no location named ${name} (run 20261119130000 first)`);
    return row.id;
}

async function upsertItem(knex: Knex, row: Record<string, unknown>) {
    const had = await knex('items').where({ name: row.name }).first('id');
    if (had) await knex('items').where({ id: had.id }).update(row);
    else await knex('items').insert(row);
}

export async function up(knex: Knex): Promise<void> {
    // The key change runs on any database, content or not.
    const keys = await knex.raw(`SELECT conname FROM pg_constraint WHERE conrelid = 'fish_species'::regclass AND contype = 'u'`);
    const names = keys.rows.map((r: { conname: string }) => r.conname);
    if (names.includes('fish_species_name_unique')) {
        await knex.raw('ALTER TABLE fish_species DROP CONSTRAINT fish_species_name_unique');
    }
    if (!names.includes('fish_species_name_location_unique')) {
        await knex.raw('ALTER TABLE fish_species ADD CONSTRAINT fish_species_name_location_unique UNIQUE (name, location_id)');
    }

    if (!(await hasContent(knex))) return;

    for (const f of FISH) {
        await upsertItem(knex, { name: f.name, type: 'food', subtype: 'raw_fish', tier: 2, level_required: 1, description: f.description, is_active: true });
        const location_id = await placeId(knex, f.place);
        // Fish names stay unique, so a fish is found by name wherever it was.
        const { description: _d, place: _p, ...rest } = f;
        const row = { ...rest, item_name: f.name, location_id, base_weight: 100, kind: 'fish', is_active: true };
        const had = await knex('fish_species').where({ name: f.name }).first('id');
        if (had) await knex('fish_species').where({ id: had.id }).update(row);
        else await knex('fish_species').insert(row);
    }

    for (const sv of SALVAGE) {
        const taiar = await knex('fish_species').where({ name: sv.name, kind: 'salvage' }).orderBy('id').first();
        if (!taiar) throw new Error(`antura_fishing: no salvage row "${sv.name}" to copy`);
        const location_id = await placeId(knex, sv.place);
        const row = {
            name: sv.name, item_name: taiar.item_name, location_id, water: sv.water, kind: 'salvage',
            required_level: 1, base_weight: sv.base_weight, xp: taiar.xp, bait_value: taiar.bait_value,
            min_weight_cw: 0, max_weight_cw: 0, display_order: 50, is_active: true,
        };
        const had = await knex('fish_species').where({ name: sv.name, location_id }).first('id');
        if (had) await knex('fish_species').where({ id: had.id }).update(row);
        else await knex('fish_species').insert(row);
    }

    for (const n of ['Lanai Tool Rod', 'Serph Hook', 'Linen Thread']) {
        if (!(await knex('items').where({ name: n }).first('id'))) throw new Error(`antura_fishing: item "${n}" not found`);
    }
    await upsertItem(knex, ROD_ITEM);
    const hadRecipe = await knex('recipes').where({ name: ROD_RECIPE.name }).first('id');
    if (hadRecipe) await knex('recipes').where({ id: hadRecipe.id }).update(ROD_RECIPE);
    else await knex('recipes').insert(ROD_RECIPE);
}

export async function down(knex: Knex): Promise<void> {
    if (await hasContent(knex)) {
        await knex('recipes').where({ name: ROD_RECIPE.name }).delete();
        const antura = await knex('locations').whereIn('name', ['Bidewater', 'Farvick Narrows']).pluck('id');
        await knex('fish_species').whereIn('location_id', antura).delete();
        // Items stay, as players may hold them; the fish rows go.
        await knex('fish_species').whereIn('name', NEW_NAMES).delete();
    }
    const keys = await knex.raw(`SELECT conname FROM pg_constraint WHERE conrelid = 'fish_species'::regclass AND contype = 'u'`);
    const names = keys.rows.map((r: { conname: string }) => r.conname);
    if (names.includes('fish_species_name_location_unique')) {
        await knex.raw('ALTER TABLE fish_species DROP CONSTRAINT fish_species_name_location_unique');
    }
    if (!names.includes('fish_species_name_unique')) {
        await knex.raw('ALTER TABLE fish_species ADD CONSTRAINT fish_species_name_unique UNIQUE (name)');
    }
}
