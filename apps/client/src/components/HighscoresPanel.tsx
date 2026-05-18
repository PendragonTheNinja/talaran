import { useState, useEffect } from 'react'
import './HighscoresPanel.css'

interface Skill {
    id: number
    name: string
}

interface PlayerRow {
    rank: number
    id: number
    username: string
    guildTag: string | null
    level?: number
    totalLevel?: number
    xp?: number
    totalXp?: number
    weeklyXp: number
    weeklyLevels: number
}

type Mode = 'alltime' | 'weekly'

interface HighscoresPanelProps {
    onClose: () => void
    closing?: boolean
}

export default function HighscoresPanel({ onClose, closing }: HighscoresPanelProps) {
    const [skills, setSkills] = useState<Skill[]>([])
    const [selectedSkill, setSelectedSkill] = useState<string>('total')
    const [mode, setMode] = useState<Mode>('alltime')
    const [players, setPlayers] = useState<PlayerRow[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(50)
    const [totalPages, setTotalPages] = useState(1)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetch('http://localhost:3000/api/highscores/skills')
            .then(r => r.json())
            .then(d => setSkills(d.skills || []))
            .catch(() => { })
    }, [])

    useEffect(() => {
        loadHighscores()
    }, [selectedSkill, mode, page, limit])

    const loadHighscores = async () => {
        setLoading(true)
        try {
            const res = await fetch(
                `http://localhost:3000/api/highscores?skill=${selectedSkill}&mode=${mode}&page=${page}&limit=${limit}`
            )
            const data = await res.json()
            setPlayers(data.players || [])
            setTotalCount(data.totalCount || 0)
            setTotalPages(data.totalPages || 1)
        } catch (err) {
            console.error('Failed to load highscores:', err)
        } finally {
            setLoading(false)
        }
    }

    const formatXp = (xp: number) => xp.toLocaleString()
    const isTotal = selectedSkill === 'total'

    return (
        <div className={`hs-panel ${closing ? 'closing' : ''}`}>
            <div className="hs-panel-header">
                <h3 className="gold-text">Highscores</h3>
                <button className="modal-close-btn" onClick={onClose}>✕</button>
            </div>

            {/* Skill tabs */}
            <div className="hs-panel-skill-tabs">
                <button
                    className={`hs-panel-skill-tab ${selectedSkill === 'total' ? 'active' : ''}`}
                    onClick={() => { setSelectedSkill('total'); setPage(1) }}
                >Total</button>
                {skills.map(skill => (
                    <button
                        key={skill.id}
                        className={`hs-panel-skill-tab ${selectedSkill === String(skill.id) ? 'active' : ''}`}
                        onClick={() => { setSelectedSkill(String(skill.id)); setPage(1) }}
                    >{skill.name}</button>
                ))}
            </div>

            {/* Mode + limit */}
            <div className="hs-panel-controls">
                <div className="hs-mode-toggle">
                    <button className={`hs-mode-btn ${mode === 'alltime' ? 'active' : ''}`} onClick={() => { setMode('alltime'); setPage(1) }}>All Time</button>
                    <button className={`hs-mode-btn ${mode === 'weekly' ? 'active' : ''}`} onClick={() => { setMode('weekly'); setPage(1) }}>This Week</button>
                </div>
                <select className="hs-limit-select" value={limit} onChange={e => { setLimit(parseInt(e.target.value)); setPage(1) }}>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                </select>
            </div>

            {/* Table */}
            <div className="hs-panel-table-wrap">
                {loading ? (
                    <p className="hs-panel-empty">Loading...</p>
                ) : players.length === 0 ? (
                    <p className="hs-panel-empty">No players found.</p>
                ) : (
                    <table className="hs-panel-table">
                        <thead>
                            <tr>
                                <th className="hs-panel-th">Rank</th>
                                <th className="hs-panel-th">Player</th>
                                <th className="hs-panel-th">{isTotal ? 'Total Level' : 'Level'}</th>
                                <th className="hs-panel-th">{isTotal ? 'Total XP' : 'XP'}</th>
                                <th className="hs-panel-th">+XP Week</th>
                                <th className="hs-panel-th">+Lvls</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map(player => (
                                <tr key={player.id} className="hs-panel-row">
                                    <td className="hs-panel-td">
                                        {player.rank <= 3 ? (
                                            player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'
                                        ) : (
                                            <span className="muted-text">#{player.rank}</span>
                                        )}
                                    </td>
                                    <td className="hs-panel-td">
                                        <span className="gold-text" style={{ fontSize: '15px' }}>{player.username}</span>
                                        {player.guildTag && <span className="muted-text" style={{ fontSize: '12px' }}> [{player.guildTag}]</span>}
                                    </td>
                                    <td className="hs-panel-td" style={{ color: 'var(--color-gold-bright)', fontSize: '16px' }}>
                                        {(player.level ?? player.totalLevel ?? 0).toLocaleString()}
                                    </td>
                                    <td className="hs-panel-td muted-text">
                                        {formatXp(player.xp ?? player.totalXp ?? 0)}
                                    </td>
                                    <td className="hs-panel-td" style={{ color: '#6ab87e', fontSize: '15px' }}>
                                        {player.weeklyXp > 0 ? `+${formatXp(player.weeklyXp)}` : '—'}
                                    </td>
                                    <td className="hs-panel-td" style={{ color: '#7eb8e8', fontSize: '15px' }}>
                                        {player.weeklyLevels > 0 ? `+${player.weeklyLevels}` : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="hs-panel-pagination">
                    <button className="btn" disabled={page === 1} onClick={() => setPage(1)}>««</button>
                    <button className="btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                    <span className="muted-text" style={{ fontSize: '13px' }}>Page {page} of {totalPages}</span>
                    <button className="btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                    <button className="btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»»</button>
                </div>
            )}
        </div>
    )
}