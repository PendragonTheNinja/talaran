import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import './SettingsPanel.css'

/**
 * Supporter choices in Settings > Profile: the name color (perk:name_color;
 * server services/store.ts NAME_COLORS) and whether to appear on the museums'
 * Patrons plaque (player_settings.hide_from_patrons; services/supporter.ts).
 */

const LABELS: Record<string, string> = {
    ember: 'Ember', holly: 'Holly', sea: 'Sea', heather: 'Heather', frost: 'Frost', moss: 'Moss', rose: 'Rose', amber: 'Amber',
}

export default function SupporterSettings() {
    const [colors, setColors] = useState<string[]>([])
    const [color, setColor] = useState<string | null>(null)
    const [hasColor, setHasColor] = useState(false)
    const [hidden, setHidden] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        apiFetch<{ unlocks: string[]; nameColors: string[]; nameColor: string | null }>('/api/store')
            .then(s => { setColors(s.nameColors ?? []); setColor(s.nameColor ?? null); setHasColor(s.unlocks.includes('perk:name_color')) })
            .catch(() => { })
        apiFetch<{ hideFromPatrons?: boolean }>('/api/settings')
            .then(s => setHidden(!!s.hideFromPatrons))
            .catch(() => { })
    }, [])

    const chooseColor = async (next: string | null) => {
        setError('')
        try {
            await apiFetch('/api/store/name-color', { method: 'POST', body: JSON.stringify({ color: next }) })
            setColor(next)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'That did not work.')
        }
    }

    const togglePatrons = async () => {
        const next = !hidden
        setHidden(next)
        try {
            await apiFetch('/api/settings/patrons-plaque', { method: 'POST', body: JSON.stringify({ hide: next }) })
        } catch {
            setHidden(!next)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
            {hasColor && (
                <>
                    <span className="settings-toggle-label">Your Name's Color</span>
                    <span className="muted-text" style={{ fontSize: '13px' }}>How your name shows in chat and among the folk standing about.</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
                        <button className={`btn ${color === null ? 'btn-gold' : ''}`} onClick={() => chooseColor(null)}>Gold</button>
                        {colors.map(c => (
                            <button key={c} className={`btn ${color === c ? 'btn-gold' : ''}`} onClick={() => chooseColor(c)}>
                                <span className={`gold-text name-color-${c}`}>{LABELS[c] ?? c}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
            <label className="settings-toggle" style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={!hidden} onChange={togglePatrons} />
                <span>
                    <span className="settings-toggle-label">Show me on the Patrons plaque</span>
                    <span className="muted-text" style={{ fontSize: '13px', display: 'block' }}>
                        Each museum keeps a plaque of the ten who have given most to Talaran, by name and place, never by how much.
                    </span>
                </span>
            </label>
            {error && <span className="guild-error">{error}</span>}
        </div>
    )
}
