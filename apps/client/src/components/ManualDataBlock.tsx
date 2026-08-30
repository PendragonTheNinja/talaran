import { useState, useEffect } from 'react'
import { loadData, type ManualTable } from '../lib/manual'
import { getItemIcon } from '../lib/items'

/**
 * Item art beside the name, resolved from the item name the same way the
 * inventory does it. Art is optional by design: a missing image removes itself
 * rather than leaving a broken frame, so a table stays correct for items that
 * have no icon drawn yet.
 */
function ItemIcon({ name }: { name: string }) {
    const [broken, setBroken] = useState(false)
    if (!name || broken) return null

    return (
        <img
            src={getItemIcon(name)}
            alt=""
            aria-hidden="true"
            className="manual-table-icon"
            onError={() => setBroken(true)}
        />
    )
}

/**
 * Comparable value for a cell.
 *
 * Every cell arrives pre-formatted for reading, not for sorting: "1,204",
 * "65%", "20s to 15s", "Tier 2". Comparing those as strings puts 100 before 20
 * and sorts "Tier 10" above "Tier 2". A leading number is pulled out where one
 * exists and used instead, which handles all of the above, and anything with no
 * number in front falls back to a locale-aware text compare.
 */
function sortValue(v: string | number | undefined): number | string {
    if (typeof v === 'number') return v
    const text = String(v ?? '')
    const m = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
    return m ? parseFloat(m[0]) : text.toLowerCase()
}

interface ManualDataBlockProps {
    query: string
    param?: string
}

/**
 * Renders one {{data:query:param}} directive as a table, read live from the
 * database via /api/manual/data (docs/manual-spec.md §4).
 *
 * Empty and error states are in-voice and deliberate: manual pages will ship
 * before their content is seeded, and a half-built ledger should read as the
 * Geographer's honest gap, never as a broken table.
 */
export default function ManualDataBlock({ query, param }: ManualDataBlockProps) {
    const [table, setTable] = useState<ManualTable | null>(null)
    // null means the order the query returned, which is chosen deliberately
    // (usually by level) and is worth being able to get back to.
    const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

    useEffect(() => {
        let live = true
        setState('loading')

        loadData(query, param)
            .then(data => {
                if (!live) return
                setTable(data)
                setState('ready')
            })
            .catch(err => {
                if (!live) return
                console.error(`Manual data block "${query}${param ? `:${param}` : ''}" failed:`, err)
                setState('error')
            })

        return () => { live = false }
    }, [query, param])

    if (state === 'loading') {
        return (
            <div className="manual-data manual-data-loading">
                <div className="manual-data-skeleton" />
                <div className="manual-data-skeleton" />
                <div className="manual-data-skeleton" />
            </div>
        )
    }

    if (state === 'error') {
        return (
            <div className="manual-data manual-data-empty">
                <p>This table could not be read just now.</p>
            </div>
        )
    }

    if (!table || table.rows.length === 0) {
        return (
            <div className="manual-data manual-data-empty">
                <p>No entries recorded yet.</p>
            </div>
        )
    }

    // Sorted copy, never the original array: the query's own order is the
    // default and clicking a header three times returns to it.
    const sortedRows = (() => {
        if (!sort) return table.rows
        const dir = sort.dir
        return [...table.rows].sort((a, b) => {
            const av = sortValue(a[sort.key])
            const bv = sortValue(b[sort.key])
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
            return String(av).localeCompare(String(bv)) * dir
        })
    })()

    return (
        <div className="manual-data">
            {table.title && (
                <p className="manual-data-title">
                    {table.icon && <ItemIcon name={table.icon} />}
                    <span>{table.title}</span>
                </p>
            )}

            <div className="manual-data-scroll">
                <table className="manual-table">
                    <thead>
                        <tr>
                            {table.columns.map(col => {
                                const active = sort?.key === col.key
                                return (
                                    <th
                                        key={col.key}
                                        className={[
                                            col.align === 'right' ? 'align-right' : '',
                                            'is-sortable',
                                            active ? 'is-sorted' : '',
                                        ].filter(Boolean).join(' ') || undefined}
                                        aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}
                                    >
                                        <button
                                            type="button"
                                            className="manual-th-sort"
                                            onClick={() => setSort(prev => {
                                                // Third click returns to the order the
                                                // query chose, which is usually by level
                                                // and is often what you want back.
                                                if (prev?.key !== col.key) return { key: col.key, dir: 1 }
                                                if (prev.dir === 1) return { key: col.key, dir: -1 }
                                                return null
                                            })}
                                        >
                                            {col.label}
                                            <span className="manual-th-arrow" aria-hidden="true">
                                                {active ? (sort!.dir === 1 ? '▲' : '▼') : ''}
                                            </span>
                                        </button>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.map((row, i) => {
                            // A repeated leading value is dimmed rather than
                            // restated. Tables like the foraging habitats list
                            // eight finds under one habitat, and printing the
                            // habitat eight times reads like a spreadsheet
                            // export. Grouping them makes the shape of the data
                            // visible at a glance.
                            const firstKey = table.columns[0]?.key
                            const prev = i > 0 ? sortedRows[i - 1] : null
                            const grouped = !!prev && firstKey
                                && prev[firstKey] === row[firstKey]
                            return (
                            <tr key={i} className={grouped ? 'is-grouped' : undefined}>
                                {table.columns.map((col, ci) => {
                                    const iconName = col.icon ? String(row[col.icon] ?? '') : ''
                                    const muted = grouped && ci === 0
                                    // A column with an icon key is naming an
                                    // item, which is exactly the set of cells
                                    // worth linking. Nothing else has to be
                                    // marked up, and a query that adds an icon
                                    // gets its links for free.
                                    const linksTo = iconName || ''
                                    return (
                                        <td
                                            key={col.key}
                                            className={
                                                [
                                                    col.align === 'right' ? 'align-right' : '',
                                                    iconName ? 'has-icon' : '',
                                                    ci === 0 ? 'is-subject' : '',
                                                    muted ? 'is-repeat' : '',
                                                ].filter(Boolean).join(' ') || undefined
                                            }
                                        >
                                            {iconName && <ItemIcon name={iconName} />}
                                            {linksTo ? (
                                                <button
                                                    className="manual-item-link"
                                                    onClick={() => window.dispatchEvent(
                                                        new CustomEvent('talaran:manual-item', { detail: { name: linksTo } }),
                                                    )}
                                                >
                                                    {row[col.key] ?? '\u2014'}
                                                </button>
                                            ) : (
                                                <span>{row[col.key] ?? '\u2014'}</span>
                                            )}
                                        </td>
                                    )
                                })}
                            </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {table.note && <p className="manual-data-note">{table.note}</p>}
        </div>
    )
}
