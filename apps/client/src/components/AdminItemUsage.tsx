import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'

interface UsageEntry {
    table: string
    label: string
    rowId: number
    rowName: string
    detail: string | null
}

interface UsageGroup {
    key: string
    title: string
    kind: 'source' | 'use'
    entries: UsageEntry[]
}

interface UsageData {
    item: { id: number; name: string; type: string | null; tier: number | null }
    groups: UsageGroup[]
}

interface Props {
    itemName: string
    onJump: (table: string, filterValue: string) => void
    onClose: () => void
}

const GROUP_ICONS: Record<string, string> = {
    produced: '🔨',
    dropped: '🎁',
    quest_reward: '📜',
    consumed: '🧪',
    trap: '🪤',
    station: '🛠',
    objective: '🎯',
    other: '🔗',
}

export default function AdminItemUsage({ itemName, onJump, onClose }: Props) {
    const [data, setData] = useState<UsageData | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setData(null)
        setError(null)
        apiFetch<UsageData>(`/api/admin/content/usage/item/${encodeURIComponent(itemName)}`)
            .then(setData)
            .catch((err: any) => setError(err.message || 'Could not load usage.'))
    }, [itemName])

    if (error) return <p className="guild-error">{error}</p>
    if (!data) return <p className="muted-text">Tracing references...</p>

    const sources = data.groups.filter(g => g.kind === 'source')
    const uses = data.groups.filter(g => g.kind === 'use')
    const totalSources = sources.reduce((n, g) => n + g.entries.length, 0)
    const totalUses = uses.reduce((n, g) => n + g.entries.length, 0)

    const renderGroup = (g: UsageGroup) => (
        <div key={g.key} className={`usage-section usage-${g.kind}`}>
            <p className="usage-section-title">
                {GROUP_ICONS[g.key] || '🔗'} {g.title}
                <span className="muted-text" style={{ marginLeft: '6px', fontWeight: 'normal' }}>{g.entries.length}</span>
            </p>
            <div className="usage-chips">
                {g.entries.map((e, i) => (
                    <button
                        key={`${e.table}-${e.rowId}-${i}`}
                        className="usage-chip"
                        title={`Open ${e.label} filtered to this row`}
                        onClick={() => onJump(e.table, e.rowName)}
                    >
                        <span className="usage-chip-name">{e.rowName}</span>
                        {e.detail && <span className="usage-chip-detail">{e.detail}</span>}
                        <span className="usage-chip-table">{e.label}</span>
                    </button>
                ))}
            </div>
        </div>
    )

    return (
        <div className="usage-view">
            <div className="usage-header">
                <div>
                    <p className="usage-item-name gold-text">{data.item.name}</p>
                    <p className="muted-text" style={{ fontSize: '13px' }}>
                        item #{data.item.id}
                        {data.item.type ? ` · ${data.item.type}` : ''}
                        {data.item.tier !== null ? ` · tier ${data.item.tier}` : ''}
                        {` · ${totalSources} source${totalSources === 1 ? '' : 's'} · ${totalUses} use${totalUses === 1 ? '' : 's'}`}
                    </p>
                </div>
                <button className="btn" style={{ fontSize: '12px', padding: '2px 10px' }} onClick={onClose}>← Back to items</button>
            </div>

            {totalSources === 0 && (
                <div className="usage-warning">
                    ⚠ Nothing in the world provides this item — no recipe produces it, nothing drops it,
                    no quest grants it. Players cannot obtain it.
                </div>
            )}

            {sources.map(renderGroup)}
            {uses.map(renderGroup)}

            {totalSources === 0 && totalUses === 0 && (
                <p className="muted-text" style={{ marginTop: '10px' }}>
                    No references anywhere. This item is fully orphaned — safe to remove, or waiting for content that uses it.
                </p>
            )}
            {totalUses === 0 && totalSources > 0 && (
                <p className="muted-text" style={{ marginTop: '10px', fontSize: '13px' }}>
                    Nothing consumes this item — fine for finished goods, worth a look for materials.
                </p>
            )}
        </div>
    )
}
