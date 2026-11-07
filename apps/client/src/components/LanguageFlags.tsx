import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

/**
 * Slurs the language filter stopped (server services/wordFilter.ts), for staff
 * who moderate chat. "Seen" only clears it from this list; what happens to the
 * player is staff judgement. Tapping a name opens that player.
 */

interface Flag { id: number; player_id: number; username: string; place: string; text: string; matched: string; created_at: string }

const PLACE: Record<string, string> = {
    'chat:world': 'World chat', 'chat:region': 'Region chat', 'chat:trade': 'Trade chat', 'chat:help': 'Help chat',
    'forum:title': 'Forum title', 'forum:post': 'Forum post', 'forum:edit': 'Forum edit', 'forum:poll': 'Forum poll',
    'guild:description': 'Guild description', 'guild:recruitment': 'Guild recruitment',
    'shop:tagline': 'Shop tagline', 'shop:description': 'Shop description',
}

export default function LanguageFlags({ onOpenPlayer }: { onOpenPlayer: (playerId: number) => void }) {
    const [flags, setFlags] = useState<Flag[] | null>(null)

    const load = useCallback(() => {
        apiFetch<{ flags: Flag[] }>('/api/admin/filter-flags').then(d => setFlags(d.flags)).catch(() => setFlags(null))
    }, [])
    useEffect(() => { load() }, [load])

    if (flags === null || flags.length === 0) return null

    const seen = async (id: number) => {
        setFlags(f => f && f.filter(x => x.id !== id))
        await apiFetch(`/api/admin/filter-flags/${id}/review`, { method: 'POST' }).catch(() => load())
    }

    return (
        <>
            <div className="admin-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p className="admin-section-title">🚩 Language Flags ({flags.length})</p>
                    <button className="btn" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={load}>↻</button>
                </div>
                <div className="admin-player-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {flags.map(f => (
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
            </div>
            <div className="admin-divider" />
        </>
    )
}
