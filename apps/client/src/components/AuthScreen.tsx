import { useState, useEffect, useCallback } from 'react'
import { formatGameDateLong } from '../lib/time'
import './AuthScreen.css'
import { Link } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/* ────────────────────────────────────────────────────────────────
   SCREENSHOTS — drop files in apps/client/public/images/home/ and
   add a line here. 16:9 reads best. Order is the order they show.
   A file that fails to load drops itself from the strip, so a
   renamed or missing image never shows a broken frame.
   ──────────────────────────────────────────────────────────────── */
const SCREENSHOTS: { src: string; caption: string }[] = [
    { src: '/images/home/fishing.jpg', caption: 'Luxmere: Freshwater fishing.' },
    { src: '/images/home/forum.jpg', caption: 'The player forum: fostering a great community' },
    { src: '/images/home/market.jpg', caption: 'Talador Marketplace: Player shops line the quay.' },
    { src: '/images/home/lanaivale.jpg', caption: 'Lanaivale: The lumberjack and forager\'s haven.' },
    { src: '/images/home/smithing.jpg', caption: 'Emberra. Forge the world\'s tools.' },
]

const SLIDE_MS = 5000

/* Trades a player can work today. Cooking and combat are seeded but
   not built, so they are named in the note under the grid instead. */
const TRADES = [
    'Woodcutting', 'Mining', 'Fishing', 'Foraging', 'Hunting', 'Carpentry',
    'Smithing', 'Farming', 'Husbandry', 'Crafting', 'Agility', 'Equitation',
]

const DISCORD_URL = 'https://discord.gg/ceHFe8nEAB'

interface AuthScreenProps {
    onLogin: (token: string, player: { id: number; username: string; email: string }) => void
}

interface NewsPost {
    id: number
    title: string
    body: string
    published_at: string
}

type AuthMode = 'login' | 'register' | 'forgot'

export default function AuthScreen({ onLogin }: AuthScreenProps) {
    const [mode, setMode] = useState<AuthMode>('login')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')
    const [loading, setLoading] = useState(false)
    const [news, setNews] = useState<NewsPost[]>([])
    const [playerStats, setPlayerStats] = useState({ totalPlayers: 0, onlinePlayers: 0 })
    const [slide, setSlide] = useState(0)
    const [shots, setShots] = useState(SCREENSHOTS)

    useEffect(() => {
        fetch(`${API_URL}/api/news/latest`)
            .then(r => r.json())
            .then(d => setNews(d.posts || []))
            .catch(err => console.error('News fetch failed:', err))
    }, [])

    useEffect(() => {
        fetch(`${API_URL}/api/player/stats`)
            .then(r => r.json())
            .then(d => setPlayerStats(d))
            .catch(() => { })
    }, [])

    /* Auto-advance. Held still for anyone who asked the OS to reduce motion. */
    useEffect(() => {
        if (shots.length < 2) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const t = setInterval(() => setSlide(s => (s + 1) % shots.length), SLIDE_MS)
        return () => clearInterval(t)
    }, [shots.length])

    const dropShot = useCallback((src: string) => {
        setShots(prev => {
            const next = prev.filter(s => s.src !== src)
            setSlide(s => (next.length ? s % next.length : 0))
            return next
        })
    }, [])

    const handleSubmit = async () => {
        setError('')
        setInfo('')
        setLoading(true)

        if (mode === 'forgot') {
            try {
                const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                })
                const data = await res.json()
                setInfo(data.message || 'If an account exists for that email, a reset link is on its way.')
            } catch {
                setError('Could not connect to the server. Please try again.')
            } finally {
                setLoading(false)
            }
            return
        }

        const endpoint = mode === 'login'
            ? `${API_URL}/api/auth/login`
            : `${API_URL}/api/auth/register`

        const body = mode === 'login'
            ? { username, password }
            : { username, email, password }

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Something went wrong')
                return
            }

            localStorage.setItem('talaran_token', data.token)
            onLogin(data.token, data.player)
        } catch {
            setError('Could not connect to the server. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const goRegister = () => {
        setMode('register')
        setError('')
        setInfo('')
        document.getElementById('ledger')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    const formatDate = (str: string) => formatGameDateLong(new Date(str))

    const latestNews = news[0]
    const olderNews = news.slice(1, 4)

    return (
        <div className="home">
            {/* ── Masthead ────────────────────────────────────── */}
            <header className="home-masthead">
                <div className="home-masthead-in">
                    <span className="home-brand">Talaran</span>
                    <nav className="home-mast-nav">
                        <Link to="/manual" className="home-mast-link">Manual</Link>
                        <Link to="/news" className="home-mast-link">News</Link>
                        <Link to="/highscores" className="home-mast-link">Highscores</Link>
                        <a
                            href={DISCORD_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="home-mast-link is-discord"
                        >Discord</a>
                    </nav>
                </div>
            </header>

            {/* ── Hero ────────────────────────────────────────── */}
            <section className="home-hero">
                <div className="home-chart" aria-hidden="true" />
                <div className="home-wrap">
                    <div className="home-hero-in">
                        <div className="home-hero-copy">
                            <p className="home-eyebrow">The World of Talaran · Open alpha</p>
                            <h1 className="home-wordmark">Talaran</h1>
                            <p className="home-subhead">A medieval skilling game that runs in a browser tab.</p>
                            <p className="home-lede">
                                Fell timber and saw it into boards. Set snares in and come back
                                for whatever walked into them. Raise cattle, soak the hides in bark liquor,
                                and sell the leather from <em>your own shop</em> at Talador.
                            </p>
                            <p className="home-lede-two">
                                No download, no client, no install. Your work keeps running thirty minutes after
                                walking away, and it is still waiting when you get back.
                            </p>
                            <div className="home-cta">
                                <button className="home-btn home-btn-gold" onClick={goRegister}>
                                    Create a character
                                </button>
                                <Link to="/manual" className="home-btn">Read the manual</Link>
                            </div>
                        </div>

                        {/* ── Ledger (auth) ── */}
                        <div className="home-ledger" id="ledger">
                            <div className="home-ledger-head">
                                {mode === 'login' ? 'Enter the realm' : mode === 'register' ? 'Begin your journey' : 'Reset password'}
                            </div>
                            <div className="home-ledger-body">
                                {mode !== 'forgot' && (
                                    <div className="home-tabs">
                                        <button
                                            className={`home-tab ${mode === 'login' ? 'on' : ''}`}
                                            onClick={() => { setMode('login'); setError(''); setInfo('') }}
                                        >Log in</button>
                                        <button
                                            className={`home-tab ${mode === 'register' ? 'on' : ''}`}
                                            onClick={() => { setMode('register'); setError(''); setInfo('') }}
                                        >Register</button>
                                    </div>
                                )}

                                {mode === 'forgot' && (
                                    <p className="home-hint">
                                        Enter the email on your account and we will send a link to reset your password.
                                    </p>
                                )}

                                {mode !== 'forgot' && (
                                    <div className="home-field">
                                        <label htmlFor="home-username">Character name</label>
                                        <input
                                            id="home-username"
                                            type="text"
                                            value={username}
                                            onChange={e => setUsername(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                            placeholder="Your character name"
                                            autoComplete="username"
                                        />
                                    </div>
                                )}

                                {(mode === 'register' || mode === 'forgot') && (
                                    <div className="home-field">
                                        <label htmlFor="home-email">Email</label>
                                        <input
                                            id="home-email"
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                            placeholder="your@email.com"
                                            autoComplete="email"
                                        />
                                    </div>
                                )}

                                {mode !== 'forgot' && (
                                    <div className="home-field">
                                        <label htmlFor="home-password">Password</label>
                                        <input
                                            id="home-password"
                                            type="password"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                            placeholder="••••••••"
                                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                        />
                                    </div>
                                )}

                                {error && <div className="home-error">{error}</div>}
                                {info && <div className="home-info">{info}</div>}

                                <button
                                    className="home-btn home-btn-gold home-btn-wide"
                                    onClick={handleSubmit}
                                    disabled={loading}
                                >
                                    {loading ? 'Please wait' : mode === 'login' ? 'Enter Talaran' : mode === 'register' ? 'Create character' : 'Send reset link'}
                                </button>

                                {mode === 'login' && (
                                    <p className="home-ledger-foot">
                                        <button className="home-linkbtn" onClick={() => { setMode('forgot'); setError(''); setInfo('') }}>
                                            Forgot your password?
                                        </button>
                                    </p>
                                )}

                                {mode === 'forgot' && (
                                    <p className="home-ledger-foot">
                                        <button className="home-linkbtn" onClick={() => { setMode('login'); setError(''); setInfo('') }}>
                                            Back to login
                                        </button>
                                    </p>
                                )}

                                {mode === 'register' && (
                                    <p className="home-disclaimer">
                                        By registering,  you agree to play fair and treat others with respect.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Tally strip ─────────────────────────────────── */}
            <div className="home-tally">
                <div className="home-tally-in">
                    <div className="home-tally-item">
                        <span className="home-tally-n">{playerStats.totalPlayers}</span>
                        <span className="home-tally-l">Adventurers</span>
                    </div>
                    <div className="home-tally-item">
                        <span className="home-tally-n live">{playerStats.onlinePlayers}</span>
                        <span className="home-tally-l">Online now</span>
                    </div>
                    <div className="home-tally-item">
                        <span className="home-tally-n">{TRADES.length}</span>
                        <span className="home-tally-l">Skills</span>
                    </div>
                    <a
                        className="home-tally-discord"
                        href={DISCORD_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.08.08 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.053a19.9 19.9 0 0 0 5.993 3.03.08.08 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03z" />
                        </svg>
                        Discord
                    </a>
                </div>
            </div>

            {/* ── The island (screenshots) ────────────────────── */}
            {shots.length > 0 && (
                <section className="home-band">
                    <div className="home-wrap">
                        <div className="home-sec-head">
                            <span className="home-sec-title">Our World</span>
                            <span className="home-sec-rule" />
                            <Link to="/manual" className="home-sec-more">See the map</Link>
                        </div>

                        <div className="home-casement">
                            <div className="home-frame">
                                <span className="home-nail tl" /><span className="home-nail tr" />
                                <span className="home-nail bl" /><span className="home-nail br" />
                                <div className="home-pane">
                                    {shots.map((s, i) => (
                                        <img
                                            key={s.src}
                                            className={`home-slide ${i === slide ? 'on' : ''}`}
                                            src={s.src}
                                            alt={s.caption}
                                            loading={i === 0 ? 'eager' : 'lazy'}
                                            onError={() => dropShot(s.src)}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="home-plate">
                                <span className="home-plate-cap">{shots[slide]?.caption}</span>
                                {shots.length > 1 && (
                                    <div className="home-dots">
                                        {shots.map((s, i) => (
                                            <button
                                                key={s.src}
                                                className={`home-dot ${i === slide ? 'on' : ''}`}
                                                onClick={() => setSlide(i)}
                                                aria-label={`View ${s.caption}`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* ── Trades ──────────────────────────────────────── */}
            <section className="home-band home-band-alt">
                <div className="home-wrap">
                    <div className="home-sec-head">
                        <span className="home-sec-title">Twelve skills, available now</span>
                        <span className="home-sec-rule" />
                    </div>
                    <div className="home-trades">
                        {TRADES.map(name => (
                            <div className="home-trade" key={name}>
                                <img src={`/images/skills/${name}Skill.png`} alt="" loading="lazy" />
                                <span>{name}</span>
                            </div>
                        ))}
                    </div>
                    <p className="home-trades-note">
                        Every one of these is live. Cooking and combat are being actively developed. 
                    </p>
                </div>
            </section>

            {/* ── News ────────────────────────────────────────── */}
            {news.length > 0 && (
                <section className="home-band">
                    <div className="home-wrap">
                        <div className="home-sec-head">
                            <span className="home-sec-title">From the Creator</span>
                            <span className="home-sec-rule" />
                            <Link to="/news" className="home-sec-more">All updates</Link>
                        </div>

                        <div className="home-news-grid">
                            {latestNews && (
                                <Link to="/news" className="home-news-lead">
                                    <span className="home-news-date">{formatDate(latestNews.published_at)}</span>
                                    <h2>{latestNews.title}</h2>
                                    <p>
                                        {latestNews.body.length > 300
                                            ? latestNews.body.slice(0, 300) + '...'
                                            : latestNews.body}
                                    </p>
                                </Link>
                            )}

                            {olderNews.length > 0 && (
                                <div className="home-news-side">
                                    <p className="home-news-side-h">Earlier</p>
                                    {olderNews.map(post => (
                                        <Link to="/news" key={post.id} className="home-news-item">
                                            <b>{post.title}</b>
                                            <span>{formatDate(post.published_at)}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* ── Footer ──────────────────────────────────────── */}
            <footer className="home-foot">
                <div className="home-foot-in">
                    <span className="home-foot-brand">Talaran</span>
                    <span>© 2026 · Alpha</span>
                    <span className="home-foot-sep">·</span>
                    <Link to="/terms">Terms</Link>
                    <span className="home-foot-sep">·</span>
                    <Link to="/refunds">Refunds</Link>
                    <span className="home-foot-sep">·</span>
                    <Link to="/privacy">Privacy</Link>
                </div>
            </footer>
        </div>
    )
}
