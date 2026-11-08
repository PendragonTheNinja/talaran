import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './LoadoutsModal.css'

/**
 * Named loadouts (server services/loadouts.ts): save what you wear now, put a
 * set back on from your pack in one tap, taking off into the pack whatever
 * sits in a slot the set leaves empty (the trophy stays). Whatever is not in
 * the pack, or is above your level now, is listed here; the rest still goes on.
 */

interface Piece { slot: string; itemId: number; name: string }
interface Loadout { id: number; name: string; pieces: Piece[] }
interface WearReport { worn: string[]; alreadyOn: string[]; removed?: string[]; missing: string[]; refused: { name: string; reason: string }[] }

const MAX = 5

export default function LoadoutsModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
    const [loadouts, setLoadouts] = useState<Loadout[] | null>(null)
    const [name, setName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [report, setReport] = useState<{ name: string; r: WearReport } | null>(null)
    const [busy, setBusy] = useState<number | 'save' | null>(null)
    const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)

    useEffect(() => {
        apiFetch<{ loadouts: Loadout[] }>('/api/equipment/loadouts')
            .then(d => setLoadouts(d.loadouts))
            .catch(e => setError(e instanceof Error ? e.message : 'Could not load your loadouts.'))
    }, [])

    const run = async (key: number | 'save', fn: () => Promise<void>) => {
        setBusy(key)
        setError(null)
        try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.') } finally { setBusy(null) }
    }

    const save = () => run('save', async () => {
        const d = await apiFetch<{ loadouts: Loadout[] }>('/api/equipment/loadouts', { method: 'POST', body: JSON.stringify({ name }) })
        setLoadouts(d.loadouts)
        setName('')
        setReport(null)
    })

    const wear = (l: Loadout) => run(l.id, async () => {
        const d = await apiFetch<{ report: WearReport }>(`/api/equipment/loadouts/${l.id}/wear`, { method: 'POST' })
        setReport({ name: l.name, r: d.report })
        onChanged()
    })

    const resnapshot = (l: Loadout) => run(l.id, async () => {
        const d = await apiFetch<{ loadouts: Loadout[] }>(`/api/equipment/loadouts/${l.id}`, { method: 'PUT', body: JSON.stringify({ resnapshot: true }) })
        setLoadouts(d.loadouts)
    })

    const rename = () => renaming && run(renaming.id, async () => {
        const d = await apiFetch<{ loadouts: Loadout[] }>(`/api/equipment/loadouts/${renaming.id}`, { method: 'PUT', body: JSON.stringify({ name: renaming.name }) })
        setLoadouts(d.loadouts)
        setRenaming(null)
    })

    const remove = (l: Loadout) => {
        if (!confirm(`Delete the loadout "${l.name}"?`)) return
        run(l.id, async () => {
            const d = await apiFetch<{ loadouts: Loadout[] }>(`/api/equipment/loadouts/${l.id}`, { method: 'DELETE' })
            setLoadouts(d.loadouts)
            if (report?.name === l.name) setReport(null)
        })
    }

    const full = (loadouts?.length ?? 0) >= MAX

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box loadouts-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Loadouts">
                <div className="loadouts-head">
                    <h3 className="gold-text">Loadouts</h3>
                    <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
                </div>

                {error && <p className="guild-error">{error}</p>}

                {report && (
                    <div className={`loadouts-report ${report.r.missing.length || report.r.refused.length ? 'partial' : ''}`} role="status">
                        <p><strong>{report.name}</strong>: {report.r.worn.length ? `put on ${report.r.worn.join(', ')}.` : 'nothing new to put on.'}</p>
                        {(report.r.removed?.length ?? 0) > 0 && <p>Put away in your pack: {report.r.removed!.join(', ')}.</p>}
                        {report.r.missing.length > 0 && <p>Not in your pack: {report.r.missing.join(', ')}.</p>}
                        {report.r.refused.map(f => <p key={f.name}>{f.name}: {f.reason}.</p>)}
                    </div>
                )}

                {loadouts === null ? <p className="muted-text">Loading…</p> : loadouts.length === 0 ? (
                    <p className="muted-text">No loadouts yet. Save what you are wearing to make one.</p>
                ) : (
                    <div className="loadouts-list">
                        {loadouts.map(l => (
                            <div key={l.id} className="loadouts-row">
                                <div className="loadouts-row-head">
                                    {renaming?.id === l.id ? (
                                        <input className="chat-input loadouts-name-input" value={renaming.name} maxLength={30} autoFocus
                                            onChange={e => setRenaming({ id: l.id, name: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setRenaming(null) }} />
                                    ) : <span className="loadouts-name">{l.name}</span>}
                                    <button className="btn btn-gold" disabled={busy !== null} onClick={() => wear(l)}>{busy === l.id ? '…' : 'Wear'}</button>
                                </div>
                                <div className="loadouts-pieces">
                                    {l.pieces.map(p => (
                                        <div key={p.slot} className="inventory-slot occupied loadouts-piece" title={p.name}>
                                            <img src={getItemIcon(p.name)} alt={p.name} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                                        </div>
                                    ))}
                                </div>
                                <div className="loadouts-row-actions">
                                    {renaming?.id === l.id
                                        ? <><button className="btn" onClick={rename} disabled={busy !== null}>Save name</button><button className="btn" onClick={() => setRenaming(null)}>Cancel</button></>
                                        : <button className="btn" onClick={() => setRenaming({ id: l.id, name: l.name })} disabled={busy !== null}>Rename</button>}
                                    <button className="btn" onClick={() => resnapshot(l)} disabled={busy !== null} title="Replace it with what you are wearing now">Update to what I wear</button>
                                    <button className="btn loadouts-delete" onClick={() => remove(l)} disabled={busy !== null}>Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="loadouts-save">
                    <input className="chat-input" value={name} maxLength={30} placeholder={full ? `${MAX} loadouts kept` : 'Name, e.g. Mining'}
                        disabled={full} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) save() }} />
                    <button className="btn btn-gold" onClick={save} disabled={full || !name.trim() || busy !== null}>Save what I wear</button>
                </div>
            </div>
        </div>
    )
}
