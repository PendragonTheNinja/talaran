import type { Knex } from 'knex';

// World Events (docs/WORLD-EVENTS-AND-MUSEUMS.md).
//
//   world_event_types     the roster: every kind of event that can happen, with
//                         its rarity, length, pool and wording. Data, so the
//                         admin panel can tune it and add to it.
//   world_event_settings  one row: the scheduler's dials.
//   world_events          every event that has happened or is happening.
//
// What a kind DOES (a skill boost now; the travelling merchant and invasions
// later) is code in services/worldEvents.ts. Everything a person might want to
// adjust is here.

const ROSTER = [
    // Gathering
    { key: 'bountiful_shoal', name: 'Bountiful Shoal', skill: 'Fishing', rarity: 'common',
      start: 'A bountiful shoal has come into {location}. Fishing there earns a quarter more experience while it lasts.' },
    { key: 'windthrow', name: 'Windthrow', skill: 'Woodcutting', rarity: 'common',
      start: 'A windthrow has brought trees down across {location}. Woodcutting there earns a quarter more experience while it lasts.' },
    { key: 'rich_seam', name: 'Rich Seam', skill: 'Mining', rarity: 'common',
      start: 'Miners at {location} have struck a rich seam. Mining there earns a quarter more experience while it lasts.' },
    { key: 'wild_bloom', name: 'Wild Bloom', skill: 'Foraging', rarity: 'common',
      start: 'The hedgerows around {location} are in wild bloom. Foraging there earns a quarter more experience while it lasts.' },
    { key: 'herd_passes', name: 'The Herd Passes', skill: 'Hunting', rarity: 'uncommon',
      start: 'A great herd is passing through {location}. Hunting and trapping there earn a quarter more experience while it lasts.' },
    // Novita, where every farm and pen is
    { key: 'fair_growing', name: 'Fair Growing Weather', skill: 'Farming', rarity: 'uncommon',
      start: 'Fair growing weather has settled over {location}. Farming there earns a quarter more experience while it lasts.' },
    { key: 'good_grazing', name: 'Good Grazing', skill: 'Husbandry', rarity: 'uncommon',
      start: 'The grazing is good at {location}. Husbandry there earns a quarter more experience while it lasts.' },
    // Processing: rare, because processing can be stockpiled for
    { key: 'master_smith', name: 'Master Smith Visiting', skill: 'Smithing', rarity: 'rare',
      start: 'A master smith is visiting {location}. Smithing there earns a quarter more experience while they stay.' },
    { key: 'joiners_fair', name: "Joiners' Fair", skill: 'Carpentry', rarity: 'rare',
      start: "A joiners' fair has opened at {location}. Carpentry there earns a quarter more experience while it runs." },
    { key: 'craftsfolk_gathering', name: 'Craftsfolk Gathering', skill: 'Crafting', rarity: 'rare',
      start: 'Craftsfolk have gathered at {location}. Crafting there earns a quarter more experience while they stay.' },
    { key: 'feast_day', name: 'Feast Day', skill: 'Cooking', rarity: 'rare',
      start: 'It is a feast day at {location}. Cooking there earns a quarter more experience while it lasts.' },
];

/** Rarer events are picked less often and last longer (design doc, Rarity). */
const RARITY: Record<string, { weight: number; minMin: number; maxMin: number; minPool: number; maxPool: number }> = {
    common:   { weight: 6, minMin: 60,  maxMin: 120, minPool: 300, maxPool: 500 },
    uncommon: { weight: 3, minMin: 90,  maxMin: 150, minPool: 200, maxPool: 300 },
    rare:     { weight: 1, minMin: 120, maxMin: 180, minPool: 100, maxPool: 200 },
};

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('world_event_types', (t) => {
        t.increments('id').primary();
        t.string('key', 60).notNullable().unique();
        t.string('name', 100).notNullable();
        // What the event does: 'skill' (an XP boost at a place). Later kinds
        // (the travelling merchant, invasions) are added in code.
        t.string('kind', 30).notNullable().defaultTo('skill');
        t.string('skill', 60).nullable();
        t.string('rarity', 20).notNullable().defaultTo('common');
        t.integer('weight').notNullable().defaultTo(1);
        t.integer('min_minutes').notNullable();
        t.integer('max_minutes').notNullable();
        t.integer('min_pool').notNullable();
        t.integer('max_pool').notNullable();
        t.decimal('xp_multiplier', 4, 2).notNullable().defaultTo(1.25);
        // Where it may happen. Empty means "wherever that skill's work is"
        // (services/worldEvents.ts eligibleLocations); set it to pin a type to
        // particular places.
        t.specificType('location_ids', 'integer[]').notNullable().defaultTo('{}');
        t.integer('cooldown_minutes').notNullable().defaultTo(360);
        // The chat line when it starts; {location} is filled in.
        t.text('start_text').notNullable();
        t.boolean('is_active').notNullable().defaultTo(true);
        t.integer('display_order').notNullable().defaultTo(0);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`ALTER TABLE world_event_types ADD CONSTRAINT world_event_types_ranges CHECK (
        weight >= 0 AND min_minutes > 0 AND max_minutes >= min_minutes
        AND min_pool > 0 AND max_pool >= min_pool AND xp_multiplier >= 1 AND cooldown_minutes >= 0)`);

    await knex.schema.createTable('world_event_settings', (t) => {
        t.integer('id').primary();
        t.boolean('scheduler_enabled').notNullable().defaultTo(true);
        // One new event every this-many minutes on average, across all types.
        t.integer('average_gap_minutes').notNullable().defaultTo(180);
        t.integer('max_concurrent').notNullable().defaultTo(3);
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw('ALTER TABLE world_event_settings ADD CONSTRAINT world_event_settings_one_row CHECK (id = 1)');
    await knex('world_event_settings').insert({ id: 1 });

    await knex.schema.createTable('world_events', (t) => {
        t.increments('id').primary();
        t.integer('type_id').nullable().references('id').inTable('world_event_types').onDelete('SET NULL');
        t.string('name', 100).notNullable();
        t.string('kind', 30).notNullable();
        t.string('skill', 60).nullable();
        t.integer('location_id').nullable().references('id').inTable('locations').onDelete('SET NULL');
        t.decimal('xp_multiplier', 4, 2).notNullable().defaultTo(1.25);
        t.integer('pool_total').notNullable();
        t.integer('pool_left').notNullable();
        t.timestamp('starts_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('ends_at', { useTz: true }).notNullable();
        // Set when it ends: 'time', 'pool' or 'admin'.
        t.timestamp('ended_at', { useTz: true }).nullable();
        t.string('end_reason', 20).nullable();
        // Null when the scheduler started it; the admin's id otherwise.
        t.integer('started_by').nullable().references('id').inTable('players').onDelete('SET NULL');
        t.text('announcement').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.index(['ended_at']);
    });
    await knex.raw(`ALTER TABLE world_events ADD CONSTRAINT world_events_pool CHECK (pool_left >= 0 AND pool_left <= pool_total)`);

    // A server line with no author: event announcements are said by the world,
    // not by a player. player_id was NOT NULL, so every server line had to
    // borrow someone's id (the admin tool uses the admin's). Chat history reads
    // left-join players, so an authorless line already reads correctly.
    await knex.raw('ALTER TABLE chat_messages ALTER COLUMN player_id DROP NOT NULL');

    await knex('world_event_types').insert(ROSTER.map((r, i) => {
        const band = RARITY[r.rarity];
        return {
            key: r.key, name: r.name, kind: 'skill', skill: r.skill, rarity: r.rarity,
            weight: band.weight, min_minutes: band.minMin, max_minutes: band.maxMin,
            min_pool: band.minPool, max_pool: band.maxPool, start_text: r.start, display_order: i,
        };
    }));
}

export async function down(knex: Knex): Promise<void> {
    await knex('chat_messages').whereNull('player_id').delete();
    await knex.raw('ALTER TABLE chat_messages ALTER COLUMN player_id SET NOT NULL');
    await knex.schema.dropTableIfExists('world_events');
    await knex.schema.dropTableIfExists('world_event_settings');
    await knex.schema.dropTableIfExists('world_event_types');
}
