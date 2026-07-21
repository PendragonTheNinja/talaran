import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import './ResetPasswordPage.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Landing page for the emailed reset link: /reset-password?token=...
export default function ResetPasswordPage() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const token = params.get('token') || ''

    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState('')
    const [done, setDone] = useState(false)
    const [loading, setLoading] = useState(false)

    const submit = async () => {
        setError('')
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
        if (password !== confirm) { setError('Passwords do not match.'); return }
        setLoading(true)
        try {
            const res = await fetch(`${API_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error || 'Could not reset your password.'); return }
            setDone(true)
            setTimeout(() => navigate('/'), 2500)
        } catch {
            setError('Could not connect to the server. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="reset-page">
            <div className="reset-card">
                <Link to="/" className="reset-home gold-text">← Talaran</Link>
                <h1>Reset Password</h1>

                {!token ? (
                    <p className="reset-error">This reset link is missing its token. Please use the link from your email, or request a new one from the login screen.</p>
                ) : done ? (
                    <p className="reset-success">
                        Your password has been reset. Taking you to the login screen…
                    </p>
                ) : (
                    <>
                        <p className="reset-hint">Choose a new password for your account.</p>
                        <div className="reset-field">
                            <label>New password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoFocus
                            />
                        </div>
                        <div className="reset-field">
                            <label>Confirm password</label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && submit()}
                                placeholder="••••••••"
                            />
                        </div>
                        {error && <div className="reset-error">{error}</div>}
                        <button className="reset-submit" onClick={submit} disabled={loading}>
                            {loading ? 'Resetting…' : 'Reset password'}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
