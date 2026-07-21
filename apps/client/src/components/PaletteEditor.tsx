import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import {
    PALETTE_TOKENS, TOKEN_GROUPS, BUILTIN_PALETTES,
    generatePalette, applyPaletteTokens,
    type PaletteTokens,
} from '../lib/palette'
import { applyPalette, initTheme, saveTheme } from '../lib/theme'
import './PaletteEditor.css'

interface SavedPalette {
    id: number
    name: string
    tokens: PaletteTokens
    is_shared: boolean
}

interface Props {
    hasPerk: boolean
    perkPrice: number
    onPurchasePerk: () => void
    activeTheme: string
    onApplied: (theme: string) => void
    onError: (msg: string | null) => void
}

const TOKEN_LABELS: Record<string, string> = {
    'bg-deepest': 'Page', 'bg-deep': 'Deep panels', 'bg-dark': 'Dark panels', 'bg-mid': 'Mid panels',
    'bg-panel': 'Panels', 'bg-raised': 'Raised', 'bg-hover': 'Hover',
    'gold-dim': 'Accent dim', 'gold': 'Accent', 'gold-bright': 'Accent bright', 'gold-shine': 'Accent shine',
    'red-dark': 'Danger dark', 'red': 'Danger', 'red-bright': 'Danger bright', 'red-glow': 'Danger glow',
    'text-dim': 'Text dim', 'text-muted': 'Text muted', 'text-base': 'Text', 'text-bright': 'Text bright', 'text-white': 'Text strongest',
    'border-dark': 'Border subtle', 'border-mid': 'Border', 'border-gold': 'Border accent', 'border-bright': 'Border bright',
    'health': 'Health bar', 'mana': 'Mana bar', 'xp': 'XP bar',
}

export default function PaletteEditor({ hasPerk, perkPrice, onPurchasePerk, activeTheme, onApplied, onError }: Props) {
    const [palettes, setPalettes] = useState<SavedPalette[]>([])
    const [editing, setEditing] = useState<{ id: number | null; name: string; tokens: PaletteTokens } | null>(null)
    const [seeds, setSeeds] = useState({ bg: '#141824', accent: '#8fa3c4', ink: '#aeb9d2' })
    const [startFrom, setStartFrom] = useState('tavern')
    const [saving, setSaving] = useState(false)

    const load = () => {
        apiFetch<{ palettes: SavedPalette[] }>('/api/palettes')
            .then(d => setPalettes(d.palettes.map(p => ({ ...p, tokens: typeof p.tokens === 'string' ? JSON.parse(p.tokens as unknown as string) : p.tokens }))))
            .catch(() => { /* section degrades quietly */ })
    }
    useEffect(() => { if (hasPerk) load() }, [hasPerk])

    // Every edit repaints the whole game — that IS the preview.
    const setToken = (key: string, value: string) => {
        if (!editing) return
        const tokens = { ...editing.tokens, [key]: value }
        setEditing({ ...editing, tokens })
        applyPaletteTokens(tokens, null)
    }

    const startNew = () => {
        const base = BUILTIN_PALETTES[startFrom] ?? palettes.find(p => `mine:${p.id}` === startFrom)?.tokens ?? BUILTIN_PALETTES.tavern
        const tokens = { ...base }
        setEditing({ id: null, name: '', tokens })
        applyPaletteTokens(tokens, null)
    }

    const startEdit = (p: SavedPalette) => {
        setEditing({ id: p.id, name: p.name, tokens: { ...p.tokens } })
        applyPaletteTokens(p.tokens, null)
    }

    const generate = () => {
        if (!editing) return
        const tokens = generatePalette(seeds.bg, seeds.accent, seeds.ink)
        setEditing({ ...editing, tokens })
        applyPaletteTokens(tokens, null)
    }

    const cancelEdit = () => {
        setEditing(null)
        initTheme()               // restore whatever is actually saved
        onError(null)
    }

    const save = async () => {
        if (!editing) return
        if (!editing.name.trim()) { onError('Give your palette a name.'); return }
        setSaving(true)
        try {
            const body = JSON.stringify({ name: editing.name.trim(), tokens: editing.tokens })
            const res = editing.id === null
                ? await apiFetch<{ palette: SavedPalette }>('/api/palettes', { method: 'POST', body })
                : await apiFetch<{ palette: SavedPalette }>(`/api/palettes/${editing.id}`, { method: 'PATCH', body })
            onError(null)
            // Wear it immediately
            const p = res.palette
            const tokens = typeof p.tokens === 'string' ? JSON.parse(p.tokens as unknown as string) : p.tokens
            applyPalette(p.id, p.name, tokens)
            await saveTheme(`palette:${p.id}`)
            onApplied(`palette:${p.id}`)
            setEditing(null)
            load()
        } catch (err: any) {
            onError(err.message || 'Could not save palette.')
        } finally {
            setSaving(false)
        }
    }

    const apply = async (p: SavedPalette) => {
        applyPalette(p.id, p.name, p.tokens)
        try {
            await saveTheme(`palette:${p.id}`)
            onApplied(`palette:${p.id}`)
            onError(null)
        } catch (err: any) {
            onError(err.message || 'Could not save your selection.')
        }
    }

    const toggleShare = async (p: SavedPalette) => {
        try {
            await apiFetch(`/api/palettes/${p.id}`, { method: 'PATCH', body: JSON.stringify({ is_shared: !p.is_shared }) })
            load()
        } catch (err: any) {
            onError(err.message || 'Could not update sharing.')
        }
    }

    const remove = async (p: SavedPalette) => {
        if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return
        try {
            await apiFetch(`/api/palettes/${p.id}`, { method: 'DELETE' })
            if (activeTheme === `palette:${p.id}`) { initTheme(); onApplied('tavern') }
            load()
        } catch (err: any) {
            onError(err.message || 'Could not delete palette.')
        }
    }

    if (!hasPerk) {
        return (
            <div className="palette-locked">
                <h4 className="settings-section-title">Custom Palettes</h4>
                <p className="muted-text" style={{ fontSize: '13px', lineHeight: 1.5 }}>
                    Paint your own Talaran. Pick three colors, generate a full theme, fine-tune every
                    shade with live preview, and share your palettes with fellow customizers. Includes
                    all three premium themes.
                </p>
                <button className="btn btn-gold" style={{ marginTop: '8px' }} onClick={onPurchasePerk}>
                    Unlock for {perkPrice.toLocaleString()} Talers
                </button>
            </div>
        )
    }

    if (editing) {
        return (
            <div className="palette-editor">
                <h4 className="settings-section-title">{editing.id === null ? 'New Palette' : `Editing: ${editing.name || 'Untitled'}`}</h4>
                <p className="muted-text" style={{ fontSize: '12px', marginBottom: '8px' }}>
                    The whole game is your preview — everything you see updates as you pick.
                </p>

                <input
                    className="chat-input"
                    style={{ width: '100%', marginBottom: '10px' }}
                    placeholder="Palette name"
                    maxLength={40}
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                />

                <div className="palette-seeds">
                    <label>Background<input type="color" value={seeds.bg} onChange={e => setSeeds({ ...seeds, bg: e.target.value })} /></label>
                    <label>Accent<input type="color" value={seeds.accent} onChange={e => setSeeds({ ...seeds, accent: e.target.value })} /></label>
                    <label>Ink<input type="color" value={seeds.ink} onChange={e => setSeeds({ ...seeds, ink: e.target.value })} /></label>
                    <button className="btn btn-gold" onClick={generate}>Generate</button>
                </div>
                <p className="muted-text" style={{ fontSize: '11px', margin: '4px 0 10px' }}>
                    Generate builds every shade from your three colors. Fine-tune anything below afterward.
                </p>

                {TOKEN_GROUPS.map(group => (
                    <details key={group.title} className="palette-group">
                        <summary>{group.title}</summary>
                        <div className="palette-group-grid">
                            {group.tokens.map(t => (
                                <label key={t} className="palette-token">
                                    <input
                                        type="color"
                                        value={editing.tokens[t] ?? '#000000'}
                                        onChange={e => setToken(t, e.target.value)}
                                    />
                                    <span>{TOKEN_LABELS[t] ?? t}</span>
                                </label>
                            ))}
                        </div>
                    </details>
                ))}

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button className="btn btn-gold" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save & Wear'}</button>
                    <button className="btn" onClick={cancelEdit}>Cancel</button>
                </div>
            </div>
        )
    }

    return (
        <div className="palette-editor">
            <h4 className="settings-section-title">Custom Palettes</h4>
            {palettes.length === 0 && (
                <p className="muted-text" style={{ fontSize: '13px' }}>No palettes yet — paint your first below.</p>
            )}
            {palettes.map(p => (
                <div key={p.id} className={`palette-row ${activeTheme === `palette:${p.id}` ? 'active' : ''}`}>
                    <span className="palette-row-swatches">
                        {['bg-deepest', 'bg-panel', 'text-bright', 'gold'].map(t => (
                            <span key={t} className="settings-theme-swatch" style={{ background: p.tokens[t] }} />
                        ))}
                    </span>
                    <span className="palette-row-name">
                        {p.name}
                        {activeTheme === `palette:${p.id}` && <span className="gold-text" style={{ fontSize: '11px', marginLeft: '6px' }}>✓ Active</span>}
                    </span>
                    <span className="palette-row-actions">
                        <button className="btn" onClick={() => apply(p)}>Wear</button>
                        <button className="btn" onClick={() => startEdit(p)}>Edit</button>
                        <button className="btn" title="Shared palettes appear on your profile; fellow customizers can wear them" onClick={() => toggleShare(p)}>
                            {p.is_shared ? '★ Shared' : '☆ Share'}
                        </button>
                        <button className="btn" onClick={() => remove(p)}>✕</button>
                    </span>
                </div>
            ))}

            <div className="palette-new">
                <span className="muted-text" style={{ fontSize: '12px' }}>Start from</span>
                <select className="chat-input" value={startFrom} onChange={e => setStartFrom(e.target.value)}>
                    <option value="tavern">Tavern</option>
                    <option value="scriptorium">Scriptorium</option>
                    {palettes.map(p => <option key={p.id} value={`mine:${p.id}`}>{p.name}</option>)}
                </select>
                <button className="btn btn-gold" onClick={startNew}>+ New Palette</button>
            </div>
        </div>
    )
}
