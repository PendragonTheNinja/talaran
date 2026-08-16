import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './HighscoresPage.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

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

type SortKey = 'rank' | 'level' | 'xp' | 'weeklyXp' | 'weeklyLevels'
type SortDir = 'asc' | 'desc'
type Mode = 'alltime' | 'weekly'

export default function HighscoresPage() {
    const [skills, setSkills] = useState<Skill[]>([])
    const [selectedSkill, setSelectedSkill] = useState<string>('total')
    const [mode, setMode] = useState<Mode>('alltime')
    const [players, setPlayers] = useState<PlayerRow[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(50)
    const [totalPages, setTotalPages] = useState(1)
    const [sortKey, setSortKey] = useState<SortKey>('level')
    const [sortDir, setSortDir] = useState<SortDir>('desc')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetch(`${API_URL}/api/highscores/skills`)
            .then(r => r.json())
            .then(d => setSkills(d.skills || []))
            .catch(() => { })
    }, [])

    useEffect(() => {
        loadHighscores()
    }, [selectedSkill, mode, page, limit, sortKey, sortDir])

    const loadHighscores = async () => {
        setLoading(true)
        try {
            const res = await fetch(
                `${API_URL}/api/highscores?skill=${selectedSkill}&mode=${mode}&page=${page}&limit=${limit}&sortBy=${sortKey}&sortDir=${sortDir}`
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

    const handleSort = (key: SortKey) => {
        setPage(1)
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    // Server returns rows already sorted + ranked across the whole board.
    const sortedPlayers = players

    const SortHeader = ({ label, sKey }: { label: string; sKey: SortKey }) => (
        <th className="hs-th sortable" onClick={() => handleSort(sKey)}>
            {label}
            {sortKey === sKey && <span className="hs-sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
        </th>
    )

    const formatXp = (xp: number) => xp.toLocaleString()

    const isTotal = selectedSkill === 'total'

    return (
        <div className="hs-page">
            {/* Header */}
            <div className="hs-header">
                <Link to="/" className="hs-brand">
                    <span className="hs-brand-name">Talaran</span>
                </Link>
                <nav className="hs-nav">
                    <Link to="/" className="hs-nav-link">Play</Link>
                    <Link to="/news" className="hs-nav-link">News</Link>
                    <Link to="/highscores" className="hs-nav-link active">Highscores</Link>
                </nav>
            </div>

            {/* Hero */}
            <div className="hs-hero">
                <p className="hs-eyebrow">Hall of Fame</p>
                <h1 className="hs-title">Highscores</h1>
                <p className="hs-subtitle">The finest adventurers of Taiar Island</p>
            </div>

            {/* Controls */}
            <div className="hs-controls">
                {/* Skill tabs */}
                <div className="hs-skill-tabs">
                    <button
                        className={`hs-skill-tab ${selectedSkill === 'total' ? 'active' : ''}`}
                        onClick={() => { setSelectedSkill('total'); setPage(1) }}
                    >
                        Total
                    </button>
                    {skills.map(skill => (
                        <button
                            key={skill.id}
                            className={`hs-skill-tab ${selectedSkill === String(skill.id) ? 'active' : ''}`}
                            onClick={() => { setSelectedSkill(String(skill.id)); setPage(1) }}
                        >
                            {skill.name}
                        </button>
                    ))}
                </div>

                {/* Mode + limit */}
                <div className="hs-controls-right">
                    <div className="hs-mode-toggle">
                        <button
                            className={`hs-mode-btn ${mode === 'alltime' ? 'active' : ''}`}
                            onClick={() => { setMode('alltime'); setPage(1); setSortKey('level'); setSortDir('desc') }}
                        >
                            All Time
                        </button>
                        <button
                            className={`hs-mode-btn ${mode === 'weekly' ? 'active' : ''}`}
                            onClick={() => { setMode('weekly'); setPage(1); setSortKey('weeklyXp'); setSortDir('desc') }}
                        >
                            This Week
                        </button>
                    </div>
                    <select
                        className="hs-limit-select"
                        value={limit}
                        onChange={e => { setLimit(parseInt(e.target.value)); setPage(1) }}
                    >
                        <option value={50}>50 per page</option>
                        <option value={100}>100 per page</option>
                        <option value={250}>250 per page</option>
                        <option value={500}>500 per page</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="hs-table-wrap">
                {loading ? (
                    <div className="hs-loading">Loading...</div>
                ) : players.length === 0 ? (
                    <div className="hs-empty">No players found.</div>
                ) : (
                    <table className="hs-table">
                        <thead>
                            <tr>
                                <th className="hs-th">Rank</th>
                                <th className="hs-th">Player</th>
                                <SortHeader label={isTotal ? 'Total Level' : 'Level'} sKey="level" />
                                <SortHeader label={isTotal ? 'Total XP' : 'XP'} sKey="xp" />
                                {mode === 'weekly' && (
                                    <>
                                        <SortHeader label="+XP This Week" sKey="weeklyXp" />
                                        <SortHeader label="+Levels" sKey="weeklyLevels" />
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedPlayers.map(player => (
                                <tr key={player.id} className="hs-row">
                                    <td className="hs-td hs-rank">
                                        {player.rank <= 3 ? (
                                            <span className={`hs-medal hs-medal-${player.rank}`}>
                                                {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉'}
                                            </span>
                                        ) : (
                                            <span className="hs-rank-num">#{player.rank}</span>
                                        )}
                                    </td>
                                    <td className="hs-td hs-player">
                                        <span className="hs-username">{player.username}</span>
                                        {player.guildTag && (
                                            <span className="hs-guild-tag">[{player.guildTag}]</span>
                                        )}
                                    </td>
                                    <td className="hs-td hs-level">
                                        {(player.level ?? player.totalLevel ?? 0).toLocaleString()}
                                    </td>
                                    <td className="hs-td hs-xp">
                                        {formatXp(player.xp ?? player.totalXp ?? 0)}
                                    </td>
                                    {mode === 'weekly' && (
                                        <>
                                            <td className="hs-td hs-weekly-xp">
                                                {player.weeklyXp > 0 ? `+${formatXp(player.weeklyXp)}` : '—'}
                                            </td>
                                            <td className="hs-td hs-weekly-levels">
                                                {player.weeklyLevels > 0 ? `+${player.weeklyLevels}` : '—'}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="hs-pagination">
                    <button className="hs-page-btn" disabled={page === 1} onClick={() => setPage(1)}>««</button>
                    <button className="hs-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                    <span className="hs-page-info">Page {page} of {totalPages} · {totalCount.toLocaleString()} players</span>
                    <button className="hs-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                    <button className="hs-page-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»»</button>
                </div>
            )}

            {/* Footer */}
            <div className="hs-footer">
                <span>© 2026 Talaran · Alpha</span>
                <span>·</span>
                <Link to="/" className="hs-footer-link">Play the Game</Link>
            </div>
        </div>
    )
}