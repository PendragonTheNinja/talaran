import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { currentSubscription, pushSupport, subscribeThisDevice, unsubscribeThisDevice } from '../lib/push'
import './SettingsPanel.css'
import ErrorLine from './ErrorLine'

interface PushConfig {
    publicKey: string | null
    types: { key: string; label: string; description: string; on: boolean }[]
    devices: number
}

/**
 * Settings > Game: push notifications (server services/pushNotify.ts). Each
 * device signs up on its own; which kinds arrive is one choice for the account.
 * They come only when the game is not on screen.
 */
export default function NotificationSetting() {
    const [config, setConfig] = useState<PushConfig | null>(null)
    const [subscribed, setSubscribed] = useState<boolean | null>(null)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState('')
    const [error, setError] = useState('')
    const support = pushSupport()

    const load = () => apiFetch<PushConfig>('/api/push').then(setConfig).catch(() => setError('Could not load notification settings.'))

    useEffect(() => {
        load()
        currentSubscription().then(s => setSubscribed(!!s)).catch(() => setSubscribed(false))
    }, [])

    const turnOn = async () => {
        if (!config?.publicKey) return
        setBusy(true); setError(''); setNote('')
        const r = await subscribeThisDevice(config.publicKey)
        setBusy(false)
        if ('error' in r) { setError(r.error); return }
        setSubscribed(true)
        load()
    }

    const turnOff = async () => {
        setBusy(true); setError(''); setNote('')
        await unsubscribeThisDevice()
        setBusy(false)
        setSubscribed(false)
        load()
    }

    const test = async () => {
        setError(''); setNote('')
        try {
            const r = await apiFetch<{ sent: number; devices: number }>('/api/push/test', { method: 'POST' })
            setNote(r.sent > 0 ? `Sent to ${r.sent} of your device${r.devices === 1 ? '' : 's'}.` : 'Nothing was delivered. Try turning this device off and on again.')
        } catch (err) {
            setError((err as { message?: string }).message || 'The test did not send.')
        }
    }

    const toggleType = async (key: string) => {
        if (!config) return
        const next = config.types.map(t => t.key === key ? { ...t, on: !t.on } : t)
        setConfig({ ...config, types: next })
        try {
            await apiFetch('/api/push/types', { method: 'PUT', body: JSON.stringify({ types: next.filter(t => t.on).map(t => t.key) }) })
        } catch {
            setError('That did not save. Try again.')
            load()
        }
    }

    return (
        <div className="settings-toggle-row bell-setting">
            <div className="settings-toggle-info">
                <span className="settings-toggle-label">Notifications</span>
                <span className="muted-text" style={{ fontSize: '13px' }}>
                    A notification on this device when the game needs you and you are not looking at it: the screen
                    is off, the browser is closed, or the game is in a tab behind another one. Each device is
                    turned on by itself; the kinds below apply to all of them.
                </span>

                {config && !config.publicKey ? (
                    <span className="muted-text" style={{ fontSize: '13px' }}>Notifications are not switched on for the game yet.</span>
                ) : support === 'needs-home-screen' ? (
                    <span className="muted-text" style={{ fontSize: '13px' }}>
                        On an iPhone or iPad, add Talaran to your home screen first (the Share button, then Add to Home
                        Screen), open it from there, and turn notifications on in its Settings.
                    </span>
                ) : support === 'unsupported' ? (
                    <span className="muted-text" style={{ fontSize: '13px' }}>This browser cannot show notifications.</span>
                ) : (
                    <div className="bell-setting-custom">
                        {subscribed ? (
                            <>
                                <span className="gold-text" style={{ fontSize: '13px' }}>On for this device.</span>
                                <button className="btn" disabled={busy} onClick={test}>Send a test</button>
                                <button className="btn" disabled={busy} onClick={turnOff}>Turn off here</button>
                            </>
                        ) : (
                            <button className="btn btn-gold" disabled={busy || subscribed === null || !config} onClick={turnOn}>
                                Notify this device
                            </button>
                        )}
                    </div>
                )}

                {config && config.publicKey && (
                    <div className="notify-types">
                        {config.types.map(t => (
                            <label key={t.key} className="notify-type">
                                <input type="checkbox" checked={t.on} onChange={() => toggleType(t.key)} />
                                <span>
                                    <span className="notify-type-label">{t.label}</span>
                                    <span className="muted-text notify-type-desc">{t.description}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                )}
                {note && <p className="muted-text" style={{ fontSize: '13px' }}>{note}</p>}
                <ErrorLine message={error} className="guild-error" />
            </div>
        </div>
    )
}
