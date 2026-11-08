import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { FILTER_PLACE as PLACE } from '../lib/filterPlaces'

/**
 * Slurs the language filter stopped (server services/wordFilter.ts), for staff
 * who moderate chat. "Seen" only clears it from this list; what happens to the
 * player is staff judgement. Below them, players the filter has warned for
 * swearing often this week (filter_warnings). Tapping a name opens that player.
 */

interface Repeat { playerId: number; username: string; count: number; lastAt: string }

interface Flag { id: number; player_id: number; username: string; place: string; text: string; matched: string; created_at: string }


export default function LanguageFlags({ onOpenPlayer }: { onOpenPlayer: (playerId: number) => void }) {
    const [flags, setFlags] = useState<Flag[] | null>(null)
    const [repeats, setRepeats] = useState<{ threshold: number; players: Repeat[] } | null>(null)

    const load = useCallback(() => {
        apiFetch<{ flags: Flag[] }>('/api/admin/filter-flags').then(d => setFlags(d.flags)).catch(() => setFlags(null))
        apiFetch<{ threshold: number; players: Repeat[] }>('/api/admin/filter-warnings/repeat').then(setRepeats).catch(() => setRepeats(null))
    }, [])
    useEffect(() => { load() }, [load])

    const hasFlags = !!flags && flags.length > 0
    const hasRepeats = !!repeats && repeats.players.length > 0
    if (!hasFlags && !hasRepeats) return null

    const seen = async (id: number) => {
        setFlags(f => f && f.filter(x => x.id !== id))
        await apiFetch(`/api/admin/filter-flags/${id}/review`, { method: 'POST' }).catch(() => load())
    }

    return (
        <>
            {hasRepeats && (
                <div className="admin-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p className="admin-section-title">🧂 Swearing Often ({repeats!.threshold}+ warnings this week)</p>
                        {!hasFlags && <button className="btn" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={load}>↻</button>}
                    </div>
                    <div className="admin-player-list" style={{ maxHeight: 160, overflowY: 'auto' }}>
                        {repeats!.players.map(r => (
                            <div key={r.playerId} className="admin-player-row" style={{ justifyContent: 'space-between' }}>
                                <span className="gold-text" style={{ fontSize: '14px', cursor: 'pointer' }} onClick={() => onOpenPlayer(r.playerId)}>{r.username}</span>
                                <span className="muted-text" style={{ fontSize: '11px' }}>
                                    {r.count} this week · last {new Date(r.lastAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {hasFlags && <div className="admin-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p className="admin-section-title">🚩 Language Flags ({flags!.length})</p>
                    <button className="btn" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={load}>↻</button>
                </div>
                <div className="admin-player-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {flags!.map(f => (
                        <div key={f.id} className="admin-player-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                <span className="gold-text" style={{ fontSize: '14px', cursor: 'pointer' }} onClick={() => onOpenPlayer(f.player_id)}>{f.username}</span>
                                <span className="muted-text" style={{ fontSize: '11px' }}>{PLACE[f.place] ?? f.place} · {new Date(f.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <span style={{ fontSize: '12px', overflowWrap: 'anywhere' }}>{f.text}</span>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="muted-text" style={{ fontSize: '11px' }}>Matched: {f.matched}</span>
                                <button className="btn" style={{ fontSize: '11px', padding: '1px 8px' }} onClick={() => seen(f.id)}>Seen</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>}
            <div className="admin-divider" />
        </>
    )
}
