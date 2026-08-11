import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api'

// Loot log content. The shell (launcher, tabs, close) lives in LogPanel.tsx.
//
// Built as an icon grid rather than a list of names: a session produces hundreds
// of rows of a dozen distinct things, and a picture with a number on it is read
// at a glance where a column of text has to be read line by line.

interface Entry {
    kind: 'item' | 'xp'
    name: string
    amount: number
    lastAt: string
    value: number | null
}

interface Source {
    source: string
    actions: number
    firstAt: string
    lastAt: string
    items: Entry[]
    xp: Entry[]
    totalValue: number | null
}

interface LootLogData {
    sources: Source[]
    totals: { items: number; xp: Array<{ skill: string; xp: number }>; value: number | null }
    since: string | null
}

interface LootLogProps {
    refreshKey: number
}

const REFETCH_THROTTLE_MS = 2000

function fmtAmount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    if (n >= 10_000) return `${Math.round(n / 1000)}K`
    return n.toLocaleString()
}

function fmtSince(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    const sameDay = d.toDateString() === new Date().toDateString()
    return sameDay
        ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' '
        + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Initials for an item with no art yet, so a tile is never an empty square. */
function initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/**
 * One tile: art, or a labelled placeholder when the art does not exist yet.
 *
 * Hiding a broken image (the pattern used elsewhere in the client) leaves the
 * count floating over nothing in a grid. Talaran has far more items than icons,
 * and every new skill ships before its art, so missing art is a permanent state
 * that has to look deliberate rather than broken.
 */
function Tile({ src, label, amount, title }: {
    src: string; label: string; amount: number; title: string
}) {
    const [failed, setFailed] = useState(false)
    return (
        <div className="loot-tile" title={title}>
            {failed
                ? <span className="loot-tile-fallback">{initials(label)}</span>
                : <img src={src} alt="" className="loot-tile-img" onError={() => setFailed(true)} />}
            <span className="loot-tile-count">{fmtAmount(amount)}</span>
        </div>
    )
}

export default function LootLog({ refreshKey }: LootLogProps) {
    const [data, setData] = useState<LootLogData | null>(null)
    const [error, setError] = useState('')
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
    const [sort, setSort] = useState<'recent' | 'largest'>('recent')
    const [confirmClear, setConfirmClear] = useState(false)
    const lastFetch = useRef(0)

    const load = useCallback(async () => {
        try {
            setData(await apiFetch<LootLogData>('/api/loot-log'))
            setError('')
        } catch {
            setError('Could not read the log.')
        }
    }, [])

    useEffect(() => { load() }, [load])

    // Actions complete every few seconds on a fast skill, so refetching on each
    // one would hammer the endpoint for a panel nobody is staring at that hard.
    useEffect(() => {
        const now = Date.now()
        const wait = Math.max(0, REFETCH_THROTTLE_MS - (now - lastFetch.current))
        const id = setTimeout(() => { lastFetch.current = Date.now(); load() }, wait)
        return () => clearTimeout(id)
    }, [refreshKey, load])

    async function clear(source?: string) {
        try {
            setData(await apiFetch<LootLogData>('/api/loot-log/clear', {
                method: 'POST',
                body: JSON.stringify(source ? { source } : {}),
            }))
            setConfirmClear(false)
        } catch {
            setError('Could not clear the log.')
        }
    }

    if (error) return <p className="loot-empty">{error}</p>
    if (!data) return <p className="loot-empty">Reading the log…</p>

    if (data.sources.length === 0) {
        return (
            <p className="loot-empty">
                Nothing gathered yet. Everything you earn from here on will be listed.
            </p>
        )
    }

    const sources = [...data.sources].sort((a, b) => (
        sort === 'recent'
            ? b.lastAt.localeCompare(a.lastAt)
            : b.items.reduce((n, i) => n + i.amount, 0) - a.items.reduce((n, i) => n + i.amount, 0)
    ))

    return (
        <div className="loot-wrap">
            <div className="loot-summary">
                <div className="loot-summary-line">
                    <span className="loot-total">{data.totals.items.toLocaleString()} items</span>
                    {/* Base worth, not a merchant's offer: a pawnbroker pays 35%
                        of this and a player shop lands nearer it. Null when
                        nothing in the log has a derived value yet. */}
                    {data.totals.value !== null && (
                        <span className="loot-value">{data.totals.value.toLocaleString()}g worth</span>
                    )}
                    {data.since && <span className="loot-since">since {fmtSince(data.since)}</span>}
                </div>
                {data.totals.xp.length > 0 && (
                    <div className="loot-xp-row">
                        {data.totals.xp.map(x => (
                            <span key={x.skill} className="loot-xp-chip">
                                {x.skill} <strong>{fmtAmount(x.xp)}</strong>
                            </span>
                        ))}
                    </div>
                )}
                <div className="loot-controls">
                    <button
                        className="loot-btn"
                        onClick={() => setSort(s => (s === 'recent' ? 'largest' : 'recent'))}
                        title="Change the order these are listed in"
                    >
                        {sort === 'recent' ? 'Recent' : 'Largest'}
                    </button>
                    {confirmClear ? (
                        <>
                            <button className="loot-btn danger" onClick={() => clear()}>Confirm</button>
                            <button className="loot-btn" onClick={() => setConfirmClear(false)}>Keep</button>
                        </>
                    ) : (
                        <button className="loot-btn" onClick={() => setConfirmClear(true)}>Clear all</button>
                    )}
                </div>
            </div>

            {sources.map(s => {
                const shut = collapsed[s.source]
                return (
                    <div key={s.source} className="loot-source">
                        <button
                            className="loot-source-head"
                            onClick={() => setCollapsed(c => ({ ...c, [s.source]: !c[s.source] }))}
                        >
                            <span className="loot-source-name">{s.source}</span>
                            {/* Worth of this source's haul, visible while the
                                section is collapsed so a long log can be scanned
                                for where the gold actually came from. */}
                            {s.totalValue !== null && (
                                <span className="loot-source-value">{s.totalValue.toLocaleString()}g</span>
                            )}
                            <span className="loot-source-actions">×{s.actions.toLocaleString()}</span>
                            <span className="loot-source-caret">{shut ? '▾' : '▴'}</span>
                        </button>

                        {!shut && (
                            <>
                                <div className="loot-grid">
                                    {s.items.map(it => (
                                        <Tile
                                            key={`i-${it.name}`}
                                            src={`/images/items/${it.name.replace(/ /g, '_')}.png`}
                                            label={it.name}
                                            amount={it.amount}
                                            title={it.value !== null
                                                ? `${it.name} ×${it.amount.toLocaleString()} — worth ${it.value.toLocaleString()}g`
                                                : `${it.name} ×${it.amount.toLocaleString()}`}
                                        />
                                    ))}
                                    {s.xp.map(x => (
                                        <Tile
                                            key={`x-${x.name}`}
                                            src={`/images/skills/${x.name.replace(/ /g, '_')}Skill.png`}
                                            label={x.name}
                                            amount={x.amount}
                                            title={`${x.amount.toLocaleString()} ${x.name} experience`}
                                        />
                                    ))}
                                </div>
                                <button
                                    className="loot-btn subtle"
                                    onClick={() => clear(s.source)}
                                    title="Remove just this activity from the log"
                                >
                                    Clear this
                                </button>
                            </>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
