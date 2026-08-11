import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { CONTENT_TABLES, isEditableColumn, secretColumns, isSecretColumn } from '../lib/contentTables';

const router = Router();

const ROW_LIMIT = 1000;

// Columns whose string values must reference an existing row — the live
// equivalent of migrations' "loud throw on missing references".
const REF_COLUMNS: Record<string, { table: string; column: string }> = {
    output_item_name: { table: 'items', column: 'name' },
    item_name:        { table: 'items', column: 'name' },
    target_item:      { table: 'items', column: 'name' },
    npc_name:         { table: 'npcs', column: 'name' },
    skill:            { table: 'skills', column: 'name' },
    for_skill:        { table: 'skills', column: 'name' },
};

// FK id columns rendered as dropdowns in the creation form
const REF_ID_COLUMNS: Record<string, string> = {
    item_id: 'items',
    npc_id: 'npcs',
    skill_id: 'skills',
    location_id: 'locations',
    from_location_id: 'locations',
    to_location_id: 'locations',
    trap_type_id: 'trap_types',
    quest_id: 'quests',
    resource_node_id: 'resource_nodes',
};

// Sentinel column_name values in content_changes for whole-row operations
const CREATED = '(created)';
const DELETED = '(deleted)';

// Simplified column kinds for validation + the client's editor choice
type ColumnKind = 'boolean' | 'integer' | 'float' | 'string' | 'text' | 'json' | 'array';

function kindOf(pgType: string): ColumnKind {
    const t = pgType.toLowerCase();
    if (t === 'boolean') return 'boolean';
    if (t.includes('int')) return 'integer';
    if (['real', 'double precision', 'numeric', 'decimal', 'float'].some(f => t.includes(f))) return 'float';
    if (t === 'jsonb' || t === 'json') return 'json';
    if (t.includes('array') || t.startsWith('_')) return 'array';
    if (t === 'text') return 'text';
    return 'string';
}

// Recursively collect values of keys named itemName / item_name in parsed JSON
function collectItemNames(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) value.forEach(v => collectItemNames(v, out));
    else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            if ((k === 'itemName' || k === 'item_name') && typeof v === 'string') out.push(v);
            else collectItemNames(v, out);
        }
    }
    return out;
}

async function validateItemRefs(names: string[]): Promise<string | null> {
    if (names.length === 0) return null;
    const unique = [...new Set(names)];
    const found = await db('items').whereIn('name', unique).pluck('name');
    const missing = unique.filter(n => !found.includes(n));
    return missing.length > 0 ? `Unknown item name(s): ${missing.join(', ')}` : null;
}

// Validate + coerce an incoming value for a column. Returns the value to
// write, or an error string.
async function prepareValue(
    table: string,
    column: string,
    kind: ColumnKind,
    nullable: boolean,
    maxLength: number | null,
    value: unknown,
): Promise<{ ok: true; write: unknown } | { ok: false; error: string }> {
    if (value === null) {
        if (!nullable) return { ok: false, error: 'That column cannot be null.' };
        return { ok: true, write: null };
    }

    switch (kind) {
        case 'boolean':
            if (typeof value !== 'boolean') return { ok: false, error: 'Expected true or false.' };
            return { ok: true, write: value };

        case 'integer':
            if (typeof value !== 'number' || !Number.isInteger(value) || Math.abs(value) > 100_000_000)
                return { ok: false, error: 'Expected a whole number.' };
            return { ok: true, write: value };

        case 'float':
            if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100_000_000)
                return { ok: false, error: 'Expected a number.' };
            return { ok: true, write: value };

        case 'string': {
            if (typeof value !== 'string') return { ok: false, error: 'Expected text.' };
            const cap = maxLength ?? 1000;
            if (value.length > cap) return { ok: false, error: `Too long (max ${cap} characters for this column).` };
            const ref = REF_COLUMNS[column];
            if (ref) {
                const exists = await db(ref.table).where({ [ref.column]: value }).first();
                if (!exists) return { ok: false, error: `No ${ref.table} row named "${value}".` };
            }
            return { ok: true, write: value };
        }

        case 'text': {
            if (typeof value !== 'string') return { ok: false, error: 'Expected text.' };
            if (value.length > 20000) return { ok: false, error: 'Too long (max 20000 characters).' };
            // JSON-in-text content columns: validate parse + item references
            const trimmed = value.trim();
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    const refError = await validateItemRefs(collectItemNames(parsed));
                    if (refError) return { ok: false, error: refError };
                    return { ok: true, write: trimmed };
                } catch {
                    return { ok: false, error: 'That looks like JSON but does not parse. Fix it or it will break at resolve time.' };
                }
            }
            return { ok: true, write: value };
        }

        case 'json': {
            if (typeof value !== 'string') return { ok: false, error: 'Expected a JSON string.' };
            try {
                const parsed = JSON.parse(value);
                const refError = await validateItemRefs(collectItemNames(parsed));
                if (refError) return { ok: false, error: refError };
                return { ok: true, write: JSON.stringify(parsed) };
            } catch {
                return { ok: false, error: 'Invalid JSON.' };
            }
        }

        case 'array': {
            // text[] columns (npc_dialogues.text_lines): client sends a JSON array of strings
            if (typeof value !== 'string') return { ok: false, error: 'Expected a JSON array of strings.' };
            try {
                const parsed = JSON.parse(value);
                if (!Array.isArray(parsed) || !parsed.every(v => typeof v === 'string'))
                    return { ok: false, error: 'Expected a JSON array of strings, e.g. ["First paragraph.", "Second."]' };
                return { ok: true, write: parsed };
            } catch {
                return { ok: false, error: 'Invalid JSON array.' };
            }
        }
    }
}

function stringifyForLog(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

// Parse a logged string back into a writable value for revert
function parseFromLog(stored: string | null, kind: ColumnKind): unknown {
    if (stored === null) return null;
    switch (kind) {
        case 'boolean': return stored === 'true';
        case 'integer': return parseInt(stored);
        case 'float': return parseFloat(stored);
        case 'json': return stored;                 // stored as JSON text; knex writes it to jsonb
        case 'array': {
            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) throw new Error('not an array');
            return parsed;
        }
        default: return stored;
    }
}

// Admin-only gate. Content tooling is deliberately NOT part of the
// mod_permissions system — it is the game owner's surface.
async function requireAdmin(playerId: number): Promise<boolean> {
    const player = await db('players').where({ id: playerId }).first();
    return !!player?.is_admin;
}

// List browsable tables with row counts
router.get('/tables', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const tables = await Promise.all(
            Object.entries(CONTENT_TABLES).map(async ([name, meta]) => {
                const [{ count }] = await db(name).count('* as count');
                return { name, label: meta.label, group: meta.group, rowCount: Number(count) };
            })
        );

        res.json({ tables });
    } catch (err) {
        logger.error(`Admin content tables error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Read one table's rows (whitelisted name only)
router.get('/table/:name', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const name = String(req.params.name);
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const meta = CONTENT_TABLES[name];
        if (!meta) {
            res.status(404).json({ error: 'Unknown content table.' });
            return;
        }

        const info = await db(name).columnInfo();
        // Secret columns are dropped from the column list AND selected out of the
        // query, so a password hash is never in a response body at all, rather
        // than merely hidden by the client.
        const secret = secretColumns(name);
        const columns = Object.keys(info).filter(c => !secret.includes(c));
        const rows = await db(name).select(columns).orderBy('id', 'asc').limit(ROW_LIMIT);
        const editable = columns.filter(c => isEditableColumn(name, c));
        const columnKinds: Record<string, ColumnKind> = {};
        for (const c of columns) columnKinds[c] = kindOf(String((info as any)[c].type));

        // Learned enums: varchar columns whose existing values repeat within a
        // small set (type, subtype, slot, station, ...) get offered as dropdown
        // options so category strings can't silently fork ("weapon" vs "Weapon").
        // Reference columns are excluded — they already have real dropdowns.
        const enumOptions: Record<string, string[]> = {};
        for (const c of columns) {
            if (columnKinds[c] !== 'string') continue;
            if (c === 'name' || REF_COLUMNS[c] || REF_ID_COLUMNS[c]) continue;
            const distinct = await db(name).distinct(c).whereNotNull(c).orderBy(c, 'asc').limit(21);
            const values = distinct.map(r => String(r[c]));
            if (values.length > 0 && values.length <= 20) enumOptions[c] = values;
        }

        res.json({
            table: name,
            label: meta.label,
            columns,
            rows,
            editable,
            columnKinds,
            enumOptions,
            truncated: rows.length === ROW_LIMIT,
        });
    } catch (err) {
        logger.error(`Admin content table read error (${name}): ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Edit one cell. Transactional: row lock → update → audit log, or nothing.
router.patch('/table/:name/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const name = String(req.params.name);
    const rowId = parseInt(String(req.params.id));
    const { column, value } = req.body as { column: string; value: unknown };
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }
        if (!CONTENT_TABLES[name] || !Number.isInteger(rowId)) {
            res.status(404).json({ error: 'Unknown content table or row.' });
            return;
        }
        if (typeof column !== 'string' || !isEditableColumn(name, column)) {
            res.status(400).json({ error: 'That column is not editable from the panel.' });
            return;
        }

        const info = await db(name).columnInfo();
        const colInfo = (info as any)[column];
        if (!colInfo) {
            res.status(400).json({ error: 'No such column.' });
            return;
        }
        const kind = kindOf(String(colInfo.type));
        const prepared = await prepareValue(name, column, kind, !!colInfo.nullable, colInfo.maxLength ? Number(colInfo.maxLength) : null, value);
        if (!prepared.ok) {
            res.status(400).json({ error: prepared.error });
            return;
        }

        const result = await db.transaction(async (trx) => {
            const row = await trx(name).where({ id: rowId }).forUpdate().first();
            if (!row) return { status: 404 as const, error: 'Row not found.' };
            const oldValue = row[column];

            const patch: Record<string, unknown> = { [column]: prepared.write };

            // Setting a price by hand IS an override, so say so in the data.
            // Without this the derivation engine's next --write would quietly
            // undo the edit, and the only clue would be a number that drifted
            // back on its own. Clear value_locked to hand the item back to the
            // formula.
            if (name === 'items' && column === 'value') patch.value_locked = true;

            await trx(name).where({ id: rowId }).update(patch);
            await trx('content_changes').insert({
                player_id: playerId,
                table_name: name,
                row_id: rowId,
                column_name: column,
                old_value: stringifyForLog(oldValue),
                new_value: stringifyForLog(prepared.write),
            });
            const updated = await trx(name).where({ id: rowId }).first();
            return { status: 200 as const, row: updated };
        });

        if (result.status !== 200) {
            res.status(result.status).json({ error: result.error });
            return;
        }

        // Cross-field sanity: quality chances should sum to 100
        let warning: string | null = null;
        if (name === 'resource_nodes' && ['poor_chance', 'fine_chance', 'excellent_chance'].includes(column)) {
            const sum = (result.row.poor_chance ?? 0) + (result.row.fine_chance ?? 0) + (result.row.excellent_chance ?? 0);
            if (sum !== 100) warning = `Quality chances now sum to ${sum}, not 100. Fix the other columns before players roll on this node.`;
        }

        logger.info(`[content] player ${playerId} set ${name}#${rowId}.${column}`);
        res.json({ row: result.row, warning });
    } catch (err) {
        logger.error(`Admin content edit error (${name}#${rowId}): ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Dropdown options for reference columns in the creation form
router.get('/refs', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }
        const refTables = ['items', 'npcs', 'skills', 'locations', 'trap_types', 'quests', 'resource_nodes'];
        const refs: Record<string, { id: number; name: string }[]> = {};
        for (const t of refTables) {
            refs[t] = await db(t).select('id', 'name').orderBy('name', 'asc');
        }
        res.json({ refs });
    } catch (err) {
        logger.error(`Admin content refs error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a row. Unlike editing, creation may set 'name' and FK _id columns —
// a new row IS its name, and FKs are how it attaches to the world. Blank
// fields are omitted so DB defaults apply; missing required columns fail
// loudly at insert.
router.post('/table/:name', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const name = String(req.params.name);
    const { values } = req.body as { values: Record<string, unknown> };
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }
        const meta = CONTENT_TABLES[name];
        if (!meta || !meta.editable) {
            res.status(400).json({ error: 'Rows cannot be created in that table from the panel.' });
            return;
        }
        if (!values || typeof values !== 'object' || Array.isArray(values)) {
            res.status(400).json({ error: 'Missing values.' });
            return;
        }

        const info = await db(name).columnInfo();
        const insert: Record<string, unknown> = {};
        for (const [column, raw] of Object.entries(values)) {
            if (raw === undefined) continue;
            if (['id', 'created_at', 'updated_at'].includes(column)) continue;
            if (isSecretColumn(name, column)) {
                res.status(400).json({ error: `${column} cannot be set from the panel.` });
                return;
            }
            const colInfo = (info as any)[column];
            if (!colInfo) {
                res.status(400).json({ error: `No such column: ${column}` });
                return;
            }
            const kind = kindOf(String(colInfo.type));
            const prepared = await prepareValue(name, column, kind, !!colInfo.nullable, colInfo.maxLength ? Number(colInfo.maxLength) : null, raw);
            if (!prepared.ok) {
                res.status(400).json({ error: `${column}: ${prepared.error}` });
                return;
            }
            insert[column] = prepared.write;
        }
        if (Object.keys(insert).length === 0) {
            res.status(400).json({ error: 'Nothing to insert.' });
            return;
        }
        // Validate FK id dropdown columns point at real rows
        for (const [column, refTable] of Object.entries(REF_ID_COLUMNS)) {
            const v = insert[column];
            if (v !== undefined && v !== null) {
                const exists = await db(refTable).where({ id: v }).first();
                if (!exists) {
                    res.status(400).json({ error: `${column}: no ${refTable} row with id ${v}.` });
                    return;
                }
            }
        }

        const result = await db.transaction(async (trx) => {
            const [created] = await trx(name).insert(insert).returning('*');
            await trx('content_changes').insert({
                player_id: playerId,
                table_name: name,
                row_id: created.id,
                column_name: CREATED,
                old_value: null,
                new_value: JSON.stringify(created),
            });
            return created;
        });

        logger.info(`[content] player ${playerId} created ${name}#${result.id}`);
        res.json({ row: result });
    } catch (err: any) {
        if (err?.code === '23505') {
            res.status(400).json({ error: 'A row with that name (or another unique value) already exists.' });
            return;
        }
        if (err?.code === '23502') {
            res.status(400).json({ error: `Missing required column: ${err.column ?? 'unknown'}.` });
            return;
        }
        logger.error(`Admin content create error (${name}): ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Item usage analysis ---------------------------------------------------
// Column → human grouping for the usage view. Anything not listed that
// matches falls into 'Other references'.
const USAGE_GROUPS: { key: string; title: string; kind: 'source' | 'use'; columns: string[] }[] = [
    { key: 'produced', title: 'Produced by', kind: 'source', columns: ['output_item_name'] },
    { key: 'dropped', title: 'Dropped by', kind: 'source', columns: ['drop_table', 'item_id'] },
    { key: 'quest_reward', title: 'Quest rewards', kind: 'source', columns: ['reward_items', 'start_items'] },
    { key: 'consumed', title: 'Consumed by', kind: 'use', columns: ['inputs'] },
    { key: 'trap', title: 'Used as trap', kind: 'use', columns: ['item_name'] },
    { key: 'station', title: 'Crafting station for', kind: 'use', columns: ['station'] },
    { key: 'objective', title: 'Quest objective target', kind: 'use', columns: ['target_item'] },
];

interface UsageEntry { table: string; label: string; rowId: number; rowName: string; detail: string | null }

// Scan every content table for references to one item (by name for string/JSON
// columns, by id for *_item_id / item_id FKs). Generic by design: new columns
// that reference items are picked up automatically.
async function scanItemUsage(itemName: string, itemId: number) {
    const groups: Record<string, UsageEntry[]> = {};
    const add = (groupKey: string, entry: UsageEntry) => {
        (groups[groupKey] = groups[groupKey] || []).push(entry);
    };
    const groupFor = (column: string): string => {
        for (const g of USAGE_GROUPS) if (g.columns.includes(column)) return g.key;
        return 'other';
    };

    for (const [table, meta] of Object.entries(CONTENT_TABLES)) {
        if (table === 'items' || !meta.snapshot) continue;   // authored content only
        const info = await db(table).columnInfo();
        const rows = await db(table).select('*');
        for (const row of rows) {
            const rowName = String(row.name ?? `#${row.id}`);
            for (const [column, colInfo] of Object.entries(info)) {
                if (column === 'name') continue;
                const value = row[column];
                if (value === null || value === undefined) continue;
                const kind = kindOf(String((colInfo as any).type));

                if (kind === 'string' && value === itemName) {
                    add(groupFor(column), { table, label: meta.label, rowId: row.id, rowName, detail: null });
                } else if ((kind === 'text' || kind === 'json') && typeof value !== 'boolean') {
                    const rawText = typeof value === 'string' ? value : JSON.stringify(value);
                    if (!rawText.includes(itemName)) continue;  // cheap pre-filter
                    try {
                        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                        if (collectItemNames(parsed).includes(itemName)) {
                            // Pull a qty detail when the JSON has the common {itemName, qty} shape
                            let detail: string | null = null;
                            if (Array.isArray(parsed)) {
                                const hit = parsed.find((e: any) => e && (e.itemName === itemName || e.item_name === itemName));
                                if (hit?.qty !== undefined) detail = `×${hit.qty}`;
                                else if (hit?.quantity !== undefined) detail = `×${hit.quantity}`;
                                else if (hit?.chance !== undefined) detail = `${hit.chance}% chance`;
                            }
                            add(groupFor(column), { table, label: meta.label, rowId: row.id, rowName, detail });
                        }
                    } catch { /* non-JSON text, ignore */ }
                } else if (kind === 'integer' && (column === 'item_id' || column.endsWith('_item_id')) && value === itemId) {
                    add(groupFor('item_id'), { table, label: meta.label, rowId: row.id, rowName, detail: null });
                }
            }
        }
    }
    return groups;
}

router.get('/usage/item/:itemName', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const itemName = String(req.params.itemName);
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }
        const item = await db('items').where({ name: itemName }).first();
        if (!item) {
            res.status(404).json({ error: `No item named "${itemName}".` });
            return;
        }

        const found = await scanItemUsage(item.name, item.id);
        const groups = USAGE_GROUPS
            .map(g => ({ key: g.key, title: g.title, kind: g.kind, entries: found[g.key] || [] }))
            .filter(g => g.entries.length > 0);
        if (found.other?.length) {
            groups.push({ key: 'other', title: 'Other references', kind: 'use', entries: found.other });
        }

        res.json({ item: { id: item.id, name: item.name, type: item.type ?? null, tier: item.tier ?? null }, groups });
    } catch (err) {
        logger.error(`Admin item usage error (${itemName}): ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Orphan report: items with no source (nothing produces, drops, or rewards
// them) and items with no use (nothing consumes or requires them). The
// latter is informational — finished goods legitimately have no use yet.
router.get('/usage/orphans', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const items: { id: number; name: string; type: string | null; is_active: boolean }[] =
            await db('items').select('id', 'name', 'type', 'is_active').orderBy('name', 'asc');

        const sourceNames = new Set<string>();
        const sourceIds = new Set<number>();
        const useNames = new Set<string>();

        const harvestJson = (value: unknown, into: Set<string>) => {
            try {
                const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                for (const n of collectItemNames(parsed)) into.add(n);
            } catch { /* ignore */ }
        };

        for (const [table, meta] of Object.entries(CONTENT_TABLES)) {
            if (table === 'items' || !meta.snapshot) continue;   // authored content only
            const info = await db(table).columnInfo();
            const rows = await db(table).select('*');
            const sourceGroup = new Set(USAGE_GROUPS.filter(g => g.kind === 'source').flatMap(g => g.columns));
            for (const row of rows) {
                for (const [column, colInfo] of Object.entries(info)) {
                    const value = row[column];
                    if (value === null || value === undefined) continue;
                    const kind = kindOf(String((colInfo as any).type));
                    const isSource = sourceGroup.has(column);
                    if (kind === 'string') {
                        if (column === 'output_item_name') sourceNames.add(String(value));
                        else if (['item_name', 'station', 'target_item'].includes(column)) useNames.add(String(value));
                    } else if (kind === 'text' || kind === 'json') {
                        if (isSource) harvestJson(value, sourceNames);
                        else if (column === 'inputs') harvestJson(value, useNames);
                    } else if (kind === 'integer' && column === 'item_id') {
                        if (isSource) sourceIds.add(Number(value));
                    }
                }
            }
        }

        const unobtainable = items.filter(i => !sourceNames.has(i.name) && !sourceIds.has(i.id));
        const unused = items.filter(i => !useNames.has(i.name));

        res.json({
            unobtainable,
            unused,
            checkedSources: 'recipe outputs, drop tables (animals, traps, nodes), quest start/reward items',
        });
    } catch (err) {
        logger.error(`Admin orphan report error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Validation sweep ------------------------------------------------------
// Balance constants mirror docs/xp-rebalance.md (and the panel's Balance tab).
// If a §9 knob changes, update here and in AdminBalanceCalculator.tsx.
const BAL_R1 = 2000;
const BAL_GROWTH = Math.pow(1.33, 1 / 12);
const BAL_DIP = 1.10;
const balRef = (level: number) => BAL_R1 * Math.pow(BAL_GROWTH, Math.max(1, level) - 1);
const balTarget = (mult: number, level: number) => mult * BAL_DIP * balRef(level);
const DRIFT_FLAG = 0.25;  // flag anything >25% off its band

interface CheckEntry { table: string; rowId: number; rowName: string; message: string; jump: { table: string; filter: string } }
interface Check { id: string; title: string; severity: 'error' | 'warning' | 'balance'; entries: CheckEntry[] }

router.get('/reports/validate', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const checks: Record<string, Check> = {
            danglingItems: { id: 'danglingItems', title: 'JSON references to unknown items', severity: 'error', entries: [] },
            danglingRefs: { id: 'danglingRefs', title: 'Reference columns pointing at missing rows', severity: 'error', entries: [] },
            badJson: { id: 'badJson', title: 'Malformed JSON in content columns', severity: 'error', entries: [] },
            qualitySum: { id: 'qualitySum', title: 'Quality chances not summing to 100', severity: 'warning', entries: [] },
            timerOrder: { id: 'timerOrder', title: 'min_timer greater than base_timer', severity: 'warning', entries: [] },
            emptyJson: { id: 'emptyJson', title: 'Empty inputs / drop tables', severity: 'warning', entries: [] },
            badNumbers: { id: 'badNumbers', title: 'Suspicious numbers (qty/weight ≤ 0)', severity: 'warning', entries: [] },
            balance: { id: 'balance', title: `Earn rates drifted >±${DRIFT_FLAG * 100}% off their band`, severity: 'balance', entries: [] },
            itemTier: { id: 'itemTier', title: 'items.tier disagrees with its unlock level (recipe / fish / forage / trap sources only)', severity: 'warning', entries: [] },
        };
        const add = (check: keyof typeof checks, table: string, row: any, message: string) => {
            const rowName = String(row.name ?? `#${row.id}`);
            checks[check].entries.push({ table, rowId: row.id, rowName, message, jump: { table, filter: row.name ? String(row.name) : String(row.id) } });
        };

        const itemNames = new Set<string>((await db('items').pluck('name')).map(String));
        const skillNames = new Set<string>((await db('skills').pluck('name')).map(String));
        const npcNames = new Set<string>((await db('npcs').pluck('name')).map(String));
        const refSets: Record<string, Set<string>> = {
            output_item_name: itemNames, item_name: itemNames, target_item: itemNames,
            npc_name: npcNames, skill: skillNames, for_skill: skillNames,
        };

        // --- Generic referential + JSON checks over every content table
        for (const [table, meta] of Object.entries(CONTENT_TABLES)) {
            if (!meta.snapshot) continue;   // authored content only
            const info = await db(table).columnInfo();
            const rows = await db(table).select('*');
            for (const row of rows) {
                for (const [column, colInfo] of Object.entries(info)) {
                    const value = row[column];
                    if (value === null || value === undefined) continue;
                    const kind = kindOf(String((colInfo as any).type));

                    if (kind === 'string' && refSets[column] && !refSets[column].has(String(value))) {
                        add('danglingRefs', table, row, `${column} = "${value}" does not exist`);
                    } else if (kind === 'text' && typeof value === 'string') {
                        const trimmed = value.trim();
                        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                            try {
                                const parsed = JSON.parse(trimmed);
                                for (const n of collectItemNames(parsed)) {
                                    if (!itemNames.has(n)) add('danglingItems', table, row, `${column} references unknown item "${n}"`);
                                }
                                if (Array.isArray(parsed) && parsed.length === 0 && ['inputs', 'drop_table'].includes(column)) {
                                    add('emptyJson', table, row, `${column} is an empty list`);
                                }
                            } catch {
                                add('badJson', table, row, `${column} looks like JSON but does not parse`);
                            }
                        }
                    } else if (kind === 'json') {
                        for (const n of collectItemNames(value)) {
                            if (!itemNames.has(n)) add('danglingItems', table, row, `${column} references unknown item "${n}"`);
                        }
                    }
                }
            }
        }

        // --- Targeted sanity checks
        const nodes = await db('resource_nodes').select('*');
        for (const n of nodes) {
            const sum = (n.poor_chance ?? 0) + (n.fine_chance ?? 0) + (n.excellent_chance ?? 0);
            if (sum !== 100) add('qualitySum', 'resource_nodes', n, `poor+fine+excellent = ${sum}`);
            if (n.min_timer != null && n.base_timer != null && n.min_timer > n.base_timer) {
                add('timerOrder', 'resource_nodes', n, `min ${n.min_timer}s > base ${n.base_timer}s`);
            }
        }
        const animals = await db('huntable_animals').select('*');
        for (const a of animals) {
            if (a.min_timer != null && a.base_timer != null && a.min_timer > a.base_timer) {
                add('timerOrder', 'huntable_animals', a, `min ${a.min_timer}s > base ${a.base_timer}s`);
            }
        }
        const recipes = await db('recipes').select('*');
        for (const r of recipes) {
            if (r.output_qty != null && r.output_qty <= 0) add('badNumbers', 'recipes', r, `output_qty = ${r.output_qty}`);
        }
        const trapTargets = await db('trap_targets').select('*');
        for (const t of trapTargets) {
            if (t.weight != null && t.weight <= 0) add('badNumbers', 'trap_targets', t, `weight = ${t.weight}`);
        }

        // --- Balance lint
        const drift = (actual: number, target: number) => (actual - target) / target;
        const pct = (d: number) => `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`;

        // Resource nodes: Mining ores ×1.3, Mining rocks ×0.5, everything else ×1.0
        for (const n of nodes) {
            if (n.is_active === false || !n.base_timer || !n.xp_reward) continue;
            const mult = n.skill === 'Mining' ? (n.ore_subtype ? 1.3 : 0.5) : 1.0;
            const actual = n.xp_reward * 3600 / n.base_timer;
            const d = drift(actual, balTarget(mult, n.required_level ?? 1));
            if (Math.abs(d) > DRIFT_FLAG) {
                add('balance', 'resource_nodes', n, `${Math.round(actual)} xp/hr vs ×${mult} band at L${n.required_level ?? 1} (${pct(d)})`);
            }
        }

        // Huntable animals: effective xp (catch% blended) vs ×1.0 band, wider tolerance
        for (const a of animals) {
            if (a.is_active === false || !a.base_timer) continue;
            const catchP = (a.base_catch_chance ?? 100) / 100;
            const effXp = (a.xp_success ?? 0) * catchP + (a.xp_failure ?? 0) * (1 - catchP);
            if (effXp <= 0) continue;
            const actual = effXp * 3600 / a.base_timer;
            const d = drift(actual, balTarget(1.0, a.required_level ?? 1));
            if (Math.abs(d) > 0.30) {
                add('balance', 'huntable_animals', a, `~${Math.round(actual)} xp/hr effective vs ×1.0 band at L${a.required_level ?? 1} (${pct(d)})`);
            }
        }

        // Recipes: implied multiplier matched to allowed bands for the mode
        for (const r of recipes) {
            if (r.is_active === false || !r.timer_seconds || !r.xp) continue;
            const actual = r.xp * 3600 / r.timer_seconds;
            const base = BAL_DIP * balRef(r.required_level ?? 1);
            const implied = actual / base;
            const allowed = r.mode === 'passive' ? [0.30, 0.02] : [1.8, 1.08];
            const nearest = allowed.reduce((a, b) => Math.abs(implied - a) < Math.abs(implied - b) ? a : b);
            const d = drift(actual, nearest * base);
            if (Math.abs(d) > DRIFT_FLAG) {
                add('balance', 'recipes', r, `${Math.round(actual)} xp/hr ≈ ×${implied.toFixed(2)}; nearest ${r.mode === 'passive' ? 'passive' : 'crafting'} band ×${nearest} (${pct(d)})`);
            }
        }

        // Trapping: expected xp/hr per (trap type, location) pool vs ×0.30 band
        const trapTypes = await db('trap_types').select('*');
        const targetsByLoc = new Map<number, any[]>();
        for (const t of trapTargets) {
            if (t.is_active === false) continue;
            const list = targetsByLoc.get(t.location_id) ?? [];
            list.push(t);
            targetsByLoc.set(t.location_id, list);
        }
        for (const tt of trapTypes) {
            if (tt.is_active === false || !tt.roll_interval_seconds) continue;
            for (const [locId, pool] of targetsByLoc) {
                const eligible = pool.filter(t => t.trap_type_id == null || t.trap_type_id === tt.id);
                const totalWeight = eligible.reduce((s, t) => s + (t.weight ?? 0), 0);
                if (totalWeight <= 0) continue;
                const avgXp = eligible.reduce((s, t) => s + (t.xp ?? 0) * (t.weight ?? 0), 0) / totalWeight;
                const actual = (3600 / tt.roll_interval_seconds) * ((tt.catch_chance ?? 0) / 100) * avgXp;
                const d = drift(actual, balTarget(0.30, tt.required_level ?? 1));
                if (Math.abs(d) > DRIFT_FLAG) {
                    add('balance', 'trap_types', tt, `~${Math.round(actual)} xp/hr at location #${locId} vs ×0.30 band at L${tt.required_level ?? 1} (${pct(d)})`);
                }
            }
        }

        // --- items.tier vs the level the item first becomes obtainable ---------
        //
        // Tier is DERIVED, never chosen (CLAUDE.md §4): tier 1 is anything
        // reachable below level 13, tier 2 is 13-24, then twelves thereafter. It
        // is not a judgement about how grand the thing is, which is exactly the
        // mistake that shipped ten of the eighteen fish as tier 2 and 3.
        //
        // COVERAGE, stated honestly: recipes and fish_species carry the item and
        // its gate on one row; foraging_habitats and trap_targets carry theirs in a
        // JSON drop_table, with the gate on the parent (a trap_target's gate is on
        // its trap_type).
        //
        // Not covered: anything reached through drop_table_entries. Those rows
        // key off a free-form `source_key` ('woodcutting:lanai',
        // 'mining:rock:granite') built in code at call time, with no column
        // linking back to the node's required_level. Logs, ores and hunting
        // drops therefore cannot be checked from data alone, and inventing a
        // parse of those strings would produce confident wrong answers. Better a
        // report with a known blind spot than one that cries wolf.
        const TIER_BAND = 12;
        const tierForLevel = (level: number) => Math.floor((Math.max(1, level) - 1) / TIER_BAND) + 1;

        const minLevelByItem = new Map<string, number>();
        const noteSource = (itemName: unknown, level: unknown) => {
            const name = typeof itemName === 'string' ? itemName : null;
            if (!name) return;
            const lvl = Number(level);
            if (!Number.isFinite(lvl)) return;
            const prev = minLevelByItem.get(name);
            if (prev === undefined || lvl < prev) minLevelByItem.set(name, lvl);
        };

        for (const row of await db('recipes').select('output_item_name', 'required_level', 'is_active')) {
            if (row.is_active === false) continue;
            noteSource(row.output_item_name, row.required_level);
        }
        for (const row of await db('fish_species').select('item_name', 'required_level', 'is_active')) {
            if (row.is_active === false) continue;
            noteSource(row.item_name, row.required_level);
        }

        // Foraging and trapping keep their yields in a JSON `drop_table` column
        // of { itemName, ... } entries rather than a flat item_name, so the level
        // gate lives on the parent row and the items inside it.
        const fromJsonDropTable = (raw: unknown, level: unknown) => {
            if (raw == null) return;
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (!Array.isArray(parsed)) return;
                for (const entry of parsed) noteSource(entry?.itemName, level);
            } catch {
                // Malformed JSON is already reported by the badJson check.
            }
        };
        for (const row of await db('foraging_habitats').select('drop_table', 'required_level', 'is_active')) {
            if (row.is_active === false) continue;
            fromJsonDropTable(row.drop_table, row.required_level);
        }
        // trap_targets has no level of its own: the gate is on its trap_type,
        // and a target may be open to every type (trap_type_id null), in which
        // case the lowest-level trap that can catch it is the honest gate.
        const trapTypeLevels = new Map<number, number>();
        let lowestTrapLevel = Number.POSITIVE_INFINITY;
        for (const tt of await db('trap_types').select('id', 'required_level', 'is_active')) {
            if (tt.is_active === false) continue;
            const lvl = Number(tt.required_level) || 1;
            trapTypeLevels.set(Number(tt.id), lvl);
            if (lvl < lowestTrapLevel) lowestTrapLevel = lvl;
        }
        for (const row of await db('trap_targets').select('drop_table', 'trap_type_id', 'is_active')) {
            if (row.is_active === false) continue;
            const level = row.trap_type_id == null
                ? (Number.isFinite(lowestTrapLevel) ? lowestTrapLevel : 1)
                : trapTypeLevels.get(Number(row.trap_type_id));
            if (level === undefined) continue;
            fromJsonDropTable(row.drop_table, level);
        }

        for (const item of await db('items').select('id', 'name', 'tier')) {
            const min = minLevelByItem.get(String(item.name));
            if (min === undefined) continue;              // unauditable or unsourced
            if (item.tier === null || item.tier === undefined) continue;
            const expected = tierForLevel(min);
            if (Number(item.tier) !== expected) {
                add('itemTier', 'items', item,
                    `tier ${item.tier} but first obtainable at level ${min}, so it should be tier ${expected}`);
            }
        }

        const result = Object.values(checks);
        const summary = {
            errors: result.filter(c => c.severity === 'error').reduce((n, c) => n + c.entries.length, 0),
            warnings: result.filter(c => c.severity === 'warning').reduce((n, c) => n + c.entries.length, 0),
            balance: result.filter(c => c.severity === 'balance').reduce((n, c) => n + c.entries.length, 0),
        };
        res.json({ checks: result, summary });
    } catch (err) {
        logger.error(`Admin validation sweep error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Recent audit log
router.get('/changes', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }
        const changes = await db('content_changes')
            .join('players', 'content_changes.player_id', 'players.id')
            .select('content_changes.*', 'players.username')
            .orderBy('content_changes.id', 'desc')
            .limit(200);
        res.json({ changes });
    } catch (err) {
        logger.error(`Admin content changes error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Revert a logged change: writes old_value back, logged as a new change
router.post('/changes/:id/revert', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const changeId = parseInt(String(req.params.id));
    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }
        if (!Number.isInteger(changeId)) {
            res.status(404).json({ error: 'Unknown change.' });
            return;
        }

        const change = await db('content_changes').where({ id: changeId }).first();
        if (!change) {
            res.status(404).json({ error: 'Change not found.' });
            return;
        }
        if (!CONTENT_TABLES[change.table_name]) {
            res.status(400).json({ error: 'That change can no longer be reverted from the panel.' });
            return;
        }

        // Whole-row operations: reverting a creation deletes the row;
        // reverting a deletion resurrects it.
        if (change.column_name === CREATED || change.column_name === DELETED) {
            try {
                const result = await db.transaction(async (trx) => {
                    if (change.column_name === CREATED) {
                        const row = await trx(change.table_name).where({ id: change.row_id }).forUpdate().first();
                        if (!row) return { status: 404 as const, error: 'The row no longer exists.' };
                        await trx(change.table_name).where({ id: change.row_id }).del();
                        await trx('content_changes').insert({
                            player_id: playerId,
                            table_name: change.table_name,
                            row_id: change.row_id,
                            column_name: DELETED,
                            old_value: JSON.stringify(row),
                            new_value: null,
                            reverts_change_id: change.id,
                        });
                        return { status: 200 as const };
                    } else {
                        const row = JSON.parse(change.old_value ?? 'null');
                        if (!row || typeof row !== 'object') return { status: 400 as const, error: 'Stored row could not be restored.' };
                        await trx(change.table_name).insert(row);
                        await trx.raw(
                            `SELECT setval(pg_get_serial_sequence(?, 'id'), (SELECT COALESCE(MAX(id), 1) FROM ??))`,
                            [change.table_name, change.table_name],
                        );
                        await trx('content_changes').insert({
                            player_id: playerId,
                            table_name: change.table_name,
                            row_id: change.row_id,
                            column_name: CREATED,
                            old_value: null,
                            new_value: JSON.stringify(row),
                            reverts_change_id: change.id,
                        });
                        return { status: 200 as const };
                    }
                });
                if (result.status !== 200) {
                    res.status(result.status).json({ error: result.error });
                    return;
                }
                logger.info(`[content] player ${playerId} reverted whole-row change #${changeId}`);
                res.json({ ok: true });
                return;
            } catch (err: any) {
                if (err?.code === '23503') {
                    res.status(400).json({ error: 'Cannot delete: other rows still reference this one. Remove those references first.' });
                    return;
                }
                if (err?.code === '23505') {
                    res.status(400).json({ error: 'Cannot restore: a row with that name or id already exists.' });
                    return;
                }
                throw err;
            }
        }

        if (!isEditableColumn(change.table_name, change.column_name)) {
            res.status(400).json({ error: 'That change can no longer be reverted from the panel.' });
            return;
        }

        const info = await db(change.table_name).columnInfo();
        const colInfo = (info as any)[change.column_name];
        if (!colInfo) {
            res.status(400).json({ error: 'The column no longer exists.' });
            return;
        }
        const kind = kindOf(String(colInfo.type));

        let restored: unknown;
        try {
            restored = parseFromLog(change.old_value, kind);
        } catch {
            res.status(400).json({ error: 'Stored value could not be restored safely.' });
            return;
        }

        const result = await db.transaction(async (trx) => {
            const row = await trx(change.table_name).where({ id: change.row_id }).forUpdate().first();
            if (!row) return { status: 404 as const, error: 'The row no longer exists.' };
            const current = row[change.column_name];

            await trx(change.table_name).where({ id: change.row_id }).update({ [change.column_name]: restored });
            await trx('content_changes').insert({
                player_id: playerId,
                table_name: change.table_name,
                row_id: change.row_id,
                column_name: change.column_name,
                old_value: stringifyForLog(current),
                new_value: change.old_value,
                reverts_change_id: change.id,
            });
            const updated = await trx(change.table_name).where({ id: change.row_id }).first();
            return { status: 200 as const, row: updated };
        });

        if (result.status !== 200) {
            res.status(result.status).json({ error: result.error });
            return;
        }

        logger.info(`[content] player ${playerId} reverted change #${changeId}`);
        res.json({ row: result.row });
    } catch (err) {
        logger.error(`Admin content revert error (#${changeId}): ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
