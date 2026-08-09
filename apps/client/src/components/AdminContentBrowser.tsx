import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import AdminContentCreate from './AdminContentCreate'
import AdminItemUsage from './AdminItemUsage'

interface ContentTable {
    name: string
    label: string
    group: string
    rowCount: number
}

type ColumnKind = 'boolean' | 'integer' | 'float' | 'string' | 'text' | 'json' | 'array'

interface TableData {
    table: string
    label: string
    columns: string[]
    rows: Record<string, unknown>[]
    editable: string[]
    columnKinds: Record<string, ColumnKind>
    enumOptions: Record<string, string[]>
    truncated: boolean
}

interface ContentChange {
    id: number
    username: string
    table_name: string
    row_id: number
    column_name: string
    old_value: string | null
    new_value: string | null
    reverts_change_id: number | null
    created_at: string
}

function formatCell(value: unknown): { text: string; title?: string; className?: string } {
    if (value === null || value === undefined) return { text: '—', className: 'muted-text' }
    if (typeof value === 'boolean') return { text: value ? '✓' : '✗', className: value ? 'gold-text' : 'muted-text' }
    if (typeof value === 'object') {
        const json = JSON.stringify(value)
        return json.length > 60 ? { text: json.slice(0, 57) + '...', title: json } : { text: json }
    }
    const str = String(value)
    if (str.length > 60) return { text: str.slice(0, 57) + '...', title: str }
    return { text: str }
}

// Initial textarea contents for the overlay editor
function overlayInitialValue(value: unknown, kind: ColumnKind): string {
    if (value === null || value === undefined) return ''
    if (kind === 'json' || kind === 'array') {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value
            return JSON.stringify(parsed, null, 2)
        } catch {
            return String(value)
        }
    }
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
}

export default function AdminContentBrowser() {
    const [tables, setTables] = useState<ContentTable[]>([])
    // Sidebar filter and per-group collapse. 82 tables across 19 groups is far
    // too much to scroll, so groups start shut and the filter opens only what
    // matches.
    const [tableFilter, setTableFilter] = useState('')
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
    const [selected, setSelected] = useState<string | null>(null)  // table name or '__changes'
    const [data, setData] = useState<TableData | null>(null)
    const [changes, setChanges] = useState<ContentChange[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [warning, setWarning] = useState<string | null>(null)

    // Inline editing (numbers + short strings)
    const [editing, setEditing] = useState<{ rowId: number; column: string; kind: ColumnKind } | null>(null)
    const [editValue, setEditValue] = useState('')
    const [editFreeText, setEditFreeText] = useState(false)
    const editInputRef = useRef<HTMLInputElement | null>(null)

    // Overlay editing (text / json / array)
    const [overlay, setOverlay] = useState<{ rowId: number; column: string; kind: ColumnKind } | null>(null)
    const [overlayValue, setOverlayValue] = useState('')
    const [creating, setCreating] = useState<{ prefill?: Record<string, string> } | null>(null)
    const [filter, setFilter] = useState('')

    const [flash, setFlash] = useState<string | null>(null)
    const [sort, setSort] = useState<{ column: string; dir: 'asc' | 'desc' } | null>(null)
    const [usageItem, setUsageItem] = useState<string | null>(null)
    const [orphans, setOrphans] = useState<{ unobtainable: { id: number; name: string; type: string | null; is_active: boolean }[]; unused: { id: number; name: string }[] } | null>(null)
    const [validation, setValidation] = useState<{ checks: { id: string; title: string; severity: 'error' | 'warning' | 'balance'; entries: { table: string; rowId: number; rowName: string; message: string; jump: { table: string; filter: string } }[] }[]; summary: { errors: number; warnings: number; balance: number } } | null>(null)

    useEffect(() => {
        apiFetch<{ tables: ContentTable[] }>('/api/admin/content/tables')
            .then(d => setTables(d.tables))
            .catch((err: any) => setError(err.message || 'Could not load content tables.'))
    }, [])

    useEffect(() => {
        if (editing) editInputRef.current?.select()
    }, [editing, editFreeText])

    const loadTable = async (name: string) => {
        setSelected(name)
        setLoading(true)
        setError(null)
        setWarning(null)
        setEditing(null)
        setOverlay(null)
        setCreating(null)
        setSort(null)
        setFilter('')
        setUsageItem(null)
        setOrphans(null)
        try {
            const d = await apiFetch<TableData>(`/api/admin/content/table/${name}`)
            setData(d)
        } catch (err: any) {
            setError(err.message || 'Could not load table.')
            setData(null)
        } finally {
            setLoading(false)
        }
    }

    const loadChanges = async () => {
        setSelected('__changes')
        setLoading(true)
        setError(null)
        setWarning(null)
        setEditing(null)
        setOverlay(null)
        try {
            const d = await apiFetch<{ changes: ContentChange[] }>('/api/admin/content/changes')
            setChanges(d.changes)
        } catch (err: any) {
            setError(err.message || 'Could not load change log.')
        } finally {
            setLoading(false)
        }
    }

    const loadOrphans = async () => {
        setSelected('__orphans')
        setLoading(true)
        setError(null)
        setWarning(null)
        setUsageItem(null)
        try {
            const d = await apiFetch<NonNullable<typeof orphans>>('/api/admin/content/usage/orphans')
            setOrphans(d)
        } catch (err: any) {
            setError(err.message || 'Could not run the orphan report.')
        } finally {
            setLoading(false)
        }
    }

    const loadValidation = async () => {
        setSelected('__validate')
        setLoading(true)
        setError(null)
        setWarning(null)
        setUsageItem(null)
        try {
            const d = await apiFetch<NonNullable<typeof validation>>('/api/admin/content/reports/validate')
            setValidation(d)
        } catch (err: any) {
            setError(err.message || 'Could not run validation.')
        } finally {
            setLoading(false)
        }
    }

    // From the usage view: jump to a referencing row's table, pre-filtered
    const jumpToUsage = async (table: string, filterValue: string) => {
        await loadTable(table)
        setFilter(filterValue)
    }

    const applyUpdatedRow = (row: Record<string, unknown>) => {
        setData(d => d ? { ...d, rows: d.rows.map(r => r.id === row.id ? row : r) } : d)
    }

    const flashCell = (rowId: number, column: string) => {
        setFlash(`${rowId}:${column}`)
        setTimeout(() => setFlash(f => f === `${rowId}:${column}` ? null : f), 1200)
    }

    const patchCell = async (rowId: number, column: string, value: unknown): Promise<boolean> => {
        if (!data) return false
        try {
            const res = await apiFetch<{ row: Record<string, unknown>; warning: string | null }>(
                `/api/admin/content/table/${data.table}/${rowId}`,
                { method: 'PATCH', body: JSON.stringify({ column, value }) }
            )
            applyUpdatedRow(res.row)
            setWarning(res.warning)
            setError(null)
            flashCell(rowId, column)
            return true
        } catch (err: any) {
            setError(err.message || 'Edit failed.')
            return false
        }
    }

    const saveInlineEdit = async () => {
        if (!editing) return
        let value: unknown = editValue
        if (editing.kind === 'integer') {
            const parsed = parseInt(editValue)
            if (!Number.isInteger(parsed)) { setError('Value must be a whole number.'); return }
            value = parsed
        } else if (editing.kind === 'float') {
            const parsed = parseFloat(editValue)
            if (!Number.isFinite(parsed)) { setError('Value must be a number.'); return }
            value = parsed
        }
        if (await patchCell(editing.rowId, editing.column, value)) setEditing(null)
    }

    const saveOverlay = async (asNull: boolean) => {
        if (!overlay) return
        let value: unknown
        if (asNull) {
            value = null
        } else if (overlay.kind === 'json' || overlay.kind === 'array') {
            try {
                // Client-side parse check for fast feedback; send compact string
                value = JSON.stringify(JSON.parse(overlayValue))
            } catch {
                setError('Invalid JSON — fix it before saving.')
                return
            }
        } else {
            value = overlayValue
        }
        if (await patchCell(overlay.rowId, overlay.column, value)) setOverlay(null)
    }

    const toggleBoolean = async (rowId: number, column: string, current: boolean) => {
        if (!data) return
        const scary = data.table === 'skills'
            ? `\n\nThis is the skills table — flipping ${column} changes what every player sees the moment you confirm.`
            : ' This is live immediately.'
        if (!window.confirm(`Set ${column} to ${!current} on ${data.table} #${rowId}?${scary}`)) return
        await patchCell(rowId, column, !current)
    }

    const revertChange = async (change: ContentChange) => {
        const truncate = (v: string | null) => v === null ? '—' : v.length > 80 ? v.slice(0, 77) + '...' : v
        if (!window.confirm(`Revert ${change.table_name} #${change.row_id} ${change.column_name}:\n${truncate(change.new_value)}\n→\n${truncate(change.old_value)}`)) return
        try {
            await apiFetch(`/api/admin/content/changes/${change.id}/revert`, { method: 'POST' })
            setError(null)
            await loadChanges()
        } catch (err: any) {
            setError(err.message || 'Revert failed.')
        }
    }

    const startEdit = (rowId: number, column: string, value: unknown, kind: ColumnKind) => {
        setEditFreeText(false)
        if (kind === 'text' || kind === 'json' || kind === 'array') {
            setEditing(null)
            setOverlay({ rowId, column, kind })
            setOverlayValue(overlayInitialValue(value, kind))
        } else {
            setOverlay(null)
            setEditing({ rowId, column, kind })
            setEditValue(value === null || value === undefined ? '' : String(value))
        }
    }

    // Click a header: asc → desc → back to default (id order)
    const cycleSort = (column: string) => {
        setSort(s => {
            if (!s || s.column !== column) return { column, dir: 'asc' }
            if (s.dir === 'asc') return { column, dir: 'desc' }
            return null
        })
    }

    const compareValues = (a: unknown, b: unknown): number => {
        // Nulls sort last regardless of direction's flip, handled by caller
        if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1
        if (b === null || b === undefined) return -1
        if (typeof a === 'number' && typeof b === 'number') return a - b
        if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0)
        const as = typeof a === 'object' ? JSON.stringify(a) : String(a)
        const bs = typeof b === 'object' ? JSON.stringify(b) : String(b)
        // Numeric strings (pg decimals arrive as strings) compare numerically
        const an = parseFloat(as), bn = parseFloat(bs)
        if (!isNaN(an) && !isNaN(bn) && String(an) === as.trim() && String(bn) === bs.trim()) return an - bn
        return as.localeCompare(bs)
    }

    // Pre-fill the creation form from an existing row (name blanked)
    const duplicateRow = (row: Record<string, unknown>) => {
        if (!data) return
        const prefill: Record<string, string> = {}
        for (const c of data.columns) {
            if (['id', 'name', 'created_at', 'updated_at'].includes(c)) continue
            const v = row[c]
            if (v === null || v === undefined) continue
            const kind = data.columnKinds[c] || 'string'
            if (kind === 'json' || kind === 'array') {
                try {
                    prefill[c] = JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2)
                } catch {
                    prefill[c] = String(v)
                }
            } else if (typeof v === 'object') {
                prefill[c] = JSON.stringify(v, null, 2)
            } else {
                prefill[c] = String(v)
            }
        }
        setOverlay(null)
        setEditing(null)
        setCreating({ prefill })
    }

    const filteredRows = data
        ? (filter.trim()
            ? data.rows.filter(row => {
                const needle = filter.trim().toLowerCase()
                return data.columns.some(c => {
                    const v = row[c]
                    if (v === null || v === undefined) return false
                    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
                    return s.toLowerCase().includes(needle)
                })
            })
            : data.rows)
        : []

    const sortedRows = sort
        ? [...filteredRows].sort((ra, rb) => {
            const cmp = compareValues(ra[sort.column], rb[sort.column])
            // Keep nulls last in both directions
            const aNull = ra[sort.column] === null || ra[sort.column] === undefined
            const bNull = rb[sort.column] === null || rb[sort.column] === undefined
            if (aNull !== bNull) return aNull ? 1 : -1
            return sort.dir === 'asc' ? cmp : -cmp
        })
        : filteredRows

    // Match on the table's label, its raw name, and its group, so "fish" finds
    // Fish Species and "fishing" also finds the whole Fishing group.
    const filterQuery = tableFilter.trim().toLowerCase()
    const matchesFilter = (t: ContentTable) => (
        !filterQuery
        || t.label.toLowerCase().includes(filterQuery)
        || t.name.toLowerCase().includes(filterQuery)
        || t.group.toLowerCase().includes(filterQuery)
    )

    const groups = tables.filter(matchesFilter).reduce<Record<string, ContentTable[]>>((acc, t) => {
        (acc[t.group] = acc[t.group] || []).push(t)
        return acc
    }, {})

    // Collapsed by default. While filtering, every surviving group is forced open
    // so results are never hidden behind a shut header: a filter that finds
    // something and shows nothing reads as a broken filter.
    const isGroupOpen = (group: string) => (
        filterQuery ? true : (openGroups[group] ?? false)
    )
    const toggleGroup = (group: string) => setOpenGroups(g => ({ ...g, [group]: !isGroupOpen(group) }))

    return (
        <div className="admin-body">
            {/* Table list sidebar */}
            <div className="admin-sidebar">
                <div className="admin-section">
                    <div
                        className={`admin-player-row clickable ${selected === '__changes' ? 'selected' : ''}`}
                        onClick={loadChanges}
                    >
                        <span style={{ fontSize: '15px' }} className={selected === '__changes' ? 'gold-text' : ''}>
                            🕮 Recent Changes
                        </span>
                    </div>
                    <div
                        className={`admin-player-row clickable ${selected === '__orphans' ? 'selected' : ''}`}
                        onClick={loadOrphans}
                    >
                        <span style={{ fontSize: '15px' }} className={selected === '__orphans' ? 'gold-text' : ''}>
                            🧭 Item Orphans
                        </span>
                    </div>
                    <div
                        className={`admin-player-row clickable ${selected === '__validate' ? 'selected' : ''}`}
                        onClick={loadValidation}
                    >
                        <span style={{ fontSize: '15px' }} className={selected === '__validate' ? 'gold-text' : ''}>
                            ⚖ Validation
                        </span>
                    </div>
                </div>
                <div className="admin-divider" />

                <div className="admin-table-filter">
                    <input
                        type="text"
                        value={tableFilter}
                        placeholder="Filter tables…"
                        onChange={e => setTableFilter(e.target.value)}
                    />
                    {tableFilter && (
                        <button
                            className="admin-filter-clear"
                            onClick={() => setTableFilter('')}
                            title="Clear the filter"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {Object.keys(groups).length === 0 && (
                    <p className="muted-text" style={{ fontSize: '13px', padding: '8px 4px' }}>
                        No table matches “{tableFilter}”.
                    </p>
                )}

                {Object.entries(groups).map(([group, groupTables]) => {
                    const open = isGroupOpen(group)
                    return (
                        <div className="admin-section" key={group}>
                            <button
                                className="admin-section-toggle"
                                onClick={() => toggleGroup(group)}
                                aria-expanded={open}
                            >
                                <span className="admin-section-caret">{open ? '▾' : '▸'}</span>
                                <span className="admin-section-title-text">{group}</span>
                                <span className="admin-section-count">{groupTables.length}</span>
                            </button>
                            {open && groupTables.map(t => (
                                <div
                                    key={t.name}
                                    className={`admin-player-row clickable ${selected === t.name ? 'selected' : ''}`}
                                    onClick={() => loadTable(t.name)}
                                >
                                    <span style={{ fontSize: '15px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span className={selected === t.name ? 'gold-text' : ''}>{t.label}</span>
                                        <span className="muted-text" style={{ fontSize: '13px' }}>{t.rowCount}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )
                })}
            </div>

            {/* Main pane */}
            <div className="admin-main">
                {error && <p className="guild-error">{error}</p>}
                {warning && <p style={{ color: '#e8a030', fontSize: '14px', marginBottom: '8px' }}>⚠ {warning}</p>}
                {!selected && !error && (
                    <p className="muted-text">
                        Select a content table to browse. Most cells are editable — click one.
                        Every edit is logged under Recent Changes and can be reverted from there.
                    </p>
                )}
                {loading && <p className="muted-text">Loading...</p>}

                {/* Overlay editor for long text / JSON / arrays */}
                {overlay && data && (
                    <div className="admin-overlay-editor">
                        <p className="admin-section-title" style={{ marginBottom: '4px' }}>
                            Editing {data.table} #{overlay.rowId} · {overlay.column}
                            <span className="muted-text" style={{ marginLeft: '8px', letterSpacing: 'normal' }}>
                                {overlay.kind === 'array' ? 'JSON array of strings' : overlay.kind === 'json' ? 'JSON' : 'text'}
                            </span>
                        </p>
                        <textarea
                            className="admin-overlay-textarea"
                            value={overlayValue}
                            onChange={e => setOverlayValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setOverlay(null) }}
                            rows={overlay.kind === 'text' ? 5 : 10}
                            spellCheck={false}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                            <button className="btn btn-gold" onClick={() => saveOverlay(false)}>Save</button>
                            <button className="btn" onClick={() => saveOverlay(true)}>Set NULL</button>
                            <button className="btn" onClick={() => setOverlay(null)}>Cancel</button>
                        </div>
                    </div>
                )}

                {/* Validation report */}
                {selected === '__validate' && validation && !loading && (
                    <div className="usage-view">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '10px' }}>
                            <p className="admin-section-title" style={{ marginBottom: 0 }}>Validation Sweep</p>
                            <span className="muted-text" style={{ fontSize: '13px' }}>
                                {validation.summary.errors} error{validation.summary.errors === 1 ? '' : 's'} ·{' '}
                                {validation.summary.warnings} warning{validation.summary.warnings === 1 ? '' : 's'} ·{' '}
                                {validation.summary.balance} balance drift{validation.summary.balance === 1 ? '' : 's'}
                            </span>
                            <button className="btn" style={{ fontSize: '12px', padding: '2px 10px', marginLeft: 'auto' }} onClick={loadValidation}>
                                Re-run
                            </button>
                        </div>
                        {validation.summary.errors + validation.summary.warnings + validation.summary.balance === 0 && (
                            <div className="usage-section usage-source">
                                <p className="usage-section-title">✓ All clear</p>
                                <p className="muted-text" style={{ fontSize: '13px' }}>
                                    Every reference resolves, all JSON parses, quality chances sum, and every earn
                                    rate sits within its band. The world is in order.
                                </p>
                            </div>
                        )}
                        {validation.checks.filter(c => c.entries.length > 0).map(c => (
                            <div
                                key={c.id}
                                className={`usage-section ${c.severity === 'error' ? 'usage-warning-section' : c.severity === 'warning' ? 'usage-use' : 'usage-balance'}`}
                            >
                                <p className="usage-section-title">
                                    {c.severity === 'error' ? '⚠' : c.severity === 'warning' ? '❔' : '⚖'} {c.title}
                                    <span className="muted-text" style={{ marginLeft: '6px', fontWeight: 'normal' }}>{c.entries.length}</span>
                                </p>
                                <div className="usage-chips">
                                    {c.entries.map((e, i) => (
                                        <button
                                            key={`${e.table}-${e.rowId}-${i}`}
                                            className="usage-chip"
                                            title={`Open ${e.table} filtered to this row`}
                                            onClick={() => jumpToUsage(e.jump.table, e.jump.filter)}
                                        >
                                            <span className="usage-chip-name">{e.rowName}</span>
                                            <span className="usage-chip-detail">{e.message}</span>
                                            <span className="usage-chip-table">{e.table}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Orphan report */}
                {selected === '__orphans' && orphans && !loading && (
                    <div className="usage-view">
                        <p className="admin-section-title">Item Orphans</p>
                        <div className="usage-section usage-warning-section">
                            <p className="usage-section-title">⚠ Unobtainable — nothing provides these
                                <span className="muted-text" style={{ marginLeft: '6px', fontWeight: 'normal' }}>{orphans.unobtainable.length}</span>
                            </p>
                            {orphans.unobtainable.length === 0
                                ? <p className="muted-text" style={{ fontSize: '13px' }}>None — every item has a source. 🎉</p>
                                : (
                                    <div className="usage-chips">
                                        {orphans.unobtainable.map(i => (
                                            <button key={i.id} className="usage-chip" title="View usage" onClick={() => { setSelected('items'); setUsageItem(i.name) }}>
                                                <span className="usage-chip-name">{i.name}</span>
                                                {i.type && <span className="usage-chip-table">{i.type}</span>}
                                                {!i.is_active && <span className="usage-chip-detail">inactive</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            <p className="muted-text" style={{ fontSize: '12px', marginTop: '6px' }}>
                                Sources checked: recipe outputs, drop tables (animals, traps, nodes), quest start/reward items.
                                Placeholder alpha items (e.g. Tanner's Scraps sold nowhere yet) will appear here by design.
                            </p>
                        </div>
                        <div className="usage-section usage-use">
                            <p className="usage-section-title">Unused — nothing consumes these
                                <span className="muted-text" style={{ marginLeft: '6px', fontWeight: 'normal' }}>{orphans.unused.length}</span>
                            </p>
                            <p className="muted-text" style={{ fontSize: '12px', marginBottom: '6px' }}>
                                Informational — finished goods belong here. Materials on this list deserve a look.
                            </p>
                            <div className="usage-chips">
                                {orphans.unused.map(i => (
                                    <button key={i.id} className="usage-chip" onClick={() => { setSelected('items'); setUsageItem(i.name) }}>
                                        <span className="usage-chip-name">{i.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Item usage view */}
                {usageItem && selected === 'items' && (
                    <AdminItemUsage
                        itemName={usageItem}
                        onJump={jumpToUsage}
                        onClose={() => { setUsageItem(null); if (!data || data.table !== 'items') loadTable('items') }}
                    />
                )}

                {/* Change log view */}
                {selected === '__changes' && !loading && (
                    <div className="admin-content-table-wrap">
                        <p className="admin-section-title">Recent Changes ({changes.length})</p>
                        {changes.length === 0 ? (
                            <p className="muted-text">No content edits logged yet.</p>
                        ) : (
                            <div className="admin-content-scroll">
                                <table className="admin-content-table">
                                    <thead>
                                        <tr>
                                            <th>when</th><th>who</th><th>table</th><th>row</th><th>column</th><th>change</th><th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {changes.map(c => (
                                            <tr key={c.id}>
                                                <td className="muted-text">{new Date(c.created_at).toLocaleString()}</td>
                                                <td>{c.username}</td>
                                                <td>{c.table_name}</td>
                                                <td>#{c.row_id}</td>
                                                <td>{c.column_name}</td>
                                                <td>
                                                    <span className="muted-text" title={c.old_value ?? undefined}>
                                                        {c.old_value === null ? '—' : c.old_value.length > 30 ? c.old_value.slice(0, 27) + '...' : c.old_value}
                                                    </span>
                                                    {' → '}
                                                    <span className="gold-text" title={c.new_value ?? undefined}>
                                                        {c.new_value === null ? '—' : c.new_value.length > 30 ? c.new_value.slice(0, 27) + '...' : c.new_value}
                                                    </span>
                                                    {c.reverts_change_id && <span className="muted-text"> (revert of #{c.reverts_change_id})</span>}
                                                </td>
                                                <td>
                                                    <button className="btn" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={() => revertChange(c)}>
                                                        Revert
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Table view */}
                {selected && selected !== '__changes' && selected !== '__orphans' && selected !== '__validate' && !usageItem && data && !loading && (
                    <div className="admin-content-table-wrap">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
                            <p className="admin-section-title" style={{ marginBottom: 0 }}>{data.label}</p>
                            <span className="muted-text" style={{ fontSize: '13px' }}>
                                {filter.trim() ? `${sortedRows.length} of ${data.rows.length}` : `${data.rows.length}`} row{data.rows.length === 1 ? '' : 's'}{data.truncated ? ' (truncated at 1000)' : ''}
                                {data.editable.length > 0 ? ' · click a highlighted cell to edit' : ' · read-only (world/player state)'}
                            </span>
                            <input
                                className="admin-filter-input"
                                type="text"
                                placeholder="Filter rows..."
                                value={filter}
                                onChange={e => setFilter(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Escape') setFilter('') }}
                            />
                            {data.editable.length > 0 && !creating && (
                                <button
                                    className="btn"
                                    style={{ fontSize: '12px', padding: '2px 10px' }}
                                    onClick={() => { setCreating({}); setOverlay(null); setEditing(null) }}
                                >
                                    + New Row
                                </button>
                            )}
                        </div>
                        {creating && (
                            <AdminContentCreate
                                table={data.table}
                                label={data.label}
                                columns={data.columns}
                                columnKinds={data.columnKinds}
                                enumOptions={data.enumOptions}
                                initialValues={creating.prefill}
                                onCreated={() => loadTable(data.table)}
                                onCancel={() => setCreating(null)}
                            />
                        )}
                        {data.rows.length === 0 ? (
                            <p className="muted-text">Table is empty.</p>
                        ) : (
                            <div className="admin-content-scroll">
                                <table className="admin-content-table">
                                    <thead>
                                        <tr>
                                            {data.editable.length > 0 && <th style={{ width: '30px' }} />}
                                            {data.columns.map(c => (
                                                <th
                                                    key={c}
                                                    className={`admin-th-sortable ${data.editable.includes(c) ? 'admin-col-editable' : ''}`}
                                                    title="Click to sort"
                                                    onClick={() => cycleSort(c)}
                                                >
                                                    {c}{sort?.column === c ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedRows.map((row, i) => {
                                            const rowId = row.id as number
                                            return (
                                                <tr key={rowId ?? i}>
                                                    {data.editable.length > 0 && (
                                                        <td
                                                            className="admin-cell-duplicate"
                                                            title="Duplicate this row"
                                                            onClick={() => duplicateRow(row)}
                                                        >
                                                            ⧉
                                                        </td>
                                                    )}
                                                    {data.columns.map(c => {
                                                        const value = row[c]
                                                        const kind = data.columnKinds[c] || 'string'
                                                        const isEditable = data.editable.includes(c) && Number.isInteger(rowId)
                                                        const isEditing = editing && editing.rowId === rowId && editing.column === c
                                                        const isFlashing = flash === `${rowId}:${c}`

                                                        if (isEditing) {
                                                            const enumVals = editing.kind === 'string' && !editFreeText ? data.enumOptions[c] : undefined
                                                            if (enumVals) {
                                                                return (
                                                                    <td key={c} className="admin-cell-editing">
                                                                        <select
                                                                            className="admin-cell-input"
                                                                            style={{ width: 'auto', minWidth: '120px' }}
                                                                            autoFocus
                                                                            value={enumVals.includes(editValue) ? editValue : ''}
                                                                            onChange={async e => {
                                                                                if (e.target.value === '__custom__') { setEditFreeText(true); return }
                                                                                if (e.target.value === '') return
                                                                                if (await patchCell(rowId, c, e.target.value)) setEditing(null)
                                                                            }}
                                                                            onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }}
                                                                            onBlur={() => setEditing(null)}
                                                                        >
                                                                            <option value="" disabled>choose...</option>
                                                                            {enumVals.map(v => <option key={v} value={v}>{v}</option>)}
                                                                            <option value="__custom__">✏ custom value...</option>
                                                                        </select>
                                                                    </td>
                                                                )
                                                            }
                                                            return (
                                                                <td key={c} className="admin-cell-editing">
                                                                    <input
                                                                        ref={editInputRef}
                                                                        className="admin-cell-input"
                                                                        style={editing.kind === 'string' ? { width: '220px' } : undefined}
                                                                        type={editing.kind === 'string' ? 'text' : 'number'}
                                                                        step={editing.kind === 'float' ? 'any' : undefined}
                                                                        value={editValue}
                                                                        onChange={e => setEditValue(e.target.value)}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter') saveInlineEdit()
                                                                            if (e.key === 'Escape') setEditing(null)
                                                                        }}
                                                                        onBlur={() => setEditing(null)}
                                                                    />
                                                                </td>
                                                            )
                                                        }

                                                        const cell = formatCell(value)
                                                        const isUsageLink = data.table === 'items' && c === 'name' && typeof value === 'string'
                                                        const classes = [
                                                            cell.className,
                                                            isEditable ? 'admin-cell-editable' : undefined,
                                                            isUsageLink ? 'admin-cell-usage-link' : undefined,
                                                            isFlashing ? 'admin-cell-flash' : undefined,
                                                        ].filter(Boolean).join(' ') || undefined

                                                        return (
                                                            <td
                                                                key={c}
                                                                className={classes}
                                                                title={isUsageLink ? 'View where this item is used' : cell.title ?? (isEditable ? 'Click to edit' : undefined)}
                                                                onClick={isUsageLink ? () => setUsageItem(value as string)
                                                                    : isEditable ? () => {
                                                                        if (typeof value === 'boolean') toggleBoolean(rowId, c, value)
                                                                        else startEdit(rowId, c, value, kind)
                                                                    } : undefined}
                                                            >
                                                                {cell.text}
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
