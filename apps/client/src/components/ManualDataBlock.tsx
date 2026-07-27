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
                <p>The Geographer's ledger for this could not be read just now.</p>
            </div>
        )
    }

    if (!table || table.rows.length === 0) {
        return (
            <div className="manual-data manual-data-empty">
                <p>The Geographer's ledger for this is not yet copied.</p>
            </div>
        )
    }

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
                            {table.columns.map(col => (
                                <th
                                    key={col.key}
                                    className={col.align === 'right' ? 'align-right' : undefined}
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.rows.map((row, i) => (
                            <tr key={i}>
                                {table.columns.map(col => {
                                    const iconName = col.icon ? String(row[col.icon] ?? '') : ''
                                    return (
                                        <td
                                            key={col.key}
                                            className={
                                                [
                                                    col.align === 'right' ? 'align-right' : '',
                                                    iconName ? 'has-icon' : '',
                                                ].filter(Boolean).join(' ') || undefined
                                            }
                                        >
                                            {iconName && <ItemIcon name={iconName} />}
                                            <span>{row[col.key] ?? '\u2014'}</span>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {table.note && <p className="manual-data-note">{table.note}</p>}
        </div>
    )
}
