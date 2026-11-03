// What the admin database panel can open (routes/adminContent.ts).
//
// lib/contentTables.ts is the registry: labels, groups, what may be edited,
// what is snapshotted. It is written by hand, and tables kept being added to
// the game without being added there, so the panel quietly never showed them
// (guild halls, the storehouse, Talar, spells, shops: 33 tables by 2026-11-03).
// Now every table in the database is listed. One the registry does not name
// appears under "New (not yet sorted)", editable, never snapshotted, with any
// column that looks like a credential held back, until someone gives it a
// proper entry. Snapshots stay opt-in (see contentTables.ts for why).
//
// Rows are named by their primary key. Most tables have an `id`; a table keyed
// by several columns (player_spells, guild_storage) names a row by a JSON
// object of those columns, sent as the row's `_key`.

import db from '../db'
import { CONTENT_TABLES, GLOBAL_COLUMN_BLACKLIST, type ContentTableMeta } from './contentTables'

/** Knex's own bookkeeping. Editing it from a panel could only do harm. */
const NEVER_LISTED = new Set(['knex_migrations', 'knex_migrations_lock'])

/** Column names that, on a table nobody has reviewed, are held back. */
const LOOKS_SECRET = /password|secret|token|_hash$|^hash$|^p256dh$|^auth$|^endpoint$|api_key/i

export const UNSORTED_GROUP = 'New (not yet sorted)'

let discovered: Record<string, ContentTableMeta> = {}
let primaryKeys: Record<string, string[]> = {}
let loadedAt = 0

function labelFor(table: string): string {
    return table.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Re-read the database's tables and keys. Cheap; cached for a minute. */
export async function refreshAdminTables(force = false): Promise<void> {
    if (!force && Date.now() - loadedAt < 60_000) return
    const tables = await db('information_schema.tables')
        .where({ table_schema: 'public', table_type: 'BASE TABLE' })
        .pluck('table_name') as string[]
    const cols = await db('information_schema.columns')
        .where({ table_schema: 'public' })
        .select('table_name', 'column_name') as { table_name: string; column_name: string }[]
    const pk = await db.raw(`
        SELECT c.relname AS table_name, a.attname AS column_name, array_position(i.indkey::int2[], a.attnum) AS pos
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indisprimary`)

    const keys: Record<string, string[]> = {}
    for (const r of (pk.rows as { table_name: string; column_name: string; pos: number }[]).sort((a, b) => a.pos - b.pos)) {
        (keys[r.table_name] ??= []).push(r.column_name)
    }
    const next: Record<string, ContentTableMeta> = {}
    for (const t of tables) {
        if (NEVER_LISTED.has(t) || CONTENT_TABLES[t]) continue
        next[t] = {
            label: labelFor(t),
            group: UNSORTED_GROUP,
            editable: true,
            secretColumns: cols.filter(c => c.table_name === t && LOOKS_SECRET.test(c.column_name)).map(c => c.column_name),
        }
    }
    discovered = next
    primaryKeys = keys
    loadedAt = Date.now()
}

/** Every table the panel lists: the registry's, then any it does not name. */
export async function adminTables(): Promise<Record<string, ContentTableMeta>> {
    await refreshAdminTables(true)
    return { ...CONTENT_TABLES, ...discovered }
}

/** A table's entry, or undefined if the panel does not open it. */
export async function adminTableMeta(table: string): Promise<ContentTableMeta | undefined> {
    if (NEVER_LISTED.has(table)) return undefined
    await refreshAdminTables()
    if (!CONTENT_TABLES[table] && !discovered[table]) await refreshAdminTables(true)
    return CONTENT_TABLES[table] ?? discovered[table]
}

/** The columns naming a row: ['id'] for most tables. Call adminTableMeta first. */
export function rowKeyColumns(table: string): string[] {
    return primaryKeys[table]?.length ? primaryKeys[table] : ['id']
}

export function hasIdKey(table: string): boolean {
    const k = rowKeyColumns(table)
    return k.length === 1 && k[0] === 'id'
}

export function adminSecretColumns(table: string): string[] {
    return (CONTENT_TABLES[table] ?? discovered[table])?.secretColumns ?? []
}

export function adminIsSecretColumn(table: string, column: string): boolean {
    return adminSecretColumns(table).includes(column)
}

/**
 * The rules of contentTables.ts's isEditableColumn, for any listed table, plus:
 * a column that is part of the row's key is never edited in place (that would
 * be moving the row, not changing it).
 */
export function adminIsEditableColumn(table: string, column: string): boolean {
    const meta = CONTENT_TABLES[table] ?? discovered[table]
    if (!meta || !meta.editable) return false
    if (GLOBAL_COLUMN_BLACKLIST.has(column)) return false
    if (column.endsWith('_id')) return false
    if (adminIsSecretColumn(table, column)) return false
    if (rowKeyColumns(table).includes(column)) return false
    return true
}

/** The key a row is sent with, for a table without an `id`. */
export function rowKeyOf(table: string, row: Record<string, unknown>): string {
    const key: Record<string, unknown> = {}
    for (const c of rowKeyColumns(table)) key[c] = row[c]
    return JSON.stringify(key)
}

/**
 * A where clause naming one row, from what the panel sent: a whole number for
 * an `id` table, the row's `_key` JSON for the others. Null when it does not
 * name exactly the key's columns with plain values.
 */
export function parseRowKey(table: string, raw: unknown): Record<string, string | number | boolean> | null {
    if (hasIdKey(table)) {
        const id = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
        return Number.isInteger(id) ? { id } : null
    }
    let parsed: unknown
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return null }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const cols = rowKeyColumns(table)
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (entries.length !== cols.length) return null
    const where: Record<string, string | number | boolean> = {}
    for (const c of cols) {
        const v = (parsed as Record<string, unknown>)[c]
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return null
        where[c] = v
    }
    return where
}

/** What content_changes records for a row: its id, or 0 and the key as text. */
export function changeRowRef(table: string, row: Record<string, unknown>): { row_id: number; row_key: string | null } {
    return hasIdKey(table)
        ? { row_id: Number(row.id), row_key: null }
        : { row_id: 0, row_key: rowKeyOf(table, row) }
}
