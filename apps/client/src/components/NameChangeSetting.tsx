import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { openSupport } from '../lib/talerStore'
import ConfirmModal from './ConfirmModal'
import './SettingsPanel.css'
import './AvatarSetting.css'

/**
 * Your name (Settings > Profile; server services/nameChange.ts). Everyone has
 * one change for free; more are bought in the store. A change waits a month
 * after the last, and the old name shows on the profile for a month.
 */

interface State { name: string; freeLeft: boolean; tokens: number; nextAt: string | null }

export default function NameChangeSetting() {
    const [state, setState] = useState<State | null>(null)
    const [name, setName] = useState('')
    const [error, setError] = useState('')
    const [confirm, setConfirm] = useState(false)
    const [busy, setBusy] = useState(false)

    const load = useCallback(() => {
        apiFetch<State>('/api/player/name-change').then(setState).catch(() => { })
    }, [])
    useEffect(() => { load() }, [load])

    if (!state) return null
    const canChange = (state.freeLeft || state.tokens > 0) && !state.nextAt
    const paying = state.freeLeft ? 'your free change' : `one of your ${state.tokens} bought change${state.tokens === 1 ? '' : 's'}`

    const submit = async () => {
        setConfirm(false)
        setBusy(true)
        setError('')
        try {
            const r = await apiFetch<{ name: string }>('/api/player/name-change', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
            // The name is in the stored session and in every panel: start the page afresh under it.
            try {
                const saved = JSON.parse(localStorage.getItem('talaran_player') ?? 'null')
                if (saved) localStorage.setItem('talaran_player', JSON.stringify({ ...saved, username: r.name }))
            } catch { /* the reload reads it from the server anyway */ }
            window.location.reload()
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'That did not work.')
            setBusy(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
            <span className="settings-toggle-label">Your Name</span>
            <span className="muted-text" style={{ fontSize: '13px' }}>
                You are <strong>{state.name}</strong>. Everyone may change their name once for free; more changes are in the store.
                Your old name shows on your profile for a month, and a change waits a month after the last.
            </span>
            {state.nextAt ? (
                <span className="muted-text" style={{ fontSize: '13px' }}>
                    Your next change is open from {new Date(state.nextAt).toLocaleDateString()}.
                </span>
            ) : canChange ? (
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                    <input className="chat-input" value={name} maxLength={32} placeholder="A new name" onChange={e => setName(e.target.value)} style={{ flex: '1 1 160px' }} />
                    <button className="btn btn-gold" disabled={busy || name.trim().length < 3} onClick={() => setConfirm(true)}>Change</button>
                </div>
            ) : (
                <div>
                    <button className="btn btn-gold" onClick={() => openSupport('perks')}>Buy a name change</button>
                </div>
            )}
            {error && <span className="avatar-error">{error}</span>}
            {confirm && (
                <ConfirmModal
                    message={`Change your name to ${name.trim()}? This uses ${paying}.`}
                    confirmLabel="Change It"
                    onConfirm={submit}
                    onCancel={() => setConfirm(false)}
                />
            )}
        </div>
    )
}
