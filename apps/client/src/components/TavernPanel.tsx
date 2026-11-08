import { useState, useEffect, useCallback, Fragment } from 'react'
import { apiFetch } from '../lib/api'
import './TavernPanel.css'

// The Salty Sloth (docs/chronicle-spec.md §2, step 3): Wenna's tab, with what
// she has heard today and nobody's name in it, and the book of pages, each a
// day she set down at midnight. Names in the book open that player's profile.

interface Front {
    tavern: { id: number; name: string; description: string | null }
    greeting: string | null
    today: string[]
    latest: { dayKey: string; title: string; headline: string | null } | null
}

interface Line {
    section: string
    text: string
    struck: boolean
    names: { playerId: number; name: string }[]
    guilds: { guildId: number; name: string }[]
}

interface Page {
    dayKey: string
    title: string
    headline: string | null
    quiet: boolean
    lines: Line[]
    prev: string | null
    next: string | null
}

interface DayRef { dayKey: string; title: string; headline?: string | null }
interface Named { name: string; days: { dayKey: string; title: string; inLines: boolean }[] }

const SECTION: Record<string, string> = {
    headline: 'The headline',
    island: 'Around the island',
    guilds: 'From the guilds',
    fallen: 'Of the fallen',
    maker: 'Word from the Maker',
    roll: 'The long roll',
}

function escape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A line's text with every name it carries made a link, and one name picked out. */
function LineText({ line, highlight, onViewProfile }: { line: Line; highlight: string | null; onViewProfile?: (id: number) => void }) {
    const names = [...line.names].sort((a, b) => b.name.length - a.name.length)
    if (!names.length) return <>{line.text}</>
    const byName = new Map(names.map(n => [n.name, n.playerId]))
    const parts = line.text.split(new RegExp(`(${names.map(n => escape(n.name)).join('|')})`, 'g'))
    return (
        <>
            {parts.map((part, i) => {
                const id = byName.get(part)
                if (id === undefined) return <Fragment key={i}>{part}</Fragment>
                return (
                    <button
                        key={i}
                        type="button"
                        className={`tavern-name${highlight && part.toLowerCase() === highlight.toLowerCase() ? ' picked' : ''}`}
                        onClick={() => onViewProfile?.(id)}
                    >
                        {part}
                    </button>
                )
            })}
        </>
    )
}

export default function TavernPanel({ onClose, selfName, onViewProfile }: {
    onClose: () => void
    selfName: string | null
    onViewProfile?: (playerId: number) => void
}) {
    const [tab, setTab] = useState<'wenna' | 'book'>('wenna')
    const [front, setFront] = useState<Front | null>(null)
    const [page, setPage] = useState<Page | null>(null)
    const [bookEmpty, setBookEmpty] = useState(false)
    const [days, setDays] = useState<DayRef[]>([])
    const [highlight, setHighlight] = useState<string | null>(null)
    const [named, setNamed] = useState<Named | null>(null)
    const [search, setSearch] = useState('')
    const [searchKind, setSearchKind] = useState<'player' | 'guild'>('player')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        apiFetch<Front>('/api/chronicle/tavern')
            .then(setFront)
            .catch(err => setError(err instanceof Error ? err.message : 'The door is shut.'))
    }, [])

    const openPage = useCallback((day: string | null, pick: string | null = null) => {
        setError(null)
        setHighlight(pick)
        apiFetch<{ page: Page | null }>(`/api/chronicle/page${day ? `?day=${day}` : ''}`)
            .then(d => { setPage(d.page); setBookEmpty(!d.page) })
            .catch(err => setError(err instanceof Error ? err.message : 'The book will not open.'))
    }, [])

    useEffect(() => {
        if (tab !== 'book') return
        // The newest page, the first time the book is opened.
        if (!page && !bookEmpty) {
            apiFetch<{ page: Page | null }>('/api/chronicle/page')
                .then(d => { setPage(d.page); setBookEmpty(!d.page) })
                .catch(err => setError(err instanceof Error ? err.message : 'The book will not open.'))
        }
        if (!days.length) apiFetch<{ days: DayRef[] }>('/api/chronicle/days').then(d => setDays(d.days)).catch(() => {})
    }, [tab, page, bookEmpty, days.length])

    const findNamed = (who: string, kind: 'player' | 'guild') => {
        if (!who.trim()) return
        setError(null)
        apiFetch<Named>(`/api/chronicle/named?${kind}=${encodeURIComponent(who.trim())}`)
            .then(setNamed)
            .catch(err => { setNamed(null); setError(err instanceof Error ? err.message : 'No such name.') })
    }

    const readPage = (dayKey: string) => {
        setTab('book')
        openPage(dayKey)
    }

    return (
        <div className="tavern-overlay" onClick={onClose}>
            <div className="tavern-modal" onClick={e => e.stopPropagation()}>
                <div className="tavern-header">
                    <h2>{front?.tavern.name ?? 'The Salty Sloth'}</h2>
                    <button className="tavern-close" onClick={onClose}>✕</button>
                </div>

                <div className="tavern-tabs">
                    <button className={`tavern-tab ${tab === 'wenna' ? 'active' : ''}`} onClick={() => setTab('wenna')}>Wenna</button>
                    <button className={`tavern-tab ${tab === 'book' ? 'active' : ''}`} onClick={() => setTab('book')}>The Chronicle</button>
                </div>

                {error && <p className="tavern-error">{error}</p>}

                {tab === 'wenna' && front && (
                    <div className="tavern-wenna">
                        {front.tavern.description && <p className="tavern-scene">{front.tavern.description}</p>}
                        {front.greeting && <p className="tavern-say">"{front.greeting}"</p>}
                        <p className="tavern-section">Today so far</p>
                        {front.today.map((t, i) => <p key={i} className="tavern-line">{t}</p>)}
                        {front.latest && (
                            <>
                                <p className="tavern-section">From the book: the {front.latest.title}</p>
                                {front.latest.headline && <p className="tavern-line tavern-headline">{front.latest.headline}</p>}
                                <button className="btn btn-gold" onClick={() => readPage(front.latest!.dayKey)}>Read the page</button>
                            </>
                        )}
                    </div>
                )}

                {tab === 'book' && (
                    <div className="tavern-book">
                        {bookEmpty && !page && (
                            <p className="tavern-scene">"Nothing written yet. Come back after midnight; the first page is always the hardest."</p>
                        )}

                        {page && (
                            <>
                                <div className="tavern-book-nav">
                                    <button className="btn" disabled={!page.prev} onClick={() => page.prev && openPage(page.prev)}>‹ Earlier</button>
                                    <select
                                        className="tavern-day-pick"
                                        value={page.dayKey}
                                        onChange={e => openPage(e.target.value)}
                                    >
                                        {(days.some(d => d.dayKey === page.dayKey) ? days : [{ dayKey: page.dayKey, title: page.title }, ...days]).map(d => (
                                            <option key={d.dayKey} value={d.dayKey}>{d.title}</option>
                                        ))}
                                    </select>
                                    <button className="btn" disabled={!page.next} onClick={() => page.next && openPage(page.next)}>Later ›</button>
                                </div>

                                <div className="tavern-page">
                                    {page.lines.map((l, i) => {
                                        const head = SECTION[l.section] && l.section !== page.lines[i - 1]?.section ? SECTION[l.section] : null
                                        return (
                                            <Fragment key={i}>
                                                {head && <p className="tavern-section">{head}</p>}
                                                <p className={`tavern-line tavern-line-${l.section}${l.struck ? ' struck' : ''}`}>
                                                    <LineText line={l} highlight={highlight} onViewProfile={onViewProfile} />
                                                </p>
                                            </Fragment>
                                        )
                                    })}
                                </div>
                            </>
                        )}

                        <div className="tavern-named">
                            <p className="tavern-section">Days in the book</p>
                            <div className="tavern-named-row">
                                {selfName && (
                                    <button className="btn" onClick={() => { setSearchKind('player'); setSearch(selfName); findNamed(selfName, 'player') }}>
                                        Days I was named
                                    </button>
                                )}
                                <select className="tavern-day-pick" value={searchKind} onChange={e => setSearchKind(e.target.value as 'player' | 'guild')}>
                                    <option value="player">Player</option>
                                    <option value="guild">Guild</option>
                                </select>
                                <input
                                    className="chat-input tavern-search"
                                    value={search}
                                    placeholder={searchKind === 'player' ? 'A name' : 'A guild'}
                                    onChange={e => setSearch(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') findNamed(search, searchKind) }}
                                />
                                <button className="btn btn-gold" onClick={() => findNamed(search, searchKind)}>Look</button>
                            </div>
                            {named && (
                                named.days.length === 0
                                    ? <p className="tavern-scene">"{named.name}? Not in the book yet. Give it time."</p>
                                    : (
                                        <ul className="tavern-named-list">
                                            {named.days.map(d => (
                                                <li key={d.dayKey}>
                                                    <button type="button" className="tavern-day-link" onClick={() => openPage(d.dayKey, named.name)}>
                                                        The {d.title}
                                                    </button>
                                                    <span className="tavern-named-where">{d.inLines ? 'in the tidings' : 'in the long roll'}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
