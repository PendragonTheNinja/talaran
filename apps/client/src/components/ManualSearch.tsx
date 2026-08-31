import { useState, useEffect, useRef } from 'react'
import { getItemIcon } from '../lib/items'
import './ManualSearch.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface PageHit { section: string; slug: string; title: string; heading: string | null; snippet: string }
interface TableHit { query: string; label: string; columns: string[]; values: string[] }
interface ItemHit { name: string; type: string }

interface Results { pages: PageHit[]; tables: TableHit[]; items: ItemHit[] }

const EMPTY: Results = { pages: [], tables: [], items: [] }

/**
 * Search across the whole manual.
 *
 * Results stay in three lists rather than being ranked into one. The three
 * answer different questions and a reader almost always knows which they
 * wanted: an item, a passage, or a row of numbers. Merging them means the
 * wanted one can be pushed below twenty of the others.
 */
export default function ManualSearch({
    onOpenPage,
    onOpenItem,
}: {
    onOpenPage: (section: string, slug: string) => void
    onOpenItem: (name: string) => void
}) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Results>(EMPTY)
    const [busy, setBusy] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => { inputRef.current?.focus() }, [])

    useEffect(() => {
        const q = query.trim()
        if (q.length < 2) {
            setResults(EMPTY)
            setBusy(false)
            return
        }
        setBusy(true)
        // Debounced, and the flag guards against an earlier request landing
        // after a later one and overwriting fresher results.
        let live = true
        const t = setTimeout(() => {
            fetch(`${API_URL}/api/manual/search?q=${encodeURIComponent(q)}`)
                .then(r => (r.ok ? r.json() : EMPTY))
                .then(d => { if (live) { setResults(d); setBusy(false) } })
                .catch(() => { if (live) { setResults(EMPTY); setBusy(false) } })
        }, 220)
        return () => { live = false; clearTimeout(t) }
    }, [query])

    const total = results.pages.length + results.tables.length + results.items.length
    const searching = query.trim().length >= 2

    return (
        <div className="msearch">
            <div className="msearch-bar">
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search the manual, the tables, and every item"
                    aria-label="Search the manual"
                    autoComplete="off"
                />
                <span className="msearch-count">
                    {!searching ? '' : busy ? 'Looking' : `${total} ${total === 1 ? 'result' : 'results'}`}
                </span>
            </div>

            {!searching && (
                <p className="msearch-hint">
                    Type at least two letters. Names of items, places and trades all work, and so
                    does anything the Geographer wrote.
                </p>
            )}

            {searching && !busy && total === 0 && (
                <p className="msearch-hint">Nothing matches that.</p>
            )}

            {results.items.length > 0 && (
                <section className="msearch-group">
                    <h2 className="msearch-group-title">Items</h2>
                    <ul className="msearch-items">
                        {results.items.map(i => (
                            <li key={i.name}>
                                <button className="msearch-item" onClick={() => onOpenItem(i.name)}>
                                    <img
                                        src={getItemIcon(i.name)}
                                        alt=""
                                        aria-hidden="true"
                                        className="msearch-item-icon"
                                        loading="lazy"
                                        onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                                    />
                                    <span>{i.name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {results.pages.length > 0 && (
                <section className="msearch-group">
                    <h2 className="msearch-group-title">In the manual</h2>
                    <ul className="msearch-pages">
                        {results.pages.map((p, i) => (
                            <li key={`${p.section}/${p.slug}/${i}`}>
                                <button
                                    className="msearch-page"
                                    onClick={() => onOpenPage(p.section, p.slug)}
                                >
                                    <span className="msearch-page-title">
                                        {p.title}
                                        {p.heading && <span className="msearch-page-heading">{p.heading}</span>}
                                    </span>
                                    <span className="msearch-page-snippet">{p.snippet}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {results.tables.length > 0 && (
                <section className="msearch-group">
                    <h2 className="msearch-group-title">In the tables</h2>
                    <ul className="msearch-rows">
                        {results.tables.map((t, i) => (
                            <li className="msearch-row" key={`${t.query}/${i}`}>
                                <span className="msearch-row-label">{t.label}</span>
                                <span className="msearch-row-values">
                                    {t.values.map((v, n) => (
                                        v ? (
                                            <span className="msearch-cell" key={n}>
                                                <span className="msearch-cell-col">{t.columns[n]}</span>
                                                {v}
                                            </span>
                                        ) : null
                                    ))}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    )
}
