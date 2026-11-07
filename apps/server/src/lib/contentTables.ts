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
    // ---- Combat (docs/combat-spec.md §8) ----
    // Creatures, the places to fight them and which creature lives where.
    // creatures.xp_per_kill is derived (pnpm combat:derive), so edit the level
    // or xp_multiplier and re-run the script rather than typing a number.
    creatures:                   { label: 'Creatures',             group: 'Combat',     snapshot: true, editable: true },
    fighting_spots:              { label: 'Fighting Spots',        group: 'Combat',     snapshot: true, editable: true },
    fighting_spot_creatures:     { label: 'Fighting Spot Creatures', group: 'Combat',   snapshot: true, editable: true },
    // Guaranteed uses and the break chance after them, per tier (§13). Single
    // items differ through items.durability_uses / durability_break_pct.
    durability_tiers:            { label: 'Durability Tiers',      group: 'Combat',     snapshot: true, editable: true },
    recipes:                     { label: 'Recipes',               group: 'Crafting',   snapshot: true, editable: true },
    drop_table_entries:          { label: 'Drop Table Entries',    group: 'Drops',      snapshot: true, editable: true },
    quests:                      { label: 'Quests',                group: 'Quests',     snapshot: true, editable: true },
    quest_objectives:            { label: 'Quest Objectives',      group: 'Quests',     snapshot: true, editable: true },

    // ---- Feats ----
    // Authored content, so snapshotted: a new feat is a row, and adding one
    // should not need a migration. criterion_target must name a real
    // player_stats column or a real skill, and a typo there does not error, it
    // just makes the feat permanently unearnable.
    feats:                       { label: 'Feats',                 group: 'Feats',      snapshot: true, editable: true },

    // ---- Station slots and action text ----
    // Authored content that migrations created and filled but that was never
    // registered, so content:export left it out and a database rebuilt from the
    // repo had no workstation slots and no action text (audit M17). Merchants
    // are NOT here on purpose: seeds/08_merchants.ts is their declarative source
    // of truth, and a snapshot copy would compete with it.
    workstation_slot_types:      { label: 'Workstation Slot Types', group: 'Crafting',  snapshot: true, editable: true },
    action_presentation:         { label: 'Action Presentation',   group: 'Core',       snapshot: true, editable: true },

    // ---- World events ----
    // The roster is authored content (edited in the admin Events tab). The
    // scheduler's dials are per server and events themselves are state, so
    // neither is snapshotted.
    world_event_types:           { label: 'World Event Types',     group: 'Events',     snapshot: true, editable: true },
    world_event_settings:        { label: 'World Event Settings',  group: 'Events',     editable: true },
    world_events:                { label: 'World Events',          group: 'Events' },
    // The merchant's extras list is authored (items that can turn up in his
    // cart); what one visit carries is state.
    merchant_extra_goods:        { label: 'Merchant Extra Goods',  group: 'Events',     snapshot: true, editable: true },
    world_event_stock:           { label: 'Merchant Stock (visits)', group: 'Events' },

    // ---- Museums ----
    // Which museums exist, their exhibits and which item sits in which case
    // are authored content: moving or removing a case is an edit here.
    // Donations are state, and the plaques are read from them.
    museums:                     { label: 'Museums',               group: 'Museums',    snapshot: true, editable: true },
    museum_exhibits:             { label: 'Museum Exhibits',       group: 'Museums',    snapshot: true, editable: true },
    museum_cases:                { label: 'Museum Cases',          group: 'Museums',    snapshot: true, editable: true },
    museum_donations:            { label: 'Museum Donations',      group: 'Museums' },
    // A church and its writings (services/church.ts): authored lore.
    churches:                    { label: 'Churches',              group: 'World',      snapshot: true, editable: true },
    church_writings:             { label: 'Church Writings',       group: 'World',      snapshot: true, editable: true },
    // Spells (services/spells.ts): the rows; what each does is code.
    spells:                      { label: 'Spells',                group: 'Talar',      snapshot: true, editable: true },
    // What each guild hall tier needs (by item name) and what its storehouse holds.
    guild_hall_tiers:            { label: 'Guild Hall Tiers',      group: 'Guilds',     snapshot: true, editable: true },
    // The Chronicle (docs/chronicle-spec.md): what each kind of deed weighs, the
    // bard's verses and the tavern she keeps them in are authored; the journal,
    // the finished pages and the ballads are state.
    chronicle_deed_kinds:        { label: 'Chronicle Deed Kinds',  group: 'Chronicle',  snapshot: true, editable: true },
    chronicle_verses:            { label: 'Chronicle Verses',      group: 'Chronicle',  snapshot: true, editable: true },
    taverns:                     { label: 'Taverns',               group: 'Chronicle',  snapshot: true, editable: true },
    chronicle_settings:          { label: 'Chronicle Settings',    group: 'Chronicle',  editable: true },
    chronicle_deeds:             { label: 'Chronicle Deeds',       group: 'Chronicle' },
    chronicle_days:              { label: 'Chronicle Days',        group: 'Chronicle' },
    chronicle_lines:             { label: 'Chronicle Lines',       group: 'Chronicle' },
    chronicle_ballads:           { label: 'Chronicle Ballads',     group: 'Chronicle' },

    // ---- World state: browse only, never snapshotted ----
    workstations:                { label: 'Workstations',          group: 'World State' },
    ore_veins:                   { label: 'Ore Veins',             group: 'World State' },
    // Per-item totals of dropped stacks that expired unclaimed after a week
    // (services/groundItems.ts): what players do not think worth picking up.
    ground_item_despawns:        { label: 'Despawned Items',       group: 'World State' },
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

    // Earned feats and the world records. Editable so a wrongly granted feat
    // can be revoked and a donator badge can be handed out by hand. NEVER
    // snapshotted: these are per-player facts, and importing a dev snapshot
    // over live would hand everyone somebody else's achievements.
    // Uses since the last break, per player per item (services/durability.ts).
    // Editable so a test can be brought to the edge of a break.
    player_item_wear:            { label: 'Player Item Wear',      group: 'Progress',   editable: true },
    // Kills per creature, which is what the Bestiary reveals by (services/bestiary.ts).
    player_creature_kills:       { label: 'Player Creature Kills', group: 'Progress',   editable: true },
    player_feats:                { label: 'Player Feats',          group: 'Progress',   editable: true },
    // item_firsts is already registered under Records further down.
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
    skill_milestone_firsts:      { label: 'Milestone Records',     group: 'Records',    editable: true },
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
    // The Town Crier's polls (services/crierPolls.ts). Written in the Polls
    // tab, not here; responses and the chit ledger are the record.
    crier_polls:                 { label: 'Crier Polls',           group: 'Social' },
    crier_poll_questions:        { label: 'Crier Poll Questions',  group: 'Social' },
    crier_poll_options:          { label: 'Crier Poll Options',    group: 'Social' },
    crier_poll_responses:        { label: 'Crier Poll Responses',  group: 'Social' },
    crier_poll_answers:          { label: 'Crier Poll Answers',    group: 'Social' },
    crier_poll_dismissals:       { label: 'Crier Poll Dismissals', group: 'Social' },
    crier_chit_ledger:           { label: "Crier's Chit Ledger",   group: 'Social' },
    guild_forum_categories:      { label: 'Guild Forum Categories', group: 'Social',    editable: true },
    guild_forum_threads:         { label: 'Guild Forum Threads',   group: 'Social' },
    guild_forum_posts:           { label: 'Guild Forum Posts',     group: 'Social' },
    chat_messages:               { label: 'Chat Messages',         group: 'Social' },
    messages:                    { label: 'Private Messages',      group: 'Social' },
    news_posts:                  { label: 'News Posts',            group: 'Social',     editable: true },
    // The language filter (services/wordFilter.ts). The list is content: edit
    // words here; the game picks changes up within a minute.
    filter_words:                { label: 'Filter Words',          group: 'Moderation', snapshot: true, editable: true },
    filter_substitutes:          { label: 'Filter Substitutes',    group: 'Moderation', snapshot: true, editable: true },
    filter_allow:                { label: 'Filter Allowed Words',  group: 'Moderation', snapshot: true, editable: true },
    filter_flags:                { label: 'Filter Flags',          group: 'Moderation', editable: true },

    // ---- Moderation and audit ----
    mod_permissions:             { label: 'Mod Permissions',       group: 'Moderation', editable: true },
    mutes:                       { label: 'Mutes',                 group: 'Moderation', editable: true },
    warnings:                    { label: 'Warnings',              group: 'Moderation', editable: true },
    content_changes:             { label: 'Content Change Log',    group: 'Moderation' },
    // Edited through its own richer editor in routes/adminManual.ts. Listed here
    // read-only so it is visible when browsing, without giving two editors one row.
    manual_pages:                { label: 'Manual Pages',          group: 'Moderation' },
    // What the Wayfaring merge (migration 20261016130000) replaced, kept to undo it by hand.
    wayfaring_merge_backup:      { label: 'Wayfaring Merge Backup', group: 'Moderation' },

    // ---- Registered 2026-11-03 ----
    // Tables added to the game without an entry here. The panel lists any table
    // this registry does not name anyway (lib/adminTables.ts, "New (not yet
    // sorted)"), so a new table is never invisible; giving it an entry here
    // files it under its group and decides whether it can be edited.

    // Guilds. A guild's rank permissions are guilds.rank_permissions (JSON of
    // rank to permission keys; empty means the defaults in services/guildRanks.ts);
    // a member's rank is guild_members.role.
    guild_halls:                 { label: 'Guild Halls',           group: 'Guilds',     editable: true },
    guild_hall_progress:         { label: 'Guild Hall Progress',   group: 'Guilds',     editable: true },
    guild_hall_contributions:    { label: 'Guild Hall Contributions', group: 'Guilds',  editable: true },
    guild_storage:               { label: 'Guild Storehouse',      group: 'Guilds',     editable: true },
    guild_storage_requests:      { label: 'Guild Storehouse Requests', group: 'Guilds', editable: true },
    guild_storage_ledger:        { label: 'Guild Storehouse Ledger', group: 'Guilds' },

    // Talar: the reservoir, open stones, learned spells and what they left in the world.
    player_talar:                { label: 'Player Talar',          group: 'Talar',      editable: true },
    player_talar_open_gem:       { label: 'Open Gems (filling)',   group: 'Talar',      editable: true },
    player_spells:               { label: 'Player Spells',         group: 'Talar',      editable: true },
    larder_wards:                { label: 'Larder Wards',          group: 'Talar',      editable: true },
    portals:                     { label: 'Portals',               group: 'Talar',      editable: true },
    portal_riders:               { label: 'Portal Riders',         group: 'Talar',      editable: true },

    // Player state that belongs beside the other Activity and Holdings tables.
    combat_fights:               { label: 'Combat Fights',         group: 'Activity',   editable: true },
    pen_flowers:                 { label: 'Pen Flowers',           group: 'Activity',   editable: true },
    player_buffs:                { label: 'Player Buffs',          group: 'Activity',   editable: true },
    death_loadouts:              { label: 'Death Loadouts',        group: 'Holdings',   editable: true },
    workstation_slots:           { label: 'Workstation Slots',     group: 'World State', editable: true },
    // A player's private notes: readable for support, never edited for them.
    player_journal_notes:        { label: 'Journal Notes',         group: 'Accounts' },
    // A phone's push address and keys are credentials; only who and when show.
    push_subscriptions:          { label: 'Push Subscriptions',    group: 'Accounts',   secretColumns: ['endpoint', 'p256dh', 'auth'] },

    // Commerce. Merchants are seeds/08_merchants.ts's (a re-seed overwrites an
    // edit); shops and allowances are state. Ledgers and sale records are
    // history, so read only, as taler_purchases is.
    merchants:                   { label: 'Merchants',             group: 'Economy',    editable: true },
    merchant_stock:              { label: 'Merchant Stock',        group: 'Economy',    editable: true },
    npc_purchase_daily:          { label: 'NPC Daily Purchases',   group: 'Economy',    editable: true },
    npc_sale_daily:              { label: 'NPC Daily Sales',       group: 'Economy',    editable: true },
    player_shops:                { label: 'Player Shops',          group: 'Economy',    editable: true },
    shop_listings:               { label: 'Shop Listings',         group: 'Economy',    editable: true },
    shop_buy_orders:             { label: 'Shop Buy Orders',       group: 'Economy',    editable: true },
    shop_transactions:           { label: 'Shop Transactions',     group: 'Economy' },
    gold_ledger:                 { label: 'Gold Ledger',           group: 'Economy' },
    taler_adjustments:           { label: 'Taler Adjustments',     group: 'Economy' },

    // Events and the Chronicle: records of who took part and what was told.
    world_event_participation:   { label: 'World Event Participation', group: 'Events' },
    world_event_shares:          { label: 'World Event Shares',    group: 'Events' },
    chronicle_mentions:          { label: 'Chronicle Mentions',    group: 'Chronicle' },
    chronicle_verse_uses:        { label: 'Chronicle Verse Uses',  group: 'Chronicle' },
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
