import { useState, useEffect, useMemo } from 'react'
import { getItemIcon } from '../lib/items'
import './ManualItemIndex.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface IndexItem {
    name: string
    type: string
    subtype: string | null
    tier: number | null
    quality: string | null
}

const sentence = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)

/**
 * Every item, searchable.
 *
 * Item pages were previously reachable only by clicking a name inside a table,
 * which meant most items had a page nobody could get to. This is the front door.
 *
 * The whole list is fetched once and filtered in the browser. At a couple of
 * hundred items that is a few kilobytes and the search responds on the
 * keystroke, which matters far more here than saving the bytes: somebody
 * looking up an item usually knows roughly what it is called and wants to stop
 * typing as soon as they see it.
 */
export default function ManualItemIndex({ onOpen }: { onOpen: (name: string) => void }) {
    const [items, setItems] = useState<IndexItem[]>([])
    const [query, setQuery] = useState('')
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

    useEffect(() => {
        fetch(`${API_URL}/api/manual/items`)
            .then(r => (r.ok ? r.json() : Promise.reject()))
            .then(d => { setItems(d.items || []); setState('ready') })
            .catch(() => setState('error'))
    }, [])

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase()
        // Matches the type and subtype too, so "ore" finds every ore and "bow"
        // finds the bows without anyone having to know the exact name.
        const hits = q
            ? items.filter(i =>
                i.name.toLowerCase().includes(q)
                || i.type.toLowerCase().includes(q)
                || (i.subtype || '').toLowerCase().includes(q))
            : items

        const byType = new Map<string, IndexItem[]>()
        for (const i of hits) {
            byType.set(i.type, [...(byType.get(i.type) || []), i])
        }
        return [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    }, [items, query])

    const total = groups.reduce((n, [, list]) => n + list.length, 0)

    return (
        <div className="mindex">
            <div className="mindex-search">
                <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search every item"
                    aria-label="Search items"
                    autoComplete="off"
                />
                <span className="mindex-count">
                    {state === 'loading' ? '' : `${total} ${total === 1 ? 'item' : 'items'}`}
                </span>
            </div>

            {state === 'error' && (
                <p className="mindex-message">The index could not be read just now.</p>
            )}

            {state === 'ready' && total === 0 && (
                <p className="mindex-message">Nothing matches that.</p>
            )}

            {groups.map(([type, list]) => (
                <section className="mindex-group" key={type}>
                    <h2 className="mindex-group-title">{sentence(type)}</h2>
                    <ul className="mindex-list">
                        {list.map(i => (
                            <li key={i.name}>
                                <button className="mindex-item" onClick={() => onOpen(i.name)}>
                                    <img
                                        src={getItemIcon(i.name)}
                                        alt=""
                                        aria-hidden="true"
                                        className="mindex-icon"
                                        loading="lazy"
                                        onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                                    />
                                    <span className="mindex-name">{i.name}</span>
                                    {i.tier ? <span className="mindex-tier">Tier {i.tier}</span> : null}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    )
}
