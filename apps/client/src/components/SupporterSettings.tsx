import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import './SettingsPanel.css'
import { PetBadge } from './Cosmetics'

/**
 * Supporter choices in Settings > Profile: the name color (perk:name_color;
 * server services/store.ts NAME_COLORS) and whether to support anonymously
 * (player_settings.hide_from_patrons; services/supporter.ts): off the Patrons
 * plaque, and an unnamed thank-you in chat.
 */

const LABELS: Record<string, string> = {
    ember: 'Ember', holly: 'Holly', sea: 'Sea', heather: 'Heather', frost: 'Frost', moss: 'Moss', rose: 'Rose', amber: 'Amber',
}

interface Cosmetics {
    frames: { key: string; name: string }[]
    backdrops: { key: string; name: string }[]
    signs: { key: string; name: string }[]
    awnings: string[]
    emotes: string[]
    frame: string | null
    backdrop: string | null
    sign: string | null
    awning: string | null
}
interface Pets { worn: string | null; pets: { key: string; name: string; emoji: string; skill: string | null; kind: string; owned: boolean }[] }

/** One row of buttons: none, then each owned choice. */
function Picker({ label, hint, none, options, value, onPick }: {
    label: string; hint: string; none: string
    options: { key: string; name: string }[]; value: string | null; onPick: (k: string | null) => void
}) {
    if (!options.length) return null
    return (
        <>
            <span className="settings-toggle-label">{label}</span>
            <span className="muted-text" style={{ fontSize: '13px' }}>{hint}</span>
            <div className="cosmetic-picker">
                <button className={`btn ${value === null ? 'btn-gold' : ''}`} onClick={() => onPick(null)}>{none}</button>
                {options.map(o => (
                    <button key={o.key} className={`btn ${value === o.key ? 'btn-gold' : ''}`} onClick={() => onPick(o.key)}>{o.name}</button>
                ))}
            </div>
        </>
    )
}

export default function SupporterSettings() {
    const [colors, setColors] = useState<string[]>([])
    const [color, setColor] = useState<string | null>(null)
    const [hasColor, setHasColor] = useState(false)
    const [hidden, setHidden] = useState(false)
    const [error, setError] = useState('')
    const [cos, setCos] = useState<Cosmetics | null>(null)
    const [pets, setPets] = useState<Pets | null>(null)

    useEffect(() => {
        apiFetch<{ unlocks: string[]; nameColors: string[]; nameColor: string | null; cosmetics?: Cosmetics }>('/api/store')
            .then(s => { setColors(s.nameColors ?? []); setColor(s.nameColor ?? null); setHasColor(s.unlocks.includes('perk:name_color')); setCos(s.cosmetics ?? null) })
            .catch(() => { })
        apiFetch<Pets>('/api/store/pets').then(setPets).catch(() => { })
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

    // Frames, backdrops, shop signs, and awnings (server services/cosmetics.ts).
    const wear = async (kind: 'frame' | 'backdrop' | 'sign' | 'awning', key: string | null) => {
        setError('')
        try {
            await apiFetch('/api/store/cosmetic', { method: 'POST', body: JSON.stringify({ kind, key }) })
            setCos(c => c ? { ...c, [kind]: key } : c)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'That did not work.')
        }
    }

    const wearPet = async (key: string | null) => {
        setError('')
        try {
            await apiFetch('/api/store/pet', { method: 'POST', body: JSON.stringify({ key }) })
            setPets(p => p ? { ...p, worn: key } : p)
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
            {pets && pets.pets.some(p => p.owned) && (
                <>
                    <span className="settings-toggle-label">Your Pet</span>
                    <span className="muted-text" style={{ fontSize: '13px' }}>Walks beside your name among the folk standing about, and on your profile.</span>
                    <div className="cosmetic-picker">
                        <button className={`btn ${pets.worn === null ? 'btn-gold' : ''}`} onClick={() => wearPet(null)}>None</button>
                        {pets.pets.filter(p => p.owned).map(p => (
                            <button key={p.key} className={`btn ${pets.worn === p.key ? 'btn-gold' : ''}`} onClick={() => wearPet(p.key)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <PetBadge petKey={p.key} emoji={p.emoji} size={22} /> {p.name}
                            </button>
                        ))}
                    </div>
                </>
            )}
            {pets && (
                <>
                    <span className="settings-toggle-label">Pets Found</span>
                    <span className="muted-text" style={{ fontSize: '13px' }}>
                        One for each skill, found very rarely while you work it. They are bragging rights and nothing more.
                    </span>
                    <div className="pet-collection">
                        {pets.pets.filter(p => p.kind === 'skill').map(p => (
                            <div key={p.key} className="pet-collection-item" title={p.owned ? p.name : `Found while training ${p.skill}`}>
                                <PetBadge petKey={p.key} emoji={p.emoji} size={36} dim={!p.owned} />
                                <span className={p.owned ? 'gold-text' : 'muted-text'}>{p.owned ? p.name : p.skill}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
            {cos && (
                <>
                    <Picker label="Avatar Frame" hint="Around your picture on your profile." none="None"
                        options={cos.frames} value={cos.frame} onPick={k => wear('frame', k)} />
                    <Picker label="Profile Backdrop" hint="The picture behind the top of your profile." none="None"
                        options={cos.backdrops} value={cos.backdrop} onPick={k => wear('backdrop', k)} />
                    <Picker label="Shop Sign" hint="Behind your shop's name in the list of shopfronts, on every island." none="Plain"
                        options={cos.signs} value={cos.sign} onPick={k => wear('sign', k)} />
                    <Picker label="Shop Awning" hint="A striped awning over your shop's name." none="None"
                        options={cos.awnings.map(a => ({ key: a, name: a[0].toUpperCase() + a.slice(1) }))} value={cos.awning} onPick={k => wear('awning', k)} />
                    {cos.emotes.length > 0 && (
                        <>
                            <span className="settings-toggle-label">Chat Emotes</span>
                            <span className="muted-text" style={{ fontSize: '13px' }}>
                                Type any of these in chat: {cos.emotes.map(e => `:${e}:`).join(' ')}. Your pets have one each too, as :pet-name:, for example :pet-stoat:.
                            </span>
                        </>
                    )}
                </>
            )}
            <label className="settings-toggle" style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={hidden} onChange={togglePatrons} />
                <span>
                    <span className="settings-toggle-label">Support anonymously</span>
                    <span className="muted-text" style={{ fontSize: '13px', display: 'block' }}>
                        When you buy Talers, chat thanks you by name, and each museum keeps a plaque of the ten who have given most
                        (by name and place, never by how much). Tick this and chat thanks an anonymous friend instead, and the plaque leaves you off.
                    </span>
                </span>
            </label>
            {error && <span className="guild-error">{error}</span>}
        </div>
    )
}
