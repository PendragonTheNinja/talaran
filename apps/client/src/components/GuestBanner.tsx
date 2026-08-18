import { useState, useEffect, useCallback } from 'react'
import { Player } from '../types'
import './GuestBanner.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface GuestBannerProps {
    player: Player
    /** Fires after a successful upgrade so App can refresh with the real account. */
    onUpgraded: (token: string, player: Player) => void
    /** Set once the server has refused a request because the session lapsed. */
    expired: boolean
    onDismissExpired: () => void
}

/** mm:ss remaining, or null once the deadline has passed. */
function useCountdown(deadline: string | null | undefined): number | null {
    const [remaining, setRemaining] = useState<number | null>(null)

    useEffect(() => {
        if (!deadline) {
            setRemaining(null)
            return
        }
        const tick = () => {
            const ms = new Date(deadline).getTime() - Date.now()
            setRemaining(Math.max(0, Math.floor(ms / 1000)))
        }
        tick()
        const t = setInterval(tick, 1000)
        return () => clearInterval(t)
    }, [deadline])

    return remaining
}

function formatRemaining(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

export default function GuestBanner({
    player,
    onUpgraded,
    expired,
    onDismissExpired,
}: GuestBannerProps) {
    const [open, setOpen] = useState(false)
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const remaining = useCountdown(player.guest_expires_at)

    // An expiry refusal from the server opens the panel directly. There is
    // nothing else useful the player can do at that point, and burying the
    // one action behind another click helps nobody.
    useEffect(() => {
        if (expired) setOpen(true)
    }, [expired])

    const close = useCallback(() => {
        if (expired) return // nothing works until they claim or leave
        setOpen(false)
        setError('')
    }, [expired])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, close])

    const submit = async () => {
        setError('')
        setSaving(true)
        try {
            const res = await fetch(`${API_URL}/api/auth/upgrade`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('talaran_token')}`,
                },
                body: JSON.stringify({ username, email, password }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error || 'Could not claim this character.')
                return
            }
            onDismissExpired()
            setOpen(false)
            onUpgraded(data.token, data.player)
        } catch {
            setError('Could not connect to the server. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const low = remaining !== null && remaining <= 5 * 60

    return (
        <>
            <div className={`guest-bar ${low ? 'is-low' : ''}`}>
                <span className="guest-bar-tag">Guest</span>
                <span className="guest-bar-text">
                    {expired || remaining === 0
                        ? 'Your trial has ended. Everything you earned is safe for a week, so you can still claim this character.'
                        : 'Trial character. You can claim it now or after the time runs out, and nothing you earn is lost either way.'}
                </span>
                {remaining !== null && !expired && remaining > 0 && (
                    <span className="guest-bar-clock" title="Time left to play. Your character stays claimable for a week.">
                        {formatRemaining(remaining)}
                    </span>
                )}
                <button className="guest-bar-btn" onClick={() => setOpen(true)}>
                    Claim your character
                </button>
            </div>

            {open && (
                <div className="guest-modal-back" onClick={close}>
                    <div
                        className="guest-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Claim your character"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="guest-modal-head">Claim your character</div>
                        <div className="guest-modal-body">
                            <p className="guest-modal-lede">
                                Every skill, item and coin you have earned stays exactly where it is.
                                Pick a real name and this stops being a trial.
                            </p>

                            <div className="guest-field">
                                <label htmlFor="guest-username">Character name</label>
                                <input
                                    id="guest-username"
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="The name you want to keep"
                                    autoComplete="username"
                                />
                                <span className="guest-hint">
                                    Currently {player.username}. This is your chance to change it.
                                </span>
                            </div>

                            <div className="guest-field">
                                <label htmlFor="guest-email">Email</label>
                                <input
                                    id="guest-email"
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    autoComplete="email"
                                />
                            </div>

                            <div className="guest-field">
                                <label htmlFor="guest-password">Password</label>
                                <input
                                    id="guest-password"
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && submit()}
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                />
                            </div>

                            {error && <div className="guest-error">{error}</div>}

                            <button className="guest-submit" onClick={submit} disabled={saving}>
                                {saving ? 'Please wait' : 'Claim character'}
                            </button>

                            {!expired && (
                                <button className="guest-later" onClick={close}>
                                    Keep looking around
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}


/**
 * Shown once, straight after a claim. Lives outside GuestBanner deliberately:
 * the banner unmounts the moment the account stops being a guest, which is the
 * same moment this needs to appear.
 */
export function ClaimSuccessModal({ username, onClose }: { username: string; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className="guest-modal-back" onClick={onClose}>
            <div
                className="guest-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Character claimed"
                onClick={e => e.stopPropagation()}
            >
                <div className="guest-modal-head">Welcome to Talaran</div>
                <div className="guest-modal-body">
                    <p className="guest-modal-lede">
                        {username} is yours. Your skills, items and coin carried over exactly
                        as they were, and the clock is gone.
                    </p>
                    <ul className="guest-unlocked">
                        <li>Trade with other players, and buy from their shops</li>
                        <li>Sell and buy at the Taiar Marketplace</li>
                        <li>Raise a shop of your own at Talador</li>
                        <li>Talk in World, Region and Trade, not just Help</li>
                        <li>Post on the forums, and join a guild</li>
                        <li>Take your place on the highscores</li>
                    </ul>
                    <button className="guest-submit" onClick={onClose}>
                        Get back to it
                    </button>
                </div>
            </div>
        </div>
    )
}
