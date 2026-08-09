import type { Knex } from 'knex';

// Fishing (docs/fishing-spec.md), part 1 of 2: schema + content.
// Part 2 (20260807143255) adds the gear recipes, Georemy, and his quest.
//
// A water is a LOCATION, not a habitat row: one pool per location, no sub-zones.
// Each cast is a weighted pick across every species the player is eligible for,
// and eligibility is level + time window + season. Bait does not gate anything;
// it re-weights the pool and shortens the timer.
//
// WEIGHTS ARE STORED AS INTEGER CENTIPOUNDS (`_cw`). CLAUDE.md §5: pg hands back
// numeric/decimal as STRINGS, so a numeric(8,2) column would arrive as "133.00"
// and quietly poison every comparison. 133.00 lb is 13300. The service divides
// by 100 exactly once, at the edge, for display.
//
// Upsert-by-name throughout, loud throws on missing references, honest down().

const ITEMS = [
    // --- Luxmere, freshwater ---
    { name: 'Tiddle', type: 'food', subtype: 'raw_fish', tier: 1, quality: null, slot: null, level_required: 1, description: 'Barely a fish at all. Half tadpole, half ambition, and entirely too pleased with itself.' },
    { name: 'Brook Dace', type: 'food', subtype: 'raw_fish', tier: 1, quality: null, slot: null, level_required: 1, description: 'A quick silver minnow of the shallows. Travels in numbers and panics as one.' },
    { name: 'Perch', type: 'food', subtype: 'raw_fish', tier: 1, quality: null, slot: null, level_required: 1, description: 'Striped and spiny-backed, bold enough to strike at anything that moves.' },
    { name: 'Burbot', type: 'food', subtype: 'raw_fish', tier: 1, quality: null, slot: null, level_required: 1, description: 'The only cod that ever forsook the sea. Ugly, cold-blooded, and best sought under winter ice.' },
    { name: 'Chalkarp', type: 'food', subtype: 'raw_fish', tier: 2, quality: null, slot: null, level_required: 1, description: 'A pale, heavy-bodied carp that noses the chalk beds at first light. Uncommonly fond of curd.' },
    { name: 'Pike', type: 'food', subtype: 'raw_fish', tier: 2, quality: null, slot: null, level_required: 1, description: 'All teeth and patience. The lake keeps nothing it has not permitted the pike to keep.' },
    { name: 'Frostgill', type: 'food', subtype: 'raw_fish', tier: 2, quality: null, slot: null, level_required: 1, description: 'Its gills carry a rime that will not melt in the hand. It rises only when the lake runs cold.' },

    // --- Dawncrest, saltwater ---
    { name: 'Whiting', type: 'food', subtype: 'raw_fish', tier: 1, quality: null, slot: null, level_required: 1, description: 'Plain, pale, and plentiful. This fish has fed more coastal families than any other.' },
    { name: 'Black Bream', type: 'food', subtype: 'raw_fish', tier: 1, quality: null, slot: null, level_required: 1, description: 'Deep-bodied and dark-flanked, drawn into the warm shallows of high summer.' },
    { name: 'Dawn Sprat', type: 'food', subtype: 'raw_fish', tier: 1, quality: null, slot: null, level_required: 1, description: 'A sliver of living silver. It shoals in the first grey hour and is gone by full light.' },
    { name: 'Garfish', type: 'food', subtype: 'raw_fish', tier: 1, quality: null, slot: null, level_required: 1, description: 'A green-boned needle of a fish. Startling to look at, and stranger still to clean.' },
    { name: 'John Dory', type: 'food', subtype: 'raw_fish', tier: 2, quality: null, slot: null, level_required: 1, description: 'A flat, mournful fish with a dark thumbprint on each flank. Slow, and far too easily caught.' },
    { name: 'Gurnard', type: 'food', subtype: 'raw_fish', tier: 2, quality: null, slot: null, level_required: 1, description: 'It walks the seabed on finger-like fins and grumbles aloud when landed. An honest oddity.' },
    { name: 'Conger Eel', type: 'food', subtype: 'raw_fish', tier: 2, quality: null, slot: null, level_required: 1, description: 'A great muscular rope of a fish that hunts the dark. Landing one is an argument, not a catch.' },
    { name: 'Duskfin', type: 'food', subtype: 'raw_fish', tier: 2, quality: null, slot: null, level_required: 1, description: 'Its fins hold the last colour of the day. No net has ever taken one, and no sun has ever seen one.' },
    { name: 'Wolffish', type: 'food', subtype: 'raw_fish', tier: 3, quality: null, slot: null, level_required: 1, description: 'Blunt-headed and crowded with crushing teeth, built for cold water and hard shells.' },
    { name: 'Stormer', type: 'food', subtype: 'raw_fish', tier: 3, quality: null, slot: null, level_required: 1, description: 'It runs the coast ahead of the autumn gales. The fishermen say it knows the weather before the sky does.' },
    { name: 'Sabreling', type: 'food', subtype: 'raw_fish', tier: 3, quality: null, slot: null, level_required: 1, description: 'A long curved blade of a fish that hunts the night tide. Handle it by the tail, never the flank.' },

    // --- Gear ---
    { name: 'Ambren Hook', type: 'material', subtype: 'hook', tier: 1, quality: null, slot: null, level_required: 1, description: 'A small barbed hook of Ambren, filed sharp and bent true. Useless alone, and essential all the same.' },
    { name: 'Ambren Fishing Rod', type: 'tool', subtype: 'fishing_rod', tier: 1, quality: null, slot: 'mainhand', level_required: 1, description: 'A supple Lanai pole, a length of linen line, and an Ambren hook. It asks only for patience.' },
    { name: 'Fishing Net', type: 'tool', subtype: 'fishing_net', tier: 1, quality: null, slot: 'mainhand', level_required: 1, description: 'A wide mesh of knotted linen on a plank frame. It takes the small and the many, never the great.' },
];

// XP per catch = ladder target at unlock x timer / 3600, gathering policy x1.0,
// unlock dip x1.10, rod base timer 70s. docs/xp-rebalance.md §8.
//   L1 2,200 xp/hr -> 43   L4 2,362 -> 46   L7 2,537 -> 49
//   L2 2,253       -> 44   L5 2,419 -> 47   L8 2,598 -> 51
//   L3 2,307       -> 45   L6 2,477 -> 48   L9 2,661 -> 52
//
// bait_value is what the fish CUTS INTO (services/fishing.ts, Cut Bait), kept
// deliberately low: at 20s per cut a fish must never buy back more casting time
// than it cost, or meat bait becomes free and self-sustaining forever.
const SPECIES: Array<{
    name: string; water: string; required_level: number; bait_category: string | null;
    time_window: string | null; window_exclusive: boolean;
    seasons: string | null; season_exclusive: boolean;
    min_weight_cw: number; max_weight_cw: number; xp: number; bait_value: number;
}> = [
    // Luxmere (freshwater). Steady and knowable: one seasonal exclusive, no window locks.
    { name: 'Tiddle', water: 'fresh', required_level: 1, bait_category: null, time_window: null, window_exclusive: false, seasons: null, season_exclusive: false, min_weight_cw: 5, max_weight_cw: 60, xp: 43, bait_value: 1 },
    { name: 'Brook Dace', water: 'fresh', required_level: 2, bait_category: 'grain', time_window: 'day', window_exclusive: false, seasons: null, season_exclusive: false, min_weight_cw: 10, max_weight_cw: 180, xp: 44, bait_value: 1 },
    { name: 'Perch', water: 'fresh', required_level: 3, bait_category: 'grain', time_window: null, window_exclusive: false, seasons: 'spring', season_exclusive: false, min_weight_cw: 20, max_weight_cw: 660, xp: 45, bait_value: 2 },
    { name: 'Burbot', water: 'fresh', required_level: 4, bait_category: 'meat', time_window: 'night', window_exclusive: false, seasons: 'winter', season_exclusive: false, min_weight_cw: 50, max_weight_cw: 2500, xp: 46, bait_value: 2 },
    { name: 'Chalkarp', water: 'fresh', required_level: 5, bait_category: 'cheese', time_window: 'dawn', window_exclusive: false, seasons: null, season_exclusive: false, min_weight_cw: 100, max_weight_cw: 6000, xp: 47, bait_value: 2 },
    { name: 'Pike', water: 'fresh', required_level: 7, bait_category: 'spawn', time_window: 'dusk', window_exclusive: false, seasons: null, season_exclusive: false, min_weight_cw: 100, max_weight_cw: 5500, xp: 49, bait_value: 3 },
    { name: 'Frostgill', water: 'fresh', required_level: 8, bait_category: 'egg', time_window: null, window_exclusive: false, seasons: 'winter', season_exclusive: true, min_weight_cw: 50, max_weight_cw: 1200, xp: 51, bait_value: 3 },

    // Dawncrest (saltwater). The moody water: three window locks, three seasonal gates.
    { name: 'Whiting', water: 'salt', required_level: 1, bait_category: 'meat', time_window: 'day', window_exclusive: false, seasons: null, season_exclusive: false, min_weight_cw: 20, max_weight_cw: 700, xp: 43, bait_value: 1 },
    { name: 'Black Bream', water: 'salt', required_level: 2, bait_category: 'grain', time_window: null, window_exclusive: false, seasons: 'summer', season_exclusive: false, min_weight_cw: 30, max_weight_cw: 650, xp: 44, bait_value: 1 },
    { name: 'Dawn Sprat', water: 'salt', required_level: 3, bait_category: null, time_window: 'dawn', window_exclusive: true, seasons: null, season_exclusive: false, min_weight_cw: 5, max_weight_cw: 40, xp: 45, bait_value: 2 },
    { name: 'Garfish', water: 'salt', required_level: 4, bait_category: 'meat', time_window: 'dawn', window_exclusive: false, seasons: 'spring,summer', season_exclusive: true, min_weight_cw: 20, max_weight_cw: 350, xp: 46, bait_value: 2 },
    { name: 'John Dory', water: 'salt', required_level: 5, bait_category: 'spawn', time_window: 'day', window_exclusive: false, seasons: null, season_exclusive: false, min_weight_cw: 50, max_weight_cw: 1200, xp: 47, bait_value: 2 },
    { name: 'Gurnard', water: 'salt', required_level: 6, bait_category: 'meat', time_window: 'day', window_exclusive: false, seasons: null, season_exclusive: false, min_weight_cw: 30, max_weight_cw: 1200, xp: 48, bait_value: 2 },
    { name: 'Conger Eel', water: 'salt', required_level: 6, bait_category: 'meat', time_window: 'night', window_exclusive: true, seasons: null, season_exclusive: false, min_weight_cw: 200, max_weight_cw: 13300, xp: 48, bait_value: 2 },
    { name: 'Duskfin', water: 'salt', required_level: 7, bait_category: 'egg', time_window: 'dusk', window_exclusive: true, seasons: null, season_exclusive: false, min_weight_cw: 80, max_weight_cw: 1800, xp: 49, bait_value: 3 },
    { name: 'Wolffish', water: 'salt', required_level: 8, bait_category: 'spawn', time_window: null, window_exclusive: false, seasons: 'autumn,winter', season_exclusive: true, min_weight_cw: 100, max_weight_cw: 5200, xp: 51, bait_value: 3 },
    { name: 'Stormer', water: 'salt', required_level: 9, bait_category: 'spawn', time_window: null, window_exclusive: false, seasons: 'autumn', season_exclusive: true, min_weight_cw: 300, max_weight_cw: 7000, xp: 52, bait_value: 3 },
    { name: 'Sabreling', water: 'salt', required_level: 9, bait_category: 'egg', time_window: 'night', window_exclusive: false, seasons: null, season_exclusive: false, min_weight_cw: 100, max_weight_cw: 2800, xp: 52, bait_value: 3 },
];

const LOCATION_BY_WATER: Record<string, string> = { fresh: 'Luxmere', salt: 'Dawncrest' };

// Bait the player converts DIRECTLY from the pack (instant, no action). Raw fish
// are deliberately absent: they reach the pouch only through the Cut Bait action,
// which costs 20s and pays XP. Frogspawn is the premium at 20, and it earns it:
// it is 4 weight out of Creekbank's 476, roughly one gather in 120.
const BAIT_VALUES = [
    { item_name: 'Grain', category: 'grain', bait_value: 1 },
    { item_name: 'Wild Grain', category: 'grain', bait_value: 1 },
    { item_name: 'Cheese', category: 'cheese', bait_value: 3 },
    { item_name: 'Egg', category: 'egg', bait_value: 4 },
    { item_name: 'Frogspawn', category: 'spawn', bait_value: 20 },
    { item_name: 'Rabbit Meat', category: 'meat', bait_value: 3 },
    { item_name: 'Chicken Meat', category: 'meat', bait_value: 3 },
    { item_name: 'Pheasant Meat', category: 'meat', bait_value: 3 },
    { item_name: 'Venison', category: 'meat', bait_value: 4 },
    { item_name: 'Pork', category: 'meat', bait_value: 4 },
    { item_name: 'Boar Meat', category: 'meat', bait_value: 4 },
    { item_name: 'Beef', category: 'meat', bait_value: 5 },
    { item_name: 'Sloth Meat', category: 'meat', bait_value: 5 },
];

export async function up(knex: Knex): Promise<void> {
    // ---- Schema ----------------------------------------------------------
    if (!(await knex.schema.hasTable('fish_species'))) {
        await knex.schema.createTable('fish_species', (t) => {
            t.increments('id').primary();
            t.string('name', 80).notNullable().unique();
            t.string('item_name', 80).notNullable();
            t.integer('location_id').unsigned().notNullable()
                .references('id').inTable('locations').onDelete('CASCADE');
            t.string('water', 10).notNullable();                  // 'fresh' | 'salt'
            t.integer('required_level').unsigned().notNullable().defaultTo(1);
            t.integer('base_weight').unsigned().notNullable().defaultTo(100);  // relative pick weight
            t.string('bait_category', 20).nullable();             // null = no affinity
            t.string('time_window', 10).nullable();               // 'window' is reserved SQL
            t.boolean('window_exclusive').notNullable().defaultTo(false);
            t.string('seasons', 40).nullable();                   // csv; null = year-round
            t.boolean('season_exclusive').notNullable().defaultTo(false);
            t.integer('min_weight_cw').unsigned().notNullable();  // centipounds
            t.integer('max_weight_cw').unsigned().notNullable();
            t.integer('xp').unsigned().notNullable();
            t.integer('bait_value').unsigned().notNullable().defaultTo(1);
            t.integer('display_order').unsigned().notNullable().defaultTo(0);
            t.boolean('is_active').notNullable().defaultTo(true);
            t.timestamps(true, true);
            t.index(['location_id', 'is_active']);
        });
    }

    if (!(await knex.schema.hasTable('bait_values'))) {
        await knex.schema.createTable('bait_values', (t) => {
            t.increments('id').primary();
            t.string('item_name', 80).notNullable().unique();
            t.string('category', 20).notNullable();
            t.integer('bait_value').unsigned().notNullable().defaultTo(1);
            t.timestamps(true, true);
        });
    }

    // The pouch. Bait MUST outlive the action: break down one Frogspawn worth 20,
    // catch three fish, log off, and 17 has to still be there on return.
    if (!(await knex.schema.hasTable('player_bait'))) {
        await knex.schema.createTable('player_bait', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.string('category', 20).notNullable();
            t.integer('amount').unsigned().notNullable().defaultTo(0);
            t.timestamps(true, true);
            t.unique(['player_id', 'category']);
        });
    }

    // Heaviest AND lightest from day one. Two columns are free, and the Trophy
    // Wall wants "smallest Tiddle ever landed" as much as it wants the monsters.
    if (!(await knex.schema.hasTable('player_fishing_records'))) {
        await knex.schema.createTable('player_fishing_records', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.string('species', 80).notNullable();
            t.integer('heaviest_cw').unsigned().notNullable();
            t.integer('lightest_cw').unsigned().notNullable();
            t.integer('catches').unsigned().notNullable().defaultTo(0);
            t.timestamps(true, true);
            t.unique(['player_id', 'species']);
        });
    }

    if (!(await knex.schema.hasTable('player_fishing_discoveries'))) {
        await knex.schema.createTable('player_fishing_discoveries', (t) => {
            t.increments('id').primary();
            t.integer('player_id').unsigned().notNullable()
                .references('id').inTable('players').onDelete('CASCADE');
            t.string('species', 80).notNullable();
            t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
            t.unique(['player_id', 'species']);
        });
    }

    // ---- Items -----------------------------------------------------------
    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first();
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert(item);
    }

    // ---- Species ---------------------------------------------------------
    const locationIds: Record<string, number> = {};
    for (const [water, locationName] of Object.entries(LOCATION_BY_WATER)) {
        const location = await knex('locations').where({ name: locationName }).first();
        if (!location) {
            throw new Error(`create_fishing_tables_and_content: location '${locationName}' not found`);
        }
        locationIds[water] = location.id;
    }

    let order = 0;
    for (const species of SPECIES) {
        const item = await knex('items').where({ name: species.name }).first();
        if (!item) {
            throw new Error(`create_fishing_tables_and_content: fish item '${species.name}' not found`);
        }
        const row = {
            name: species.name,
            item_name: species.name,
            location_id: locationIds[species.water],
            water: species.water,
            required_level: species.required_level,
            base_weight: 100,
            bait_category: species.bait_category,
            time_window: species.time_window,
            window_exclusive: species.window_exclusive,
            seasons: species.seasons,
            season_exclusive: species.season_exclusive,
            min_weight_cw: species.min_weight_cw,
            max_weight_cw: species.max_weight_cw,
            xp: species.xp,
            bait_value: species.bait_value,
            display_order: order++,
            is_active: true,
        };
        const existing = await knex('fish_species').where({ name: species.name }).first();
        if (existing) await knex('fish_species').where({ id: existing.id }).update(row);
        else await knex('fish_species').insert(row);
    }

    // ---- Bait values -----------------------------------------------------
    for (const bait of BAIT_VALUES) {
        const item = await knex('items').where({ name: bait.item_name }).first();
        if (!item) {
            throw new Error(`create_fishing_tables_and_content: bait item '${bait.item_name}' not found`);
        }
        const existing = await knex('bait_values').where({ item_name: bait.item_name }).first();
        if (existing) await knex('bait_values').where({ id: existing.id }).update(bait);
        else await knex('bait_values').insert(bait);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('player_fishing_discoveries');
    await knex.schema.dropTableIfExists('player_fishing_records');
    await knex.schema.dropTableIfExists('player_bait');
    await knex.schema.dropTableIfExists('bait_values');
    await knex.schema.dropTableIfExists('fish_species');
    await knex('items').whereIn('name', ITEMS.map((i) => i.name)).delete();
}
