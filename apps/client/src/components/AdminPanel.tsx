import { useState, useEffect } from 'react'
import { formatGameDateTime } from '../lib/time'
import { apiFetch } from '../lib/api'
import './AdminPanel.css'

interface PlayerInfo {
    id: number
    username: string
    email: string
    is_admin: boolean
    is_mod: boolean
    is_banned: boolean
    is_chat_muted: boolean
    chat_muted_until: string | null
    is_forum_banned: boolean
    forum_banned_until: string | null
    banned_until: string | null
    ban_reason: string | null
    strike_count: number
    created_at: string
    last_login: string
    location_name: string
}

interface Warning {
    id: number
    reason: string
    type: string
    strike_number: number
    issued_by_name: string
    created_at: string
}

interface Mute {
    id: number
    type: string
    reason: string | null
    expires_at: string | null
    issued_by_name: string
    created_at: string
}

interface ModPerms {
    can_moderate_chat: boolean
    can_moderate_forum: boolean
    can_view_players: boolean
    can_send_messages: boolean
    can_ban: boolean
}

interface AdminPanelProps {
    onClose: () => void
    closing?: boolean
    isAdmin: boolean
    isMod: boolean
}

export default function AdminPanel({ onClose, closing, isAdmin, isMod }: AdminPanelProps) {
    const [view, setView] = useState<'online' | 'search' | 'player'>('online')
    const [onlinePlayers, setOnlinePlayers] = useState<PlayerInfo[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<PlayerInfo[]>([])
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerInfo | null>(null)
    const [warnings, setWarnings] = useState<Warning[]>([])
    const [mutes, setMutes] = useState<Mute[]>([])
    const [modPerms, setModPerms] = useState<ModPerms | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Action forms
    const [announcement, setAnnouncement] = useState('')
    const [warnReason, setWarnReason] = useState('')
    const [warnType, setWarnType] = useState<'chat' | 'formal'>('formal')
    const [muteType, setMuteType] = useState<'chat' | 'forum'>('chat')
    const [muteDuration, setMuteDuration] = useState('')
    const [muteReason, setMuteReason] = useState('')
    const [banDuration, setBanDuration] = useState('')
    const [banReason, setBanReason] = useState('')
    const [msgSubject, setMsgSubject] = useState('')
    const [msgBody, setMsgBody] = useState('')
    const [pendingPerms, setPendingPerms] = useState<ModPerms>({
        can_moderate_chat: false,
        can_moderate_forum: false,
        can_view_players: false,
        can_send_messages: false,
        can_ban: false,
    })
    const [locations, setLocations] = useState<{ id: number; name: string; region: string }[]>([])
    const [teleRegion, setTeleRegion] = useState('')
    const [teleLocationId, setTeleLocationId] = useState('')

    useEffect(() => {
        loadOnlinePlayers()
        if (isAdmin) {
            apiFetch<{ locations: { id: number; name: string; region: string }[] }>('/api/admin/locations')
                .then(d => setLocations(d.locations))
                .catch(() => { })
        }
    }, [])

    const loadOnlinePlayers = async () => {
        try {
            const data = await apiFetch<{ players: PlayerInfo[] }>('/api/admin/players/online')
            setOnlinePlayers(data.players)
        } catch (err) { }
    }

    const handleSearch = async () => {
        if (!searchQuery.trim()) return
        try {
            const data = await apiFetch<{ players: PlayerInfo[] }>(`/api/admin/players/search?q=${encodeURIComponent(searchQuery)}`)
            setSearchResults(data.players)
            setView('search')
        } catch (err: any) {
            setError(err.message)
        }
    }

    const loadPlayer = async (playerId: number) => {
        try {
            const data = await apiFetch<{ player: PlayerInfo; warnings: Warning[]; mutes: Mute[]; modPerms: ModPerms | null }>(`/api/admin/players/${playerId}`)
            setSelectedPlayer(data.player)
            setWarnings(data.warnings)
            setMutes(data.mutes)
            setModPerms(data.modPerms)
            setPendingPerms(data.modPerms || {
                can_moderate_chat: false,
                can_moderate_forum: false,
                can_view_players: false,
                can_send_messages: false,
                can_ban: false,
            })
            setView('player')
        } catch (err: any) {
            setError(err.message)
        }
    }

    const isTempBanned = selectedPlayer?.banned_until ? new Date(selectedPlayer.banned_until) > new Date() : false
    const isPermBanned = selectedPlayer?.is_banned ?? false
    const isBanned = isPermBanned || isTempBanned

    const handleAnnounce = async () => {
        if (!announcement.trim()) return
        try {
            await apiFetch('/api/admin/announce', {
                method: 'POST',
                body: JSON.stringify({ message: announcement }),
            })
            setSuccess('Announcement sent!')
            setAnnouncement('')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleWarn = async () => {
        if (!selectedPlayer || !warnReason.trim()) return
        try {
            const data = await apiFetch<{ strikeNumber: number }>('/api/admin/warn', {
                method: 'POST',
                body: JSON.stringify({ targetId: selectedPlayer.id, reason: warnReason, type: warnType }),
            })
            setSuccess(`Warning issued. Strike ${data.strikeNumber}.`)
            setWarnReason('')
            await loadPlayer(selectedPlayer.id)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleMute = async () => {
        if (!selectedPlayer) return
        try {
            await apiFetch('/api/admin/mute', {
                method: 'POST',
                body: JSON.stringify({
                    targetId: selectedPlayer.id,
                    type: muteType,
                    reason: muteReason,
                    durationHours: muteDuration ? parseInt(muteDuration) : null,
                }),
            })
            setSuccess(`${muteType === 'chat' ? 'Chat mute' : 'Forum ban'} applied.`)
            setMuteReason('')
            setMuteDuration('')
            await loadPlayer(selectedPlayer.id)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleBan = async () => {
        if (!selectedPlayer) return
        try {
            await apiFetch('/api/admin/ban', {
                method: 'POST',
                body: JSON.stringify({
                    targetId: selectedPlayer.id,
                    reason: banReason,
                    durationHours: banDuration ? parseInt(banDuration) : null,
                }),
            })
            setSuccess('Player banned.')
            setBanReason('')
            setBanDuration('')
            await loadPlayer(selectedPlayer.id)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleUnban = async (type: string) => {
        if (!selectedPlayer) return
        try {
            await apiFetch('/api/admin/unban', {
                method: 'POST',
                body: JSON.stringify({ targetId: selectedPlayer.id, type }),
            })
            setSuccess(`${type} restriction lifted.`)
            await loadPlayer(selectedPlayer.id)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleTeleport = async () => {
        if (!selectedPlayer || !teleLocationId) return
        try {
            const data = await apiFetch<{ message: string }>('/api/admin/teleport', {
                method: 'POST',
                body: JSON.stringify({ targetId: selectedPlayer.id, locationId: Number(teleLocationId) }),
            })
            setSuccess(data.message)
            setError(null)
            await loadPlayer(selectedPlayer.id) // refresh their shown location
        } catch (err: any) {
            setError(err.message || 'Could not teleport player.')
        }
    }

    const handleMessage = async () => {
        if (!selectedPlayer || !msgBody.trim()) return
        try {
            await apiFetch('/api/admin/message', {
                method: 'POST',
                body: JSON.stringify({ targetId: selectedPlayer.id, subject: msgSubject, body: msgBody }),
            })
            setSuccess('Message sent.')
            setMsgSubject('')
            setMsgBody('')
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleUpdatePerms = async () => {
        if (!selectedPlayer) return
        try {
            await apiFetch('/api/admin/mod-permissions', {
                method: 'POST',
                body: JSON.stringify({ targetId: selectedPlayer.id, permissions: pendingPerms }),
            })
            setSuccess('Permissions updated.')
            await loadPlayer(selectedPlayer.id)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const formatDate = (str: string | null) => {
        if (!str) return 'Never'
        return formatGameDateTime(new Date(str))
    }

    return (
        <div className={`admin-panel ${closing ? 'closing' : ''}`}>
            <div className="admin-header">
                <h3 className="gold-text">Admin Panel</h3>
                <button className="modal-close-btn" onClick={onClose}>✕</button>
            </div>

            {error && <p className="guild-error" style={{ padding: '0 var(--space-lg)' }}>{error}</p>}
            {success && <p className="guild-success" style={{ padding: '0 var(--space-lg)' }}>{success}</p>}

            <div className="admin-body">
                {/* Sidebar */}
                <div className="admin-sidebar">

                    {/* Announcement */}
                    <div className="admin-section">
                        <p className="admin-section-title">Server Announcement</p>
                        <textarea
                            className="chat-input"
                            value={announcement}
                            onChange={e => setAnnouncement(e.target.value)}
                            placeholder="Message to all players..."
                            rows={3}
                            style={{ width: '100%', resize: 'none', fontSize: '14px' }}
                        />
                        <button className="btn btn-red" style={{ width: '100%', marginTop: '6px' }} onClick={handleAnnounce}>
                            📢 Broadcast
                        </button>
                    </div>

                    <div className="admin-divider" />

                    {/* Search */}
                    <div className="admin-section">
                        <p className="admin-section-title">Player Search</p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                                className="chat-input"
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="Username..."
                                style={{ flex: 1, fontSize: '14px' }}
                            />
                            <button className="btn" onClick={handleSearch}>Search</button>
                        </div>
                    </div>

                    <div className="admin-divider" />

                    {/* Online players */}
                    <div className="admin-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p className="admin-section-title">Online ({onlinePlayers.length})</p>
                            <button className="btn" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={loadOnlinePlayers}>↻</button>
                        </div>
                        <div className="admin-player-list">
                            {onlinePlayers.map(p => (
                                <div key={p.id} className="admin-player-row" onClick={() => loadPlayer(p.id)}>
                                    <span className="gold-text" style={{ fontSize: '14px' }}>{p.username}</span>
                                    <span className="muted-text" style={{ fontSize: '12px' }}>{p.location_name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main content */}
                <div className="admin-main">

                    {/* Search results */}
                    {view === 'search' && (
                        <div>
                            <p className="admin-section-title gold-text">Search Results</p>
                            {searchResults.length === 0 ? (
                                <p className="muted-text">No players found.</p>
                            ) : (
                                searchResults.map(p => (
                                    <div key={p.id} className="admin-player-row clickable" onClick={() => loadPlayer(p.id)}>
                                        <span className="gold-text" style={{ fontSize: '15px' }}>{p.username}</span>
                                        <span className="muted-text" style={{ fontSize: '13px' }}>{p.location_name}</span>
                                        {p.is_banned && <span style={{ color: 'var(--color-red-glow)', fontSize: '12px' }}>BANNED</span>}
                                        {p.is_chat_muted && <span style={{ color: '#e8a030', fontSize: '12px' }}>MUTED</span>}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Player detail */}
                    {view === 'player' && selectedPlayer && (
                        <div className="admin-player-detail">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <button className="btn" style={{ fontSize: '12px' }} onClick={() => setView('online')}>← Back</button>
                                <h4 className="gold-text" style={{ fontSize: '20px' }}>{selectedPlayer.username}</h4>
                                {selectedPlayer.is_admin && <span className="forum-post-badge admin">Admin</span>}
                                {selectedPlayer.is_mod && <span className="forum-post-badge mod">Mod</span>}
                                {isBanned && <span style={{ color: 'var(--color-red-glow)', fontSize: '13px' }}>● BANNED</span>}
                                {selectedPlayer.is_chat_muted && <span style={{ color: '#e8a030', fontSize: '13px' }}>● MUTED</span>}
                            </div>

                            {/* Player info */}
                            <div className="admin-info-grid">
                                <div className="admin-info-item"><span className="muted-text">Email</span><span style={{ fontSize: '14px' }}>{selectedPlayer.email}</span></div>
                                <div className="admin-info-item"><span className="muted-text">Location</span><span style={{ fontSize: '14px' }}>{selectedPlayer.location_name}</span></div>
                                <div className="admin-info-item"><span className="muted-text">Joined</span><span style={{ fontSize: '14px' }}>{formatDate(selectedPlayer.created_at)}</span></div>
                                <div className="admin-info-item"><span className="muted-text">Last Login</span><span style={{ fontSize: '14px' }}>{formatDate(selectedPlayer.last_login)}</span></div>
                                <div className="admin-info-item"><span className="muted-text">Strikes</span><span style={{ fontSize: '14px', color: selectedPlayer.strike_count > 0 ? 'var(--color-red-glow)' : 'inherit' }}>{selectedPlayer.strike_count}</span></div>
                                {selectedPlayer.banned_until && <div className="admin-info-item"><span className="muted-text">Banned Until</span><span style={{ fontSize: '14px', color: 'var(--color-red-glow)' }}>{formatDate(selectedPlayer.banned_until)}</span></div>}
                                {selectedPlayer.chat_muted_until && <div className="admin-info-item"><span className="muted-text">Muted Until</span><span style={{ fontSize: '14px', color: '#e8a030' }}>{formatDate(selectedPlayer.chat_muted_until)}</span></div>}
                            </div>

                            <div className="admin-divider" />

                            {/* Active restrictions */}
                            {(isBanned || selectedPlayer.is_chat_muted || selectedPlayer.is_forum_banned) && (
                                <div className="admin-section">
                                    <p className="admin-section-title">Active Restrictions</p>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {selectedPlayer.is_chat_muted && (
                                            <button className="btn" style={{ fontSize: '12px' }} onClick={() => handleUnban('chat')}>
                                                Unmute Chat
                                            </button>
                                        )}
                                        {selectedPlayer.is_forum_banned && (
                                            <button className="btn" style={{ fontSize: '12px' }} onClick={() => handleUnban('forum')}>
                                                Unban Forum
                                            </button>
                                        )}
                                        {isBanned && (
                                            <button className="btn" style={{ fontSize: '12px' }} onClick={() => handleUnban('account')}>
                                                Unban Account
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="admin-actions-grid">

                                {/* Warn */}
                                <div className="admin-action-card">
                                    <p className="admin-section-title">⚠ Warn Player</p>
                                    <select className="chat-input" value={warnType} onChange={e => setWarnType(e.target.value as any)} style={{ fontSize: '14px', marginBottom: '6px' }}>
                                        <option value="formal">Formal (inbox message)</option>
                                        <option value="chat">Chat warning (visible in chat)</option>
                                    </select>
                                    <textarea
                                        className="chat-input"
                                        value={warnReason}
                                        onChange={e => setWarnReason(e.target.value)}
                                        placeholder="Reason..."
                                        rows={2}
                                        style={{ width: '100%', resize: 'none', fontSize: '14px' }}
                                    />
                                    <button className="btn" style={{ marginTop: '6px', fontSize: '13px' }} onClick={handleWarn}>Issue Warning</button>
                                </div>

                                {/* Mute */}
                                <div className="admin-action-card">
                                    <p className="admin-section-title">🔇 Mute / Forum Ban</p>
                                    <select className="chat-input" value={muteType} onChange={e => setMuteType(e.target.value as any)} style={{ fontSize: '14px', marginBottom: '6px' }}>
                                        <option value="chat">Chat Mute</option>
                                        <option value="forum">Forum Ban</option>
                                    </select>
                                    <input
                                        className="chat-input"
                                        type="number"
                                        value={muteDuration}
                                        onChange={e => setMuteDuration(e.target.value)}
                                        placeholder="Duration (minutes, blank = permanent)"
                                        style={{ fontSize: '14px', marginBottom: '6px', width: '100%' }}
                                    />
                                    <input
                                        className="chat-input"
                                        type="text"
                                        value={muteReason}
                                        onChange={e => setMuteReason(e.target.value)}
                                        placeholder="Reason..."
                                        style={{ fontSize: '14px', marginBottom: '6px', width: '100%' }}
                                    />
                                    <button className="btn" style={{ fontSize: '13px' }} onClick={handleMute}>Apply</button>
                                </div>

                                {/* Ban */}
                                {isAdmin && (
                                    <div className="admin-action-card">
                                        <p className="admin-section-title">🔨 Ban Account</p>
                                        <input
                                            className="chat-input"
                                            type="number"
                                            value={banDuration}
                                            onChange={e => setBanDuration(e.target.value)}
                                            placeholder="Duration (hours, blank = permanent)"
                                            style={{ fontSize: '14px', marginBottom: '6px', width: '100%' }}
                                        />
                                        <input
                                            className="chat-input"
                                            type="text"
                                            value={banReason}
                                            onChange={e => setBanReason(e.target.value)}
                                            placeholder="Reason..."
                                            style={{ fontSize: '14px', marginBottom: '6px', width: '100%' }}
                                        />
                                        <button className="btn btn-red" style={{ fontSize: '13px' }} onClick={handleBan}>Ban Player</button>
                                    </div>
                                )}

                                {/* Teleport */}
                                {isAdmin && (
                                    <div className="admin-action-card">
                                        <p className="admin-section-title">📍 Teleport Player</p>
                                        <select
                                            className="chat-input"
                                            value={teleRegion}
                                            onChange={e => { setTeleRegion(e.target.value); setTeleLocationId('') }}
                                            style={{ fontSize: '14px', marginBottom: '6px', width: '100%' }}
                                        >
                                            <option value="">Select island…</option>
                                            {[...new Set(locations.map(l => l.region))].map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="chat-input"
                                            value={teleLocationId}
                                            onChange={e => setTeleLocationId(e.target.value)}
                                            disabled={!teleRegion}
                                            style={{ fontSize: '14px', marginBottom: '6px', width: '100%' }}
                                        >
                                            <option value="">Select location…</option>
                                            {locations.filter(l => l.region === teleRegion).map(l => (
                                                <option key={l.id} value={l.id}>{l.name}</option>
                                            ))}
                                        </select>
                                        <button className="btn" style={{ fontSize: '13px' }} onClick={handleTeleport} disabled={!teleLocationId}>
                                            Move Player
                                        </button>
                                    </div>
                                )}

                                {/* Message */}
                                <div className="admin-action-card">
                                    <p className="admin-section-title">✉ Send Message</p>
                                    <input
                                        className="chat-input"
                                        type="text"
                                        value={msgSubject}
                                        onChange={e => setMsgSubject(e.target.value)}
                                        placeholder="Subject..."
                                        style={{ fontSize: '14px', marginBottom: '6px', width: '100%' }}
                                    />
                                    <textarea
                                        className="chat-input"
                                        value={msgBody}
                                        onChange={e => setMsgBody(e.target.value)}
                                        placeholder="Message body..."
                                        rows={3}
                                        style={{ width: '100%', resize: 'none', fontSize: '14px' }}
                                    />
                                    <button className="btn" style={{ marginTop: '6px', fontSize: '13px' }} onClick={handleMessage}>Send</button>
                                </div>

                                {/* Mod permissions */}
                                {isAdmin && (
                                    <div className="admin-action-card" style={{ gridColumn: '1 / -1' }}>
                                        <p className="admin-section-title">🛡 Mod Permissions</p>
                                        <div className="admin-perms-grid">
                                            {Object.entries(pendingPerms).map(([key, value]) => (
                                                <label key={key} className="admin-perm-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={value}
                                                        onChange={e => setPendingPerms(prev => ({ ...prev, [key]: e.target.checked }))}
                                                    />
                                                    <span style={{ fontSize: '14px' }}>{key.replace(/_/g, ' ').replace('can ', 'Can ')}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <button className="btn btn-gold" style={{ marginTop: '8px', fontSize: '13px' }} onClick={handleUpdatePerms}>Save Permissions</button>
                                    </div>
                                )}
                            </div>

                            {/* Warning history */}
                            {warnings.length > 0 && (
                                <div className="admin-section" style={{ marginTop: '16px' }}>
                                    <p className="admin-section-title">Warning History</p>
                                    {warnings.map(w => (
                                        <div key={w.id} className="admin-history-item">
                                            <span className="muted-text" style={{ fontSize: '12px' }}>{formatDate(w.created_at)}</span>
                                            <span style={{ fontSize: '14px' }}>Strike {w.strike_number} — {w.reason}</span>
                                            <span className="muted-text" style={{ fontSize: '12px' }}>by {w.issued_by_name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Default online view */}
                    {view === 'online' && (
                        <div>
                            <p className="muted-text" style={{ fontStyle: 'italic', fontSize: '14px' }}>
                                Select a player from the list or search to view their details.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}