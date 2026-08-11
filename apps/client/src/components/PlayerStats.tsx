import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import './PlayerStats.css'

interface PlayerStatsProps {
    playerId: number
}

function formatPlaytime(totalSeconds: number): string {
    const s = Number(totalSeconds) || 0
    const hours = Math.floor(s / 3600)
    const minutes = Math.floor((s % 3600) / 60)
    if (hours === 0 && minutes === 0) return 'Less than a minute'
    if (hours === 0) return `${minutes}m`
    return `${hours.toLocaleString()}h ${minutes}m`
}

function formatDate(iso: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function PlayerStats({ playerId }: PlayerStatsProps) {
    const [data, setData] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        apiFetch<any>(`/api/player/${playerId}/profile`)
            .then(setData)
            .catch(() => setError('Could not load stats.'))
    }, [playerId])

    if (error) return <div className="player-stats-view panel"><p className="muted-text">{error}</p></div>
    if (!data) return <div className="player-stats-view panel"><p className="muted-text">Loading stats…</p></div>

    const p = data.player

    return (
        <div className="player-stats-view panel">
            <h3 className="gold-text">{p.username}</h3>

            <div className="stats-section">
                <p className="stats-section-title">Account</p>
                <div className="stat-row"><span>Adventuring since</span><span>{formatDate(p.created_at)}</span></div>
                <div className="stat-row"><span>Time played</span><span>{formatPlaytime(p.total_seconds_played)}</span></div>
                <div className="stat-row"><span>Last login</span><span>{formatDate(p.last_login)}</span></div>
                <div className="stat-row"><span>Forum posts</span><span>{p.forum_post_count ?? 0}</span></div>
                {/* A monument to everyone who has confidently typed the wrong
                    answer to a sum a child could do. Gates nothing, and the
                    server only sends it for your own profile. */}
                {p.failed_bot_checks !== undefined && (
                    <div className="stat-row"><span>Failed bot checks</span><span>{p.failed_bot_checks}</span></div>
                )}
            </div>

            <div className="stats-section">
                <p className="stats-section-title">Progress</p>
                <div className="stat-row"><span>Total Level</span><span className="gold-text">{data.totalLevel}</span></div>
                <div className="stat-row"><span>Total XP</span><span className="gold-text">{Number(data.totalXp).toLocaleString()}</span></div>
            </div>
        </div>
    )
}