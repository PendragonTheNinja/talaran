// Shared registry of content tables — the single source of truth for which
// tables count as "content" for the admin panel and the snapshot scripts.
//
// DB-first content model: the database is canonical for content rows; the
// repo holds exported JSON snapshots (content-snapshots/) for diffability,
// disaster recovery, and syncing a local dev DB. Migrations remain the tool
// for SCHEMA. Run `npm run content:export` after meaningful content work and
// commit the snapshot alongside code changes.

export interface ContentTableMeta {
    label: string;
    group: string;
    /** World/player state riding along in the browser — never edited, never snapshotted. */
    stateOnly?: boolean;
}

// Listed in FK-dependency order: parents before children. Import replays
// this order forward; anything that references another content table by id
// (npc_dialogues→npcs, trap_targets→trap_types/locations, drop_table_entries
// →items, quest_objectives→quests, location_connections/npcs/quests→locations)
// must come after its parent.
export const CONTENT_TABLES: Record<string, ContentTableMeta> = {
    skills:               { label: 'Skills',                group: 'Core' },
    items:                { label: 'Items',                 group: 'Core' },
    locations:            { label: 'Locations',             group: 'World' },
    location_connections: { label: 'Location Connections',  group: 'World' },
    npcs:                 { label: 'NPCs',                  group: 'World' },
    npc_dialogues:        { label: 'NPC Dialogues',         group: 'World' },
    workstations:         { label: 'Workstations',          group: 'World', stateOnly: true },
    resource_nodes:       { label: 'Resource Nodes',        group: 'Gathering' },
    ore_veins:            { label: 'Ore Veins',             group: 'Gathering', stateOnly: true },
    huntable_animals:     { label: 'Huntable Animals',      group: 'Hunting' },
    trap_types:           { label: 'Trap Types',            group: 'Hunting' },
    trap_targets:         { label: 'Trap Targets',          group: 'Hunting' },
    recipes:              { label: 'Recipes',               group: 'Crafting' },
    drop_table_entries:   { label: 'Drop Table Entries',    group: 'Drops' },
    quests:               { label: 'Quests',                group: 'Quests' },
    quest_objectives:     { label: 'Quest Objectives',      group: 'Quests' },
};

/** Tables included in content snapshots, in FK-dependency order. */
export const SNAPSHOT_TABLES: string[] = Object.entries(CONTENT_TABLES)
    .filter(([, meta]) => !meta.stateOnly)
    .map(([name]) => name);

// --- Editability: blacklist model -----------------------------------------
// Everything is editable EXCEPT:
//  - stateOnly tables (browse-only)
//  - primary keys, timestamps
//  - 'name' columns: they are upsert keys for migrations and cross-referenced
//    by name elsewhere (recipes.inputs itemName, quests.npc_name, ...)
//  - foreign-key id columns: re-pointing relations deserves more ceremony
//    than a cell edit.
export const GLOBAL_COLUMN_BLACKLIST = new Set(['id', 'name', 'created_at', 'updated_at']);

export function isEditableColumn(table: string, column: string): boolean {
    const meta = CONTENT_TABLES[table];
    if (!meta || meta.stateOnly) return false;
    if (GLOBAL_COLUMN_BLACKLIST.has(column)) return false;
    if (column.endsWith('_id')) return false;
    return true;
}
