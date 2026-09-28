import { useState, useEffect, useCallback, useRef } from 'react'
import ManualRenderer from './ManualRenderer'
import ManualItem from './ManualItem'
import ManualItemIndex from './ManualItemIndex'
import ManualSearch from './ManualSearch'
import { supportsReference, toReference, parseManual } from '../lib/manual'
import { apiFetch } from '../lib/api'
import {
    loadManifest,
    loadPage,
    buildCorpus,
    searchCorpus,
    type ManualManifest,
    type SearchHit,
} from '../lib/manual'

interface ManualBrowserProps {
    /** 'page' is the public /manual route; 'panel' is the in-game window. */
    variant: 'page' | 'panel'
    initialSection?: string
    initialSlug?: string
    /**
     * Changes on every request to open a page. Without it, asking for the page
     * already requested (the same item twice, after wandering elsewhere in the
     * Manual) changed no prop, so the Manual did not move.
     */
    targetSeq?: number
    /** Page variant reflects navigation into the URL; the panel doesn't. */
    onLocationChange?: (section: string | null, slug: string | null) => void
}

/**
 * Where the in-game manual was left: page and scroll, kept in sessionStorage
 * so it lasts the browser session. A player learning a new trade can close the
 * manual to act and reopen it to the same paragraph.
 */
interface Place { section: string | null; slug: string | null; scroll: number }
const PLACE_KEY = 'talaran:manual:place'

function readPlace(): Place | null {
    try { return JSON.parse(sessionStorage.getItem(PLACE_KEY) || 'null') } catch { return null }
}

function writePlace(place: Place): void {
    try { sessionStorage.setItem(PLACE_KEY, JSON.stringify(place)) } catch { /* storage blocked */ }
}

export default function ManualBrowser({
    variant,
    initialSection,
    initialSlug,
    targetSeq,
    onLocationChange,
}: ManualBrowserProps) {
    const [manifest, setManifest] = useState<ManualManifest | null>(null)
    // The in-game panel reopens where it was left (page and scroll), for the
    // rest of the browser session, unless it was opened AT a page, which wins.
    const restoring = variant === 'panel' && !initialSection && !initialSlug
    const [section, setSection] = useState<string | null>(() => initialSection || (restoring ? readPlace()?.section ?? null : null))
    const [slug, setSlug] = useState<string | null>(() => initialSlug || (restoring ? readPlace()?.slug ?? null : null))
    const bodyRef = useRef<HTMLDivElement | null>(null)
    const scrollToRestore = useRef<number | null>(restoring ? readPlace()?.scroll ?? null : null)

    const [content, setContent] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [query, setQuery] = useState('')
    const [hits, setHits] = useState<SearchHit[]>([])
    // Handed to the full Search page, so it opens already searching. It also
    // keys that page, so a second hand-off restarts it with the new words.
    const [searchSeed, setSearchSeed] = useState('')
    const [navOpen, setNavOpen] = useState(false)

    // Where you were before. Following a cross-reference and wanting to come
    // straight back is the commonest thing a reader does in a manual.
    const [history, setHistory] = useState<{ section: string | null; slug: string | null }[]>([])

    // Reference mode. Read from the account so it follows the player, and held
    // locally too so the toggle responds at once rather than after a round trip.
    const [reference, setReference] = useState(false)

    useEffect(() => {
        apiFetch<{ manualReferenceMode?: boolean }>('/api/settings')
            .then(d => setReference(!!d.manualReferenceMode))
            .catch(() => { /* logged out, or settings unavailable: guide as written */ })
    }, [])

    const toggleReference = () => {
        const next = !reference
        setReference(next)
        apiFetch('/api/settings/manual-mode', {
            method: 'POST',
            body: JSON.stringify({ manualReferenceMode: next }),
        }).catch(() => { /* the view already changed; the preference can wait */ })
    }

    // Manifest drives the whole nav — one fetch, once.
    useEffect(() => {
        loadManifest()
            .then(setManifest)
            .catch(() => setError('The manual index could not be read.'))
    }, [])

    // Follow prop changes so deep-linking into an already-open panel works.
    useEffect(() => {
        if (initialSection && initialSlug) {
            setSection(initialSection)
            setSlug(initialSlug)
        }
    }, [initialSection, initialSlug, targetSeq])

    useEffect(() => {
        if (!section || !slug) {
            setContent('')
            setLoading(false)
            return
        }

        let live = true
        setLoading(true)
        setError(null)

        loadPage(section, slug)
            .then(text => {
                if (!live) return
                setContent(text)
                setLoading(false)
            })
            .catch(() => {
                if (!live) return
                setError('That page is not in the manual yet.')
                setLoading(false)
            })

        return () => { live = false }
    }, [section, slug])

    // Remember the page for the next time the panel opens.
    useEffect(() => {
        if (variant === 'panel') writePlace({ section, slug, scroll: bodyRef.current?.scrollTop ?? 0 })
    }, [variant, section, slug])

    // Once the page has loaded: the first time after reopening, go back to
    // where the reader was; after that, every new page starts at the top.
    useEffect(() => {
        if (variant !== 'panel' || loading || !bodyRef.current) return
        bodyRef.current.scrollTop = scrollToRestore.current ?? 0
        scrollToRestore.current = null
    }, [variant, loading, section, slug])

    const go = useCallback((nextSection: string | null, nextSlug: string | null) => {
        setHistory(h => {
            // Don't stack a page on top of itself.
            if (h.length && h[h.length - 1].slug === slug && h[h.length - 1].section === section) return h
            return [...h, { section, slug }].slice(-25)
        })
        setSection(nextSection)
        setSlug(nextSlug)
        setQuery('')
        setHits([])
        setNavOpen(false)
        onLocationChange?.(nextSection, nextSlug)
        // Panel scrolls its own body; the page scrolls the window.
        if (variant === 'page') window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [onLocationChange, variant, section, slug])

    // Item pages are a section like any other, so back, history and the URL
    // all work without special cases.
    const openItem = useCallback((itemName: string) => go('item', itemName), [go])

    useEffect(() => {
        const onItem = (e: Event) => {
            const n = (e as CustomEvent<{ name: string }>).detail?.name
            if (n) openItem(n)
        }
        window.addEventListener('talaran:manual-item', onItem)
        return () => window.removeEventListener('talaran:manual-item', onItem)
    }, [openItem])

    const goBack = useCallback(() => {
        setHistory(h => {
            if (h.length === 0) return h
            const previous = h[h.length - 1]
            setSection(previous.section)
            setSlug(previous.slug)
            setQuery('')
            setHits([])
            onLocationChange?.(previous.section, previous.slug)
            if (variant === 'page') window.scrollTo({ top: 0, behavior: 'smooth' })
            return h.slice(0, -1)
        })
    }, [onLocationChange, variant])

    const onSearch = async (value: string) => {
        setQuery(value)
        if (!manifest || value.trim().length < 2) {
            setHits([])
            return
        }
        await buildCorpus(manifest)
        setHits(searchCorpus(value))
    }

    const currentSection = manifest?.sections.find(s => s.key === section) || null
    const currentPage = currentSection?.pages.find(p => p.slug === slug) || null

    // lib/markdown.ts strips id attributes, so headings can't be anchored through
    // the sanitiser. The rail scrolls to them by position instead, matching on
    // text, which needs no markup and cannot be sanitised away.
    // Built from what is actually on the page. Reference mode drops every
    // heading whose section was pure prose, so listing the raw file's headings
    // sent the rail to anchors that were no longer rendered.
    const headings = (() => {
        const inReference = reference && supportsReference(section || '')
        const source = inReference
            ? toReference(parseManual(content))
                .filter((n): n is { type: 'prose'; text: string } => n.type === 'prose')
                .map(n => n.text)
                .join('\n')
            : content
        return source
            .split('\n')
            .filter(line => line.startsWith('## '))
            .map(line => line.slice(3).trim())
    })()

    const scrollToHeading = (text: string) => {
        const root = document.querySelector(variant === 'page' ? '.manual--page' : '.manual--panel')
        const match = Array.from(root?.querySelectorAll('h2') || [])
            .find(h => h.textContent?.replace(/^✦\s*/, '').trim() === text)
        match?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    return (
        <div className={`manual manual--${variant}`}>
            {variant === 'panel' && (
                <button className="manual-nav-toggle btn" onClick={() => setNavOpen(o => !o)}>
                    ☰ Contents
                </button>
            )}

            <aside className={`manual-nav ${navOpen ? 'open' : ''}`}>
                <div className="manual-search">
                    <input
                        type="text"
                        className="manual-search-input"
                        placeholder="Search the manual…"
                        value={query}
                        onChange={e => onSearch(e.target.value)}
                    />
                </div>

                {/* This box finds Manual PAGES; items and tables are on the Search
                    page. Players searched here for an item, got nothing, and took
                    the item to be gone (Straw), so it hands the search on. */}
                {query.trim().length >= 2 && (
                    <button
                        className="manual-search-hit manual-search-handoff"
                        onClick={() => {
                            setSearchSeed(query.trim())
                            setQuery('')
                            setHits([])
                            go('search', 'all')
                        }}
                    >
                        <span className="manual-search-hit-title">Search items and tables for “{query.trim()}” ›</span>
                    </button>
                )}

                {hits.length > 0 ? (
                    <div className="manual-search-results">
                        <p className="manual-nav-label">
                            {hits.length} {hits.length === 1 ? 'result' : 'results'}
                        </p>
                        {hits.map(hit => (
                            <button
                                key={`${hit.section}/${hit.slug}`}
                                className="manual-search-hit"
                                onClick={() => go(hit.section, hit.slug)}
                            >
                                <span className="manual-search-hit-title">{hit.title}</span>
                                <span className="manual-search-hit-section">{hit.sectionTitle}</span>
                                <span className="manual-search-hit-excerpt">{hit.excerpt}</span>
                            </button>
                        ))}
                    </div>
                ) : query.trim().length >= 2 ? (
                    <p className="manual-nav-empty">No page mentions “{query}”.</p>
                ) : (
                    <nav className="manual-nav-tree">
                        <button
                            className={`manual-nav-home ${!slug ? 'active' : ''}`}
                            onClick={() => go(null, null)}
                        >
                            Contents
                        </button>

                        {/* Sits with Contents rather than inside a section: it is
                            not a page of the manual, it is the way into every
                            item in the game. */}
                        <button
                            className={`manual-nav-home ${section === 'search' ? 'active' : ''}`}
                            onClick={() => go('search', 'all')}
                        >
                            Search
                        </button>

                        <button
                            className={`manual-nav-home ${section === 'item' ? 'active' : ''}`}
                            onClick={() => go('item', null)}
                        >
                            Items
                        </button>

                        {manifest?.sections.map(s => (
                            <div key={s.key} className="manual-nav-section">
                                <p className="manual-nav-label">{s.title}</p>
                                {s.pages.length === 0 ? (
                                    <p className="manual-nav-pending">Not yet written.</p>
                                ) : (
                                    s.pages.map(p => (
                                        <button
                                            key={p.slug}
                                            className={`manual-nav-link ${section === s.key && slug === p.slug ? 'active' : ''}`}
                                            onClick={() => go(s.key, p.slug)}
                                        >
                                            {p.title}
                                        </button>
                                    ))
                                )}
                            </div>
                        ))}
                    </nav>
                )}
            </aside>

            <div
                className="manual-body"
                ref={bodyRef}
                onScroll={variant === 'panel' ? e => writePlace({ section, slug, scroll: e.currentTarget.scrollTop }) : undefined}
            >
                {error ? (
                    <div className="manual-message">
                        <p>{error}</p>
                    </div>
                ) : section === 'search' ? (
                    <article className="manual-article">
                        <div className="manual-article-head">
                            {history.length > 0 && (
                                <button className="manual-back" onClick={goBack}>
                                    ‹ Back
                                </button>
                            )}
                            <p className="manual-breadcrumb">Search</p>
                        </div>
                        <ManualSearch
                            key={searchSeed}
                            initialQuery={searchSeed}
                            onOpenPage={(sec, sl) => go(sec, sl)}
                            onOpenItem={openItem}
                        />
                    </article>
                ) : section === 'item' && !slug ? (
                    <article className="manual-article">
                        <div className="manual-article-head">
                            {history.length > 0 && (
                                <button className="manual-back" onClick={goBack}>
                                    ‹ Back
                                </button>
                            )}
                            <p className="manual-breadcrumb">Items</p>
                        </div>
                        <h1 className="manual-title">Every item in Talaran</h1>
                        <ManualItemIndex onOpen={openItem} />
                    </article>
                ) : !slug ? (
                    <ManualOverview manifest={manifest} onOpen={go} />
                ) : section === 'item' ? (
                    <article className="manual-article">
                        <div className="manual-article-head">
                            {history.length > 0 && (
                                <button className="manual-back" onClick={goBack}>
                                    ‹ Back
                                </button>
                            )}
                            <p className="manual-breadcrumb">Items</p>
                        </div>
                        <ManualItem name={slug} onNavigate={go} onOpenItem={openItem} />
                    </article>
                ) : loading ? (
                    <div className="manual-message">
                        <p>Turning the page…</p>
                    </div>
                ) : (
                    <article className="manual-article">
                        <div className="manual-article-head">
                            {history.length > 0 && (
                                <button className="manual-back" onClick={goBack}>
                                    ‹ Back
                                </button>
                            )}
                            <p className="manual-breadcrumb">{currentSection?.title}</p>
                        </div>

                        <h1 className="manual-title">{currentPage?.title}</h1>

                        {supportsReference(section || '') && (
                            <div className="manual-mode">
                                <span className="manual-mode-label">
                                    {reference ? 'Reference' : 'The Geographer'}
                                </span>
                                <button
                                    className={`manual-mode-switch ${reference ? 'on' : ''}`}
                                    onClick={toggleReference}
                                    role="switch"
                                    aria-checked={reference}
                                    aria-label="Reference mode"
                                    title={reference
                                        ? 'Showing tables and headings only. Switch back for the written guide.'
                                        : 'Switch to tables and headings only, without the writing.'}
                                >
                                    <span className="manual-mode-knob" />
                                </button>
                            </div>
                        )}

                        {headings.length > 2 && (
                            <nav className="manual-onpage">
                                <p className="manual-onpage-label">On this page</p>
                                {headings.map(h => (
                                    <button
                                        key={h}
                                        className="manual-onpage-link"
                                        onClick={() => scrollToHeading(h)}
                                    >
                                        {h}
                                    </button>
                                ))}
                            </nav>
                        )}

                        <ManualRenderer
                            content={content}
                            onNavigate={go}
                            reference={reference && supportsReference(section || '')}
                        />
                        {!(reference && supportsReference(section || '')) && (
                            <p className="manual-signature">— the Geographer</p>
                        )}
                    </article>
                )}
            </div>
        </div>
    )
}

function ManualOverview({
    manifest,
    onOpen,
}: {
    manifest: ManualManifest | null
    onOpen: (section: string, slug: string) => void
}) {
    if (!manifest) {
        return (
            <div className="manual-message">
                <p>Opening the manual…</p>
            </div>
        )
    }

    return (
        <div className="manual-overview">
            <p className="manual-overview-intro">
                I have kept notes on every trade I attempted on this island, and I attempted all of
                them. What follows is the tidy version.
            </p>

            {manifest.sections.map(s => (
                <section key={s.key} className="manual-overview-section">
                    <h2 className="manual-overview-heading">{s.title}</h2>
                    {s.blurb && <p className="manual-overview-blurb">{s.blurb}</p>}

                    {s.pages.length === 0 ? (
                        <p className="manual-nav-pending">These pages are still being copied.</p>
                    ) : (
                        <div className="manual-card-grid">
                            {s.pages.map(p => (
                                <button
                                    key={p.slug}
                                    className="manual-card"
                                    onClick={() => onOpen(s.key, p.slug)}
                                >
                                    <span className="manual-card-title">{p.title}</span>
                                    {p.blurb && <span className="manual-card-blurb">{p.blurb}</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            ))}
        </div>
    )
}
