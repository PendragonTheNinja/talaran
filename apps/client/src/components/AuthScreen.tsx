import { useState } from 'react'
import './AuthScreen.css'

interface AuthScreenProps {
  onLogin: (token: string, player: { id: number; username: string; email: string }) => void
}

type AuthMode = 'login' | 'register'

export default function AuthScreen({ onLogin }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    const endpoint = mode === 'login'
      ? 'http://localhost:3000/api/auth/login'
      : 'http://localhost:3000/api/auth/register'

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

      // Store token in localStorage
      localStorage.setItem('talaran_token', data.token)
      onLogin(data.token, data.player)

    } catch {
      setError('Could not connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-background" />

      <div className="auth-box panel">
        <h1 className="auth-title">Talaran</h1>
        <p className="auth-subtitle">
          {mode === 'login' ? 'Enter the realm' : 'Begin your journey'}
        </p>

        <div className="divider" />

        <div className="auth-tabs">
          <button
            className={`auth-tab btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
          >
            Login
          </button>
          <button
            className={`auth-tab btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError('') }}
          >
            Register
          </button>
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

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <button
          className="btn btn-gold auth-submit"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Enter Talaran' : 'Create Character'}
        </button>

        {mode === 'register' && (
          <p className="auth-disclaimer muted-text">
            By registering you agree to play fair and treat others with respect.
          </p>
        )}
      </div>
    </div>
  )
}