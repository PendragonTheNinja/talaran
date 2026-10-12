import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import './SettingsPanel.css'
import './CombatAwaySetting.css'

/**
 * How long a fight runs between bot checks (player_settings.
 * combat_bot_check_minutes, services/botCheck.ts). A check stops a fight
 * between one creature and the next until it is answered, so a shorter wait
 * is a safety stop: a fight left alone halts sooner, before a strong creature
 * can wear the player down. The choices come from the server.
 */
export default function CombatBotCheckSetting() {
    const [minutes, setMinutes] = useState<number | null>(null)
    const [choices, setChoices] = useState<number[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        apiFetch<{ combatBotCheckMinutes?: number; combatBotCheckChoices?: number[] }>('/api/settings')
            .then(d => {
                setChoices(d.combatBotCheckChoices ?? [])
                setMinutes(d.combatBotCheckMinutes ?? null)
            })
            .catch(() => setError('Could not load this setting.'))
    }, [])

    const choose = async (value: number) => {
        if (value === minutes) return
        setBusy(true)
        setError('')
        try {
            await apiFetch('/api/settings/combat-bot-check', { method: 'POST', body: JSON.stringify({ minutes: value }) })
            setMinutes(value)
        } catch {
            setError('That did not save. Try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="settings-toggle-row combat-away combat-bot-check">
            <div className="settings-toggle-info">
                <span className="settings-toggle-label">Bot Check While Fighting</span>
                <span className="muted-text" style={{ fontSize: '13px' }}>
                    How long you fight before a bot check. The check pauses your fight between one creature and the
                    next until you answer it, and nothing can hit you while it waits. A shorter time stops a fight you
                    have walked away from sooner, so you can take on creatures that would wear you down over a longer one.
                    Other actions always check every 30 minutes.
                </span>
                <div className="combat-bot-check-choices">
                    {choices.map(m => (
                        <button
                            key={m}
                            className={`settings-toggle-btn ${m === minutes ? 'active' : ''}`}
                            disabled={busy || minutes === null}
                            onClick={() => choose(m)}
                        >
                            {m} min
                        </button>
                    ))}
                </div>
                {error && <span className="combat-away-error">{error}</span>}
            </div>
        </div>
    )
}
