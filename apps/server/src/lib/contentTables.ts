// Shared registry of tables exposed in the admin panel, and the single source of
// truth for which of them are content.
//
// DB-first content model: the database is canonical for content rows; the repo
// holds exported JSON snapshots (content-snapshots/) for diffability, disaster
// recovery, and syncing a local dev DB. Migrations remain the tool for SCHEMA.
// Run `npm run content:export` after meaningful content work and commit the
// snapshot alongside code changes.
//
// ---------------------------------------------------------------------------
// WHY `snapshot` AND `editable` ARE SEPARATE FLAGS
//
// They used to be one (`stateOnly`), which meant a table was either "content:
// editable and snapshotted" or "state: neither". Adding the player tables broke
// that, because those must be editable and must NEVER be snapshotted.
//
// `snapshot` is OPT-IN, and that direction is deliberate. Forget it on a content
// table and your content stops syncing: annoying, obvious, harmless. Get it
// wrong the other way and `content:import` writes dev player accounts over live
// ones, quietly, inside a transaction that reports success. One failure mode
// costs an afternoon; the other costs the game.
// ---------------------------------------------------------------------------

export interface ContentTableMeta {
    label: string;
    group: string;
    /** Included in content snapshots. TRUE ONLY for authored content. */
    snapshot?: boolean;
    /** Cell edits permitted at all. */
    editable?: boolean;
    /** Columns never sent to the client, for anyone, in any response. */
    secretColumns?: string[];
}

// CONTENT is listed in FK-dependency order: parents before children. Import
// replays this order forward, so anything referencing another content table by
// id (npc_dialogues->npcs, foraging_habitats/fish_species->locations,
// trap_targets->trap_types/locations, quest_objectives->quests) comes after its
// parent. State and system tables are never imported, so their order is
// cosmetic and they are grouped for browsing instead.
export const CONTENT_TABLES: Record<string, ContentTableMeta> = {
    // ---- Authored content: editable AND snapshotted ----
    skills:                      { label: 'Skills',                group: 'Core',       snapshot: true, editable: true },
    items:                       { label: 'Items',                 group: 'Core',       snapshot: true, editable: true },
    locations:                   { label: 'Locations',             group: 'World',      snapshot: true, editable: true },
    location_connections:        { label: 'Location Connections',  group: 'World',      snapshot: true, editable: true },
    npcs:                        { label: 'NPCs',                  group: 'World',      snapshot: true, editable: true },
    npc_dialogues:               { label: 'NPC Dialogues',         group: 'World',      snapshot: true, editable: true },
    resource_nodes:              { label: 'Resource Nodes',        group: 'Gathering',  snapshot: true, editable: true },
    foraging_habitats:           { label: 'Foraging Habitats',     group: 'Gathering',  snapshot: true, editable: true },
    fish_species:                { label: 'Fish Species',          group: 'Fishing',    snapshot: true, editable: true },
    bait_values:                 { label: 'Bait Values',           group: 'Fishing',    snapshot: true, editable: true },
    huntable_animals:            { label: 'Huntable Animals',      group: 'Hunting',    snapshot: true, editable: true },
    trap_types:                  { label: 'Trap Types',            group: 'Hunting',    snapshot: true, editable: true },
    trap_targets:                { label: 'Trap Targets',          group: 'Hunting',    snapshot: true, editable: true },
    animal_species:              { label: 'Animal Species',        group: 'Husbandry',  snapshot: true, editable: true },
    crops:                       { label: 'Crops',                 group: 'Farming',    snapshot: true, editable: true },
    recipes:                     { label: 'Recipes',               group: 'Crafting',   snapshot: true, editable: true },
    drop_table_entries:          { label: 'Drop Table Entries',    group: 'Drops',      snapshot: true, editable: true },
    quests:                      { label: 'Quests',                group: 'Quests',     snapshot: true, editable: true },
    quest_objectives:            { label: 'Quest Objectives',      group: 'Quests',     snapshot: true, editable: true },

    // ---- World state: browse only, never snapshotted ----
    workstations:                { label: 'Workstations',          group: 'World State' },
    ore_veins:                   { label: 'Ore Veins',             group: 'World State' },
    ground_items:                { label: 'Ground Items',          group: 'World State' },
    kiln_jobs:                   { label: 'Kiln Jobs',             group: 'World State' },
    tanning_jobs:                { label: 'Tanning Jobs',          group: 'World State' },

    // ---- Accounts ----
    // password_hash is never rendered. email deliberately IS: fixing an address
    // for someone locked out of their own is a real support job.
    players:                     { label: 'Players',               group: 'Accounts',   editable: true, secretColumns: ['password_hash'] },
    player_settings:             { label: 'Player Settings',       group: 'Accounts',   editable: true },
    player_palettes:             { label: 'Player Palettes',       group: 'Accounts',   editable: true },
    player_hints:                { label: 'Player Hints',          group: 'Accounts',   editable: true },

    // ---- Player progress ----
    player_skills:               { label: 'Player Skills',         group: 'Progress',   editable: true },
    player_stats:                { label: 'Player Stats',          group: 'Progress',   editable: true },
    player_unlocks:              { label: 'Player Unlocks',        group: 'Progress',   editable: true },
    player_exploration:          { label: 'Player Exploration',    group: 'Progress',   editable: true },
    player_quests:               { label: 'Player Quests',         group: 'Progress',   editable: true },
    player_quest_objectives:     { label: 'Player Quest Progress', group: 'Progress',   editable: true },
    skill_snapshots:             { label: 'Skill Snapshots',       group: 'Progress' },

    // ---- Player holdings ----
    player_inventory:            { label: 'Player Inventory',      group: 'Holdings',   editable: true },
    player_equipment:            { label: 'Player Equipment',      group: 'Holdings',   editable: true },
    player_liquids:              { label: 'Player Liquids',        group: 'Holdings',   editable: true },
    player_bait:                 { label: 'Player Bait',           group: 'Holdings',   editable: true },
    property_storage:            { label: 'Property Storage',      group: 'Holdings',   editable: true },

    // ---- Player activity ----
    player_actions:              { label: 'Player Actions',        group: 'Activity',   editable: true },
    player_properties:           { label: 'Player Properties',     group: 'Activity',   editable: true },
    farm_plots:                  { label: 'Farm Plots',            group: 'Activity',   editable: true },
    player_pens:                 { label: 'Player Pens',           group: 'Activity',   editable: true },
    player_animals:              { label: 'Player Animals',        group: 'Activity',   editable: true },
    player_traps:                { label: 'Player Traps',          group: 'Activity',   editable: true },
    tally_boards:                { label: 'Tally Boards',          group: 'Activity',   editable: true },

    // ---- Records ----
    player_fishing_records:      { label: 'Fishing Records',       group: 'Records',    editable: true },
    player_fishing_discoveries:  { label: 'Fishing Discoveries',   group: 'Records',    editable: true },
    player_foraging_discoveries: { label: 'Foraging Discoveries',  group: 'Records',    editable: true },
    player_item_firsts:          { label: 'Player Item Firsts',    group: 'Records',    editable: true },
    item_firsts:                 { label: 'Server Item Firsts',    group: 'Records',    editable: true },
    loot_log_sources:            { label: 'Loot Log Sources',      group: 'Records' },
    loot_log_entries:            { label: 'Loot Log Entries',      group: 'Records' },
    travel_log:                  { label: 'Travel Log',            group: 'Records' },

    // ---- Economy ----
    // The ledger is editable because adjusting a balance is a support need.
    // Purchases and trades are history: hand-editing them corrupts the very
    // record they exist to be, so they are readable and nothing more.
    taler_ledger:                { label: 'Taler Ledger',          group: 'Economy',    editable: true },
    taler_purchases:             { label: 'Taler Purchases',       group: 'Economy' },
    trades:                      { label: 'Trades',                group: 'Economy' },
    trade_offers:                { label: 'Trade Offers',          group: 'Economy' },
    trade_gold:                  { label: 'Trade Gold',            group: 'Economy' },

    // ---- Social ----
    guilds:                      { label: 'Guilds',                group: 'Social',     editable: true },
    guild_members:               { label: 'Guild Members',         group: 'Social',     editable: true },
    guild_invites:               { label: 'Guild Invites',         group: 'Social' },
    guild_applications:          { label: 'Guild Applications',    group: 'Social' },
    forum_categories:            { label: 'Forum Categories',      group: 'Social',     editable: true },
    forum_threads:               { label: 'Forum Threads',         group: 'Social' },
    forum_posts:                 { label: 'Forum Posts',           group: 'Social' },
    forum_polls:                 { label: 'Forum Polls',           group: 'Social' },
    forum_poll_options:          { label: 'Forum Poll Options',    group: 'Social' },
    forum_poll_votes:            { label: 'Forum Poll Votes',      group: 'Social' },
    forum_post_votes:            { label: 'Forum Post Votes',      group: 'Social' },
    guild_forum_categories:      { label: 'Guild Forum Categories', group: 'Social',    editable: true },
    guild_forum_threads:         { label: 'Guild Forum Threads',   group: 'Social' },
    guild_forum_posts:           { label: 'Guild Forum Posts',     group: 'Social' },
    chat_messages:               { label: 'Chat Messages',         group: 'Social' },
    messages:                    { label: 'Private Messages',      group: 'Social' },
    news_posts:                  { label: 'News Posts',            group: 'Social',     editable: true },

    // ---- Moderation and audit ----
    mod_permissions:             { label: 'Mod Permissions',       group: 'Moderation', editable: true },
    mutes:                       { label: 'Mutes',                 group: 'Moderation', editable: true },
    warnings:                    { label: 'Warnings',              group: 'Moderation', editable: true },
    content_changes:             { label: 'Content Change Log',    group: 'Moderation' },
    // Edited through its own richer editor in routes/adminManual.ts. Listed here
    // read-only so it is visible when browsing, without giving two editors one row.
    manual_pages:                { label: 'Manual Pages',          group: 'Moderation' },
};

/** Tables included in content snapshots, in FK-dependency order. */
export const SNAPSHOT_TABLES: string[] = Object.entries(CONTENT_TABLES)
    .filter(([, meta]) => meta.snapshot === true)
    .map(([name]) => name);

/** Columns that must never leave the server, whatever the table. */
export function secretColumns(table: string): string[] {
    return CONTENT_TABLES[table]?.secretColumns ?? [];
}

export function isSecretColumn(table: string, column: string): boolean {
    return secretColumns(table).includes(column);
}

// --- Editability: blacklist model within an editable table -----------------
// A table must opt in via `editable`. Within one, everything is editable EXCEPT:
//  - primary keys, timestamps
//  - 'name' columns: they are upsert keys for migrations and cross-referenced
//    by name elsewhere (recipes.inputs itemName, quests.npc_name, ...)
//  - foreign-key id columns: re-pointing a relation deserves more ceremony than
//    a cell edit. This matters more on the player tables than the content ones:
//    moving player_inventory.item_id would silently transmute someone's item.
//  - secret columns.
export const GLOBAL_COLUMN_BLACKLIST = new Set(['id', 'name', 'created_at', 'updated_at']);

export function isEditableColumn(table: string, column: string): boolean {
    const meta = CONTENT_TABLES[table];
    if (!meta || !meta.editable) return false;
    if (GLOBAL_COLUMN_BLACKLIST.has(column)) return false;
    if (column.endsWith('_id')) return false;
    if (isSecretColumn(table, column)) return false;
    return true;
}
