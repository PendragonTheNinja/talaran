import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { applyPaletteTokens, type PaletteTokens } from '../lib/palette'
import { applyPalette, initTheme, saveTheme } from '../lib/theme'
import './PaletteGallery.css'

export interface SharedPalette {
    id: number
    name: string
    tokens: PaletteTokens
    username?: string
    owner_id?: number
}

interface Props {
    /** Omit for the community-wide gallery; set to show one player's shared palettes. */
    playerId?: number
    hasPerk: boolean
    activeTheme?: string
    onApplied?: (theme: string) => void
    onError?: (msg: string | null) => void
    /** Compact mode for profile embedding: no heading, tighter rows. */
    compact?: boolean
}

const SWATCH_TOKENS = ['bg-deepest', 'bg-panel', 'text-bright', 'gold', 'red', 'xp']

export default function PaletteGallery({ playerId, hasPerk, activeTheme, onApplied, onError, compact }: Props) {
    const [palettes, setPalettes] = useState<SharedPalette[]>([])
    const [loaded, setLoaded] = useState(false)
    const [previewingId, setPreviewingId] = useState<number | null>(null)

    useEffect(() => {
        const url = playerId ? `/api/palettes/player/${playerId}` : '/api/palettes/shared'
        apiFetch<{ palettes: SharedPalette[] }>(url)
            .then(d => setPalettes(d.palettes.map(p => ({
                ...p,
                tokens: typeof p.tokens === 'string' ? JSON.parse(p.tokens as unknown as string) : p.tokens,
            }))))
            .catch(() => { /* gallery degrades quietly */ })
            .finally(() => setLoaded(true))
    }, [playerId])

    const tryOn = (p: SharedPalette) => {
        applyPaletteTokens(p.tokens, null)   // visual only, nothing saved
        setPreviewingId(p.id)
    }

    const revert = () => {
        initTheme()
        setPreviewingId(null)
    }

    const wear = async (p: SharedPalette) => {
        applyPalette(p.id, p.name, p.tokens)
        setPreviewingId(null)
        try {
            await saveTheme(`palette:${p.id}`)
            onApplied?.(`palette:${p.id}`)
            onError?.(null)
        } catch (err: any) {
            initTheme()
            onError?.(err.message || 'Could not wear that palette.')
        }
    }

    const copy = async (p: SharedPalette) => {
        try {
            await apiFetch('/api/palettes', {
                method: 'POST',
                body: JSON.stringify({ name: `${p.name} (copy)`.slice(0, 40), tokens: p.tokens }),
            })
            onError?.(null)
            window.alert(`Copied "${p.name}" into your palettes — find it under Custom Palettes to make it yours.`)
        } catch (err: any) {
            onError?.(err.message || 'Could not copy that palette.')
        }
    }

    if (!loaded) return null
    if (palettes.length === 0) {
        return compact ? null : (
            <div className="palette-gallery">
                <h4 className="settings-section-title">Community Palettes</h4>
                <p className="muted-text" style={{ fontSize: '13px' }}>
                    No shared palettes yet — customizers can share theirs with the ★ Share toggle above.
                </p>
            </div>
        )
    }

    return (
        <div className={`palette-gallery ${compact ? 'compact' : ''}`}>
            {!compact && <h4 className="settings-section-title">Community Palettes</h4>}
            {compact && <p className="palette-gallery-mini-title muted-text">Shared Palettes</p>}
            {previewingId !== null && (
                <p className="settings-previewing">
                    Previewing <span className="gold-text">{palettes.find(p => p.id === previewingId)?.name}</span> — nothing saved.
                    <button className="btn" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px' }} onClick={revert}>Revert</button>
                </p>
            )}
            <div className="palette-gallery-grid">
                {palettes.map(p => (
                    <div key={p.id} className={`palette-gallery-card ${activeTheme === `palette:${p.id}` ? 'active' : ''}`}>
                        <span className="palette-gallery-swatches">
                            {SWATCH_TOKENS.map(t => (
                                <span key={t} className="palette-gallery-swatch" style={{ background: p.tokens[t] ?? '#444' }} />
                            ))}
                        </span>
                        <span className="palette-gallery-name">
                            {p.name}
                            {activeTheme === `palette:${p.id}` && <span className="gold-text" style={{ fontSize: '11px', marginLeft: '6px' }}>✓</span>}
                        </span>
                        {!playerId && p.username && <span className="muted-text palette-gallery-by">by {p.username}</span>}
                        <span className="palette-gallery-actions">
                            <button className="btn" onClick={() => tryOn(p)}>Try</button>
                            {hasPerk ? (
                                <>
                                    <button className="btn btn-gold" onClick={() => wear(p)}>Wear</button>
                                    <button className="btn" title="Copy into your palettes to edit" onClick={() => copy(p)}>Copy</button>
                                </>
                            ) : (
                                <span className="muted-text" style={{ fontSize: '11px' }} title="Wearing community palettes requires the Custom Palettes perk">
                                    perk to wear
                                </span>
                            )}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
