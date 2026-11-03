import type { Knex } from 'knex';

// The Chronicle (docs/chronicle-spec.md): Wenna Halloway's daily tidings at the
// Salty Sloth. Every table the feature needs is created here, so later steps
// add rows and code but no schema. Step 1 only writes chronicle_deeds; pages,
// verses, the tavern and ballads come with later steps.
//
//   chronicle_deed_kinds   CONTENT. One row per kind of deed: which section of a
//                          page it belongs to and how much it weighs (§5, §6).
//   chronicle_deeds        STATE. The journal: one row per remarkable thing,
//                          stamped with the game day it happened (§4).
//   chronicle_verses       CONTENT. Verse templates (§8). Filled in step 2.
//   chronicle_verse_uses   STATE. Which verse was sung on which day (§8).
//   chronicle_days         STATE. One row per finished page (§12).
//   chronicle_lines        STATE. A page's lines, frozen at composition.
//   chronicle_mentions     STATE. Who a line names, for "days I was named".
//   chronicle_ballads      STATE. Guild ballads, commissioned and sung (§9).
//   chronicle_settings     Per-server dials (prices, caps, thresholds).
//   taverns                CONTENT. A tavern and its bard (§2). Row in step 3.
//
// Also: news_posts.chronicle_line (Wenna's line for an update, §7) and
// player_settings.chronicle_opt_out (§11).

interface Kind { key: string; section: string; base_weight: number; max_per_page: number | null; label: string }

// §5. Weights are knobs, tuned from the admin panel once real deeds exist.
const KINDS: Kind[] = [
    // Finds and craft
    { key: 'drop_rare',          section: 'island', base_weight: 10, max_per_page: null, label: 'Rare find' },
    { key: 'cryptid',            section: 'island', base_weight: 60, max_per_page: null, label: 'Cryptid find' },
    { key: 'world_first_item',   section: 'island', base_weight: 80, max_per_page: null, label: 'First in Talaran to find an item' },
    { key: 'trophy',             section: 'island', base_weight: 25, max_per_page: null, label: 'Trophy' },
    { key: 'record_fish',        section: 'island', base_weight: 15, max_per_page: null, label: 'Heaviest fish of its kind' },
    // Progress
    { key: 'server_first_level', section: 'island', base_weight: 70, max_per_page: null, label: 'First on the island to a level' },
    { key: 'level_milestone',    section: 'island', base_weight: 6,  max_per_page: null, label: 'Milestone level (50, 75, 90)' },
    { key: 'level_max',          section: 'island', base_weight: 90, max_per_page: null, label: 'Mastery (level 100)' },
    { key: 'total_level_mark',   section: 'island', base_weight: 15, max_per_page: null, label: 'Total level mark (each 250)' },
    { key: 'newcomers',          section: 'island', base_weight: 3,  max_per_page: 1,    label: 'Newcomers (rolled up)' },
    { key: 'guest_claimed',      section: 'island', base_weight: 4,  max_per_page: 1,    label: 'Guest claimed a character (rolled up)' },
    // Fighting
    { key: 'first_kill',         section: 'island', base_weight: 50, max_per_page: null, label: 'First on the island to kill a creature' },
    { key: 'strong_kill',        section: 'island', base_weight: 12, max_per_page: null, label: 'Beat a creature above their level' },
    { key: 'bestiary_mark',      section: 'island', base_weight: 15, max_per_page: null, label: '250th or 1,000th kill of a creature' },
    { key: 'death',              section: 'fallen', base_weight: 5,  max_per_page: 2,    label: 'A death worth telling' },
    // The world
    { key: 'museum_first_give',  section: 'island', base_weight: 12, max_per_page: null, label: 'First to give an item to a museum' },
    { key: 'exhibit_complete',   section: 'island', base_weight: 45, max_per_page: null, label: 'Museum exhibit completed' },
    { key: 'event_winner',       section: 'island', base_weight: 20, max_per_page: null, label: 'Top player at an event' },
    { key: 'event_winner_guild', section: 'guilds', base_weight: 20, max_per_page: null, label: 'Top guild at an event' },
    { key: 'merchant_arrived',   section: 'island', base_weight: 8,  max_per_page: 1,    label: 'Travelling merchant arrived' },
    // Homestead and trade
    { key: 'mount_raised',       section: 'island', base_weight: 15, max_per_page: null, label: 'Mount raised' },
    { key: 'field_twenty',       section: 'island', base_weight: 15, max_per_page: null, label: 'Twentieth field' },
    // Guilds
    { key: 'guild_founded',      section: 'guilds', base_weight: 10, max_per_page: null, label: 'Guild founded' },
    { key: 'guild_hall_tier',    section: 'guilds', base_weight: 35, max_per_page: null, label: 'Guild hall tier finished' },
];

const SETTINGS: Record<string, unknown> = {
    ballad_price: 10000,            // §9 (Nathan, 2026-11-03)
    ballad_cooldown_days: 7,
    headline_threshold: 60,         // §6: a score above this may lead the page
    headline_max: 2,
    island_lines: 8,                // §3: Around the island
    guild_lines: 3,
    fallen_lines: 2,
    roll_max: 40,
    deed_keep_days: 30,             // §10: journal rows older than this are trimmed
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('chronicle_deed_kinds'))) {
        await knex.schema.createTable('chronicle_deed_kinds', (t) => {
            t.string('key', 40).primary();
            t.string('section', 20).notNullable();
            t.float('base_weight').notNullable().defaultTo(1);
            t.integer('max_per_page').nullable();
            t.boolean('enabled').notNullable().defaultTo(true);
            t.string('label', 120).notNullable();
        });
    }

    if (!(await knex.schema.hasTable('chronicle_deeds'))) {
        await knex.schema.createTable('chronicle_deeds', (t) => {
            t.bigIncrements('id').primary();
            t.string('day_key', 10).notNullable();
            t.string('kind', 40).notNullable();
            // SET NULL, not CASCADE: a sung deed outlives a swept account. The
            // page already holds the name as it was.
            t.integer('player_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.integer('guild_id').nullable().references('id').inTable('guilds').onDelete('SET NULL');
            t.string('subject', 200).nullable();
            t.jsonb('data').notNullable().defaultTo('{}');
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['day_key']);
            t.index(['player_id', 'day_key']);
        });
    }

    if (!(await knex.schema.hasTable('chronicle_verses'))) {
        await knex.schema.createTable('chronicle_verses', (t) => {
            t.increments('id').primary();
            t.string('kind', 60).notNullable();
            t.text('text').notNullable();
            t.integer('min_n').nullable();
            t.integer('max_n').nullable();
            t.specificType('needs', 'text[]').notNullable().defaultTo('{}');
            t.boolean('enabled').notNullable().defaultTo(true);
            t.timestamp('added_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['kind']);
        });
    }

    if (!(await knex.schema.hasTable('chronicle_verse_uses'))) {
        await knex.schema.createTable('chronicle_verse_uses', (t) => {
            t.increments('id').primary();
            t.integer('verse_id').notNullable().references('id').inTable('chronicle_verses').onDelete('CASCADE');
            t.string('day_key', 10).notNullable();
            t.string('text_hash', 64).notNullable();
            t.index(['verse_id', 'day_key']);
        });
    }

    if (!(await knex.schema.hasTable('chronicle_days'))) {
        await knex.schema.createTable('chronicle_days', (t) => {
            t.string('day_key', 10).primary();
            t.string('status', 12).notNullable().defaultTo('composing');
            t.timestamp('composed_at', { useTz: true }).nullable();
            t.text('headline').nullable();
            t.boolean('quiet').notNullable().defaultTo(false);
        });
    }

    if (!(await knex.schema.hasTable('chronicle_lines'))) {
        await knex.schema.createTable('chronicle_lines', (t) => {
            t.increments('id').primary();
            t.string('day_key', 10).notNullable().references('day_key').inTable('chronicle_days').onDelete('CASCADE');
            t.string('section', 20).notNullable();
            t.integer('position').notNullable();
            t.text('text').notNullable();
            t.string('deed_kind', 60).nullable();
            t.timestamp('struck_at', { useTz: true }).nullable();
            t.integer('struck_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.index(['day_key', 'position']);
        });
    }

    if (!(await knex.schema.hasTable('chronicle_mentions'))) {
        await knex.schema.createTable('chronicle_mentions', (t) => {
            t.increments('id').primary();
            t.string('day_key', 10).notNullable().references('day_key').inTable('chronicle_days').onDelete('CASCADE');
            t.integer('line_id').nullable().references('id').inTable('chronicle_lines').onDelete('CASCADE');
            t.integer('player_id').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.integer('guild_id').nullable().references('id').inTable('guilds').onDelete('SET NULL');
            t.boolean('in_lines').notNullable().defaultTo(false);
            t.index(['player_id']);
            t.index(['guild_id']);
        });
    }

    if (!(await knex.schema.hasTable('chronicle_ballads'))) {
        await knex.schema.createTable('chronicle_ballads', (t) => {
            t.increments('id').primary();
            t.integer('guild_id').nullable().references('id').inTable('guilds').onDelete('SET NULL');
            t.integer('commissioned_by').nullable().references('id').inTable('players').onDelete('SET NULL');
            t.integer('paid_gold').notNullable();
            t.string('paid_from', 12).notNullable();   // 'storehouse' | 'purse'
            t.string('day_key_sung', 10).nullable();
            t.text('text').nullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.index(['guild_id', 'created_at']);
        });
    }

    if (!(await knex.schema.hasTable('chronicle_settings'))) {
        await knex.schema.createTable('chronicle_settings', (t) => {
            t.string('key', 60).primary();
            t.jsonb('value').notNullable();
        });
    }

    if (!(await knex.schema.hasTable('taverns'))) {
        await knex.schema.createTable('taverns', (t) => {
            t.increments('id').primary();
            t.integer('location_id').notNullable().references('id').inTable('locations').onDelete('CASCADE');
            t.string('name', 100).notNullable().unique();
            t.text('description').nullable();
            t.integer('bard_npc_id').nullable().references('id').inTable('npcs').onDelete('SET NULL');
        });
    }

    if (!(await knex.schema.hasColumn('news_posts', 'chronicle_line'))) {
        await knex.schema.alterTable('news_posts', (t) => { t.text('chronicle_line').nullable(); });
    }
    if (!(await knex.schema.hasColumn('player_settings', 'chronicle_opt_out'))) {
        await knex.schema.alterTable('player_settings', (t) => { t.boolean('chronicle_opt_out').notNullable().defaultTo(false); });
    }

    // The kinds and dials are the Chronicle's own rows, not lookups of other
    // content, so they go in on a fresh database too. Upsert by key, so a
    // weight tuned in the admin panel is not reset by re-running this.
    for (const k of KINDS) {
        await knex('chronicle_deed_kinds').insert({ ...k, enabled: true }).onConflict('key').ignore();
    }
    for (const [key, value] of Object.entries(SETTINGS)) {
        await knex('chronicle_settings').insert({ key, value: JSON.stringify(value) }).onConflict('key').ignore();
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_settings', 'chronicle_opt_out')) {
        await knex.schema.alterTable('player_settings', (t) => { t.dropColumn('chronicle_opt_out'); });
    }
    if (await knex.schema.hasColumn('news_posts', 'chronicle_line')) {
        await knex.schema.alterTable('news_posts', (t) => { t.dropColumn('chronicle_line'); });
    }
    for (const table of [
        'taverns', 'chronicle_settings', 'chronicle_ballads', 'chronicle_mentions', 'chronicle_lines',
        'chronicle_days', 'chronicle_verse_uses', 'chronicle_verses', 'chronicle_deeds', 'chronicle_deed_kinds',
    ]) {
        await knex.schema.dropTableIfExists(table);
    }
}
