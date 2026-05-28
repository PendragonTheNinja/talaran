import { useState, useEffect, useRef } from 'react'
import './AuthScreen.css'
import { Link } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface AuthScreenProps {
  onLogin: (token: string, player: { id: number; username: string; email: string }) => void
}

interface NewsPost {
  id: number
  title: string
  body: string
  published_at: string
}

type AuthMode = 'login' | 'register'

export default function AuthScreen({ onLogin }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [news, setNews] = useState<NewsPost[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetch('${API_URL}/api/news/latest')
      .then(r => r.json())
      .then(d => {
        console.log('News loaded:', d.posts)
        setNews(d.posts || [])
      })
      .catch(err => console.error('News fetch failed:', err))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.3,
      alpha: Math.random(),
      speed: Math.random() * 0.003 + 0.001,
      phase: Math.random() * Math.PI * 2,
    }))

    let frame = 0
    let animId: number

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      stars.forEach(s => {
        s.alpha = 0.3 + 0.7 * Math.abs(Math.sin(frame * s.speed + s.phase))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(220, 190, 120, ${s.alpha * 0.6})`
        ctx.fill()
      })
      frame++
      animId = requestAnimationFrame(draw)
    }

    draw()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    const endpoint = mode === 'login'
      ? '${API_URL}/api/auth/login'
      : '${API_URL}/api/auth/register'

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

  const formatDate = (str: string) => new Date(str).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const latestNews = news[0]
  const olderNews = news.slice(1, 4)

  const [playerStats, setPlayerStats] = useState({ totalPlayers: 0, onlinePlayers: 0 })

  useEffect(() => {
    fetch('${API_URL}/api/player/stats')
      .then(r => r.json())
      .then(d => setPlayerStats(d))
      .catch(() => { })
  }, [])

  return (
    <div className="auth-screen">
      <canvas ref={canvasRef} className="auth-stars" />

      <div className="auth-vignette" />

      {/* Hero */}
      <div className="auth-hero">
        <div className="auth-hero-left">
          <div className="auth-logo-mark">✦</div>
          <h1 className="auth-wordmark">Talaran</h1>
          <p className="auth-tagline">A world forged in ambren and legend.<br />Your story begins on Taiar Island.</p>

          <div className="auth-pillars">
            <div className="auth-pillar">
              <span className="auth-pillar-icon">⛏</span>
              <span className="auth-pillar-label">Gather</span>
            </div>
            <div className="auth-pillar-divider">·</div>
            <div className="auth-pillar">
              <span className="auth-pillar-icon">🔨</span>
              <span className="auth-pillar-label">Craft</span>
            </div>
            <div className="auth-pillar-divider">·</div>
            <div className="auth-pillar">
              <span className="auth-pillar-icon">🗺</span>
              <span className="auth-pillar-label">Explore</span>
            </div>
            <div className="auth-pillar-divider">·</div>
            <div className="auth-pillar">
              <span className="auth-pillar-icon">⚔</span>
              <span className="auth-pillar-label">Conquer</span>
            </div>
          </div>

          <div className="auth-stats">
            <div className="auth-stat">
              <span className="auth-stat-number">{playerStats.totalPlayers}</span>
              <span className="auth-stat-label">Adventurers</span>
            </div>
            <div className="auth-stat-divider" />
            <div className="auth-stat">
              <span className="auth-stat-number" style={{ color: '#6ab87e' }}>{playerStats.onlinePlayers}</span>
              <span className="auth-stat-label">Online Now</span>
            </div>
            <div className="auth-stat-divider" />

            <a href="https://discord.gg/ceHFe8nEAB"
              target="_blank"
              rel="noopener noreferrer"
              className="auth-discord"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.053a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Discord
            </a>
          </div>
        </div>

        {/* Login form */}
        <div className="auth-form-wrap">
          <div className="auth-form-inner">
            <div className="auth-form-title">
              {mode === 'login' ? 'Enter the Realm' : 'Begin Your Journey'}
            </div>

            <div className="auth-tabs">
              <button
                className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => { setMode('login'); setError('') }}
              >Login</button>
              <button
                className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => { setMode('register'); setError('') }}
              >Register</button>
            </div>

            <div className="auth-fields">
              <div className="auth-field">
                <label className="auth-label">Username</label>
                <input
                  className="auth-input"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Your character name"
                  autoFocus
                />
              </div>

              {mode === 'register' && (
                <div className="auth-field">
                  <label className="auth-label">Email</label>
                  <input
                    className="auth-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    placeholder="your@email.com"
                  />
                </div>
              )}

              <div className="auth-field">
                <label className="auth-label">Password</label>
                <input
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button
              className="auth-submit"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Enter Talaran' : 'Create Character'}
            </button>

            {mode === 'register' && (
              <p className="auth-disclaimer">
                By registering you agree to play fair and treat others with respect.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* News section */}
      {news.length > 0 && (
        <div className="auth-news">
          <div className="auth-news-inner">
            <div className="auth-news-header">
              <span className="auth-news-label">✦ Latest Updates</span>
            </div>

            <div className="auth-news-grid">
              {latestNews && (
                <Link to="/news" className="auth-news-featured" style={{ textDecoration: 'none' }}>
                  <span className="auth-news-date">{formatDate(latestNews.published_at)}</span>
                  <h3 className="auth-news-title">{latestNews.title}</h3>
                  <p className="auth-news-body">
                    {latestNews.body.length > 300
                      ? latestNews.body.slice(0, 300) + '...'
                      : latestNews.body}
                  </p>
                </Link>
              )}

              {olderNews.length > 0 && (
                <div className="auth-news-older">
                  <p className="auth-news-older-label">Previous Updates</p>
                  {olderNews.map(post => (
                    <Link to="/news" key={post.id} className="auth-news-older-item" style={{ textDecoration: 'none' }}>
                      <span className="auth-news-older-title">{post.title}</span>
                      <span className="auth-news-older-date">{formatDate(post.published_at)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="auth-footer">
        <span>© 2026 Talaran · Alpha</span>
        <span>·</span>
        <Link to="/news" className="auth-footer-link">News</Link>
        <span>·</span>
        <Link to="/highscores" className="auth-footer-link">Highscores</Link>
      </div>
    </div>
  )
}