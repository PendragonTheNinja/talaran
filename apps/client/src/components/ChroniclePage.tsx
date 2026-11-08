import { useState, useEffect, Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import './NewsPage.css'
import './TavernPanel.css'

// talaran.net/chronicle (docs/chronicle-spec.md §2, step 4): Wenna's book,
// read-only, for anyone, one link per day (/chronicle/2026-11-04). Plain
// fetch, never apiFetch: a logged-out visitor must not be sent home
// (CLAUDE.md §7). The News page's frame, the tavern book's lines.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface Line { section: string; text: string; struck: boolean }
interface Page { dayKey: string; title: string; lines: Line[]; prev: string | null; next: string | null }
interface DayRef { dayKey: string; title: string; headline: string | null }

const SECTION: Record<string, string> = {
    headline: 'The headline',
    island: 'Around the island',
    guilds: 'From the guilds',
    fallen: 'Of the fallen',
    maker: 'Word from the Maker',
    roll: 'The long roll',
    rumour: 'A rumour',
}

export default function ChroniclePage() {
    const { day } = useParams<{ day?: string }>()
    const [page, setPage] = useState<Page | null>(null)
    const [days, setDays] = useState<DayRef[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch(`${API_URL}/api/chronicle/public/days`)
            .then(r => r.json())
            .then(d => setDays(d.days || []))
            .catch(() => { })
    }, [])

    useEffect(() => {
        const wanted = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `?day=${day}` : ''
        fetch(`${API_URL}/api/chronicle/public/page${wanted}`)
            .then(r => r.json())
            .then(d => setPage(d.page ?? null))
            .catch(() => setPage(null))
            .finally(() => setLoading(false))
    }, [day])

    return (
        <div className="news-page">
            <div className="news-page-header">
                <Link to="/" className="news-page-back">
                    <span className="news-page-wordmark">Talaran</span>
                </Link>
                <nav className="news-page-nav">
                    <Link to="/" className="news-page-nav-link">Play</Link>
                    <Link to="/news" className="news-page-nav-link">News</Link>
                    <Link to="/chronicle" className="news-page-nav-link active">Chronicle</Link>
                </nav>
            </div>

            <div className="news-page-hero">
                <p className="news-page-eyebrow">As told at the Salty Sloth, Talador</p>
                <h1 className="news-page-title">The Chronicle</h1>
                <p className="news-page-subtitle">Wenna Halloway's tidings of Talaran, one page for every day</p>
            </div>

            {loading ? (
                <div className="news-page-loading"><p className="news-page-loading-text">Fetching the book...</p></div>
            ) : !page ? (
                <div className="news-page-empty"><p>Nothing written yet. The first page comes after a midnight.</p></div>
            ) : (
                <div className="news-page-body">
                    <div className="news-page-sidebar">
                        <p className="news-page-sidebar-label">Every page</p>
                        {days.map(d => (
                            <Link
                                key={d.dayKey}
                                to={`/chronicle/${d.dayKey}`}
                                className={`news-page-sidebar-item ${d.dayKey === page.dayKey ? 'active' : ''}`}
                            >
                                <span className="news-page-sidebar-title">The {d.title}</span>
                                {d.headline && <span className="news-page-sidebar-date">{d.headline}</span>}
                            </Link>
                        ))}
                    </div>

                    <div className="news-page-content">
                        <article className="news-page-article">
                            <header className="news-page-article-header">
                                <p className="news-page-article-date">{page.dayKey}</p>
                                <h2 className="news-page-article-title">The {page.title}</h2>
                            </header>
                            <div className="tavern-page">
                                {page.lines.map((l, i) => {
                                    const head = SECTION[l.section] && l.section !== page.lines[i - 1]?.section ? SECTION[l.section] : null
                                    return (
                                        <Fragment key={i}>
                                            {head && <p className="tavern-section">{head}</p>}
                                            <p className={`tavern-line tavern-line-${l.section}${l.struck ? ' struck' : ''}`}>{l.text}</p>
                                        </Fragment>
                                    )
                                })}
                            </div>
                            <div className="tavern-book-nav chronicle-page-nav">
                                {page.prev ? <Link className="btn" to={`/chronicle/${page.prev}`}>‹ Earlier</Link> : <span />}
                                {page.next ? <Link className="btn" to={`/chronicle/${page.next}`}>Later ›</Link> : <span />}
                            </div>
                        </article>
                    </div>
                </div>
            )}
        </div>
    )
}
