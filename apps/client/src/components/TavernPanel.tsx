import { useState, useEffect, useCallback, Fragment } from 'react'
import { apiFetch } from '../lib/api'
import BalladRest from './BalladRest'
import './TavernPanel.css'
import { backdropClose } from '../lib/backdrop'
import ErrorLine from './ErrorLine'

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
    ballad?: string[]
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

interface Ballads {
    price: number
    cooldownDays: number
    inGuild: boolean
    guild: string | null
    blocked: string | null
    payFrom: 'storehouse' | 'purse' | null
    storehouseGold: number | null
    nextAllowedAt: string | null
    ballads: { id: number; text: string; sung: string | null; by: string | null; paidFrom: string; at: string }[]
}

const fmt = (n: number) => n.toLocaleString('en-US')

/** Small numbers as Wenna says them ("seven days"). */
function inWords(n: number): string {
    const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
    return words[n] ?? fmt(n)
}

/** The day key "2026-11-06" as "6th of November" (the composer's own wording). */
function dayName(dayKey: string): string {
    const [, m, d] = dayKey.split('-').map(Number)
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const suffix = d % 100 >= 11 && d % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[d % 10] ?? 'th'
    return `${d}${suffix} of ${months[m - 1]}`
}

/** The Ballads tab (docs/chronicle-spec.md §9): pay Wenna to sing of your guild. */
function BalladsTab() {
    const [data, setData] = useState<Ballads | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [confirming, setConfirming] = useState(false)
    const [busy, setBusy] = useState(false)

    const load = useCallback(() => {
        apiFetch<Ballads>('/api/chronicle/ballads')
            .then(setData)
            .catch(err => setError(err instanceof Error ? err.message : 'Wenna is busy.'))
    }, [])
    useEffect(() => { load() }, [load])

    const commission = async () => {
        setBusy(true)
        setError(null)
        try {
            await apiFetch('/api/chronicle/ballads', { method: 'POST' })
            setNotice('Paid. Wenna has the words, and she will sing it in the next tidings.')
            setConfirming(false)
            load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    if (!data) return <p className="tavern-scene">{error ?? 'Wenna is finding her lute.'}</p>
    return (
        <div className="tavern-ballads">
            <p className="tavern-say">
                "A song for your guild, sung in the tidings for the whole island to read. {fmt(data.price)} gold, and I'll not do the same guild twice in {inWords(data.cooldownDays)} days."
            </p>
            <ErrorLine message={error} className="tavern-error" />
            {notice && <p className="tavern-line">{notice}</p>}
            {data.inGuild && (
                <p className="tavern-scene">
                    {data.payFrom === 'storehouse'
                        ? `Paid from the ${data.guild} storehouse, which holds ${fmt(data.storehouseGold ?? 0)} gold.`
                        : `${data.guild} has no storehouse yet, so it comes from your own purse.`}
                </p>
            )}
            {data.blocked
                ? <p className="tavern-scene">{data.blocked}{data.nextAllowedAt ? ` (again from ${new Date(data.nextAllowedAt).toLocaleDateString()})` : ''}</p>
                : confirming
                    ? (
                        <div className="tavern-named-row">
                            <span className="tavern-line">Pay {fmt(data.price)} gold for a ballad?</span>
                            <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>Not yet</button>
                            <button className="btn btn-gold" onClick={commission} disabled={busy}>{busy ? 'Paying…' : 'Pay Wenna'}</button>
                        </div>
                    )
                    : <button className="btn btn-gold" onClick={() => { setNotice(null); setConfirming(true) }}>Commission a ballad</button>}

            {data.ballads.length > 0 && (
                <>
                    <p className="tavern-section">{data.guild}'s ballads</p>
                    {data.ballads.map(b => (
                        <div key={b.id} className="tavern-ballad">
                            <p className="tavern-line">{b.text}</p>
                            <p className="tavern-named-where">
                                {b.sung ? `Sung in the tidings for the ${dayName(b.sung)}` : 'Waiting for the next tidings'}
                                {b.by ? `, paid for by ${b.by}` : ''}.
                            </p>
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}
interface Named { name: string; days: { dayKey: string; title: string; inLines: boolean }[] }

const SECTION: Record<string, string> = {
    headline: 'The headline',
    island: 'Around the island',
    guilds: 'From the guilds',
    fallen: 'Of the fallen',
    maker: 'Word from the Maker',
    roll: 'The long roll',
    rumour: 'A rumour',
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

export default function TavernPanel({ onClose, selfName, onViewProfile, openOnDay }: {
    onClose: () => void
    selfName: string | null
    onViewProfile?: (playerId: number) => void
    /**
     * Open the book on this day (a chat line or the "Wenna sang of you"
     * notice). From anywhere on the island: the Wenna tab is shown only when
     * the reader stands in the tavern's town.
     */
    openOnDay?: string
}) {
    const [tab, setTab] = useState<'wenna' | 'book' | 'ballads'>(openOnDay ? 'book' : 'wenna')
    // Away from the tavern there is no Wenna to talk to, only the book.
    const [away, setAway] = useState(false)
    const [front, setFront] = useState<Front | null>(null)
    const [page, setPage] = useState<Page | null>(null)
    const [bookEmpty, setBookEmpty] = useState(false)
    const [days, setDays] = useState<DayRef[]>([])
    const [highlight, setHighlight] = useState<string | null>(null)
    const [named, setNamed] = useState<Named | null>(null)
    const [search, setSearch] = useState('')
    const [searchKind, setSearchKind] = useState<'player' | 'guild'>('player')
    const [error, setError] = useState<string | null>(null)
    // A name Wenna does not know: said under the search, gone after a few seconds.
    const [searchNote, setSearchNote] = useState<string | null>(null)

    useEffect(() => {
        if (!searchNote) return
        const t = setTimeout(() => setSearchNote(null), 5000)
        return () => clearTimeout(t)
    }, [searchNote])

    useEffect(() => {
        apiFetch<Front>('/api/chronicle/tavern')
            .then(setFront)
            .catch(err => {
                if (openOnDay) setAway(true)
                else setError(err instanceof Error ? err.message : 'The door is shut.')
            })
    }, [openOnDay])

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
            apiFetch<{ page: Page | null }>(`/api/chronicle/page${openOnDay ? `?day=${openOnDay}` : ''}`)
                .then(d => { setPage(d.page); setBookEmpty(!d.page) })
                .catch(err => setError(err instanceof Error ? err.message : 'The book will not open.'))
        }
        if (!days.length) apiFetch<{ days: DayRef[] }>('/api/chronicle/days').then(d => setDays(d.days)).catch(() => {})
    }, [tab, page, bookEmpty, days.length, openOnDay])

    const findNamed = (who: string, kind: 'player' | 'guild') => {
        if (!who.trim()) return
        setSearchNote(null)
        apiFetch<Named>(`/api/chronicle/named?${kind}=${encodeURIComponent(who.trim())}`)
            .then(setNamed)
            .catch(err => { setNamed(null); setSearchNote(err instanceof Error ? err.message : 'No such name.') })
    }

    const readPage = (dayKey: string) => {
        setTab('book')
        openPage(dayKey)
    }

    return (
        <div className="tavern-overlay" {...backdropClose(onClose)}>
            <div className="tavern-modal" onClick={e => e.stopPropagation()}>
                <div className="tavern-header">
                    <h2>{away ? 'The Chronicle' : front?.tavern.name ?? 'The Salty Sloth'}</h2>
                    <button className="tavern-close" onClick={onClose}>✕</button>
                </div>

                {!away && (
                    <div className="tavern-tabs">
                        <button className={`tavern-tab ${tab === 'wenna' ? 'active' : ''}`} onClick={() => setTab('wenna')}>Wenna</button>
                        <button className={`tavern-tab ${tab === 'book' ? 'active' : ''}`} onClick={() => setTab('book')}>The Chronicle</button>
                        <button className={`tavern-tab ${tab === 'ballads' ? 'active' : ''}`} onClick={() => setTab('ballads')}>Ballads</button>
                    </div>
                )}

                <ErrorLine message={error} className="tavern-error" />

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

                {tab === 'ballads' && <BalladsTab />}

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
                                                {l.ballad && <BalladRest stanzas={l.ballad} />}
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
                                    onChange={e => { setSearch(e.target.value); setSearchNote(null) }}
                                    onKeyDown={e => { if (e.key === 'Enter') findNamed(search, searchKind) }}
                                />
                                <button className="btn btn-gold" onClick={() => findNamed(search, searchKind)}>Look</button>
                            </div>
                            <ErrorLine message={searchNote} className="tavern-error" />
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
