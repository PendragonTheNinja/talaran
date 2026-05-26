import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './GuildModal.css'
import ConfirmModal from './ConfirmModal'

interface GuildMember {
    id: number
    username: string
    role: string
    location_name: string
    last_seen: string
    joined_at: string
    online: boolean
}

interface Guild {
    id: number
    name: string
    tag: string
    description: string | null
    founderName: string
    leaderName: string
    open_applications: boolean
}

interface GuildListItem {
    id: number
    name: string
    tag: string
    description: string | null
    founder_name: string
    leader_name: string
    memberCount: number
    open_applications: boolean
}

interface Application {
    id: number
    username: string
    message: string | null
    created_at: string
}

interface GuildModalProps {
    onClose: () => void
    playerUsername: string
}

export default function GuildModal({ onClose, playerUsername, onViewProfile }: GuildModalProps) {
    const [view, setView] = useState<'loading' | 'no_guild' | 'my_guild' | 'create' | 'browse'>('loading')
    const [guild, setGuild] = useState<Guild | null>(null)
    const [members, setMembers] = useState<GuildMember[]>([])
    const [myRole, setMyRole] = useState<string | null>(null)
    const [guildList, setGuildList] = useState<GuildListItem[]>([])
    const [applications, setApplications] = useState<Application[]>([])
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)

    // Create form
    const [createName, setCreateName] = useState('')
    const [createTag, setCreateTag] = useState('')
    const [createDesc, setCreateDesc] = useState('')

    // Invite form
    const [inviteUsername, setInviteUsername] = useState('')

    // Apply form
    const [applyMessage, setApplyMessage] = useState('')
    const [applyingTo, setApplyingTo] = useState<GuildListItem | null>(null)

    useEffect(() => {
        loadGuildData()
    }, [])

    const loadGuildData = async () => {
        try {
            const data = await apiFetch<{ guild: Guild | null; members: GuildMember[]; myRole: string }>('/api/guilds/my')
            if (data.guild) {
                setGuild(data.guild)
                setMembers(data.members)
                setMyRole(data.myRole)
                setView('my_guild')

                if (['founder', 'leader'].includes(data.myRole)) {
                    const appData = await apiFetch<{ applications: Application[] }>('/api/guilds/applications')
                    setApplications(appData.applications)
                }
            } else {
                setView('no_guild')
            }
        } catch (err) {
            setView('no_guild')
        }
    }

    const loadGuildList = async () => {
        try {
            const data = await apiFetch<{ guilds: GuildListItem[] }>('/api/guilds/list')
            setGuildList(data.guilds)
            setView('browse')
        } catch (err) {
            setError('Failed to load guilds.')
        }
    }

    const handleCreate = async () => {
        setError(null)
        try {
            await apiFetch('/api/guilds/create', {
                method: 'POST',
                body: JSON.stringify({ name: createName, tag: createTag, description: createDesc }),
            })
            setSuccess('Guild created!')
            await loadGuildData()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleInvite = async () => {
        setError(null)
        try {
            await apiFetch('/api/guilds/invite', {
                method: 'POST',
                body: JSON.stringify({ username: inviteUsername }),
            })
            setSuccess(`${inviteUsername} has been added to the guild!`)
            setInviteUsername('')
            await loadGuildData()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleKick = async (targetId: number, username: string) => {
        setConfirmDialog({
            message: `Kick ${username} from the guild?`,
            onConfirm: async () => {
                setConfirmDialog(null)
                setError(null)
                try {
                    await apiFetch('/api/guilds/kick', {
                        method: 'POST',
                        body: JSON.stringify({ targetPlayerId: targetId }),
                    })
                    setSuccess(`${username} has been kicked.`)
                    await loadGuildData()
                } catch (err: any) {
                    setError(err.message)
                }
            }
        })
        return
    }

    const handleTransferLeadership = async (targetId: number, username: string) => {
        setConfirmDialog({
            message: `Transfer leadership to ${username}?`,
            onConfirm: async () => {
                setConfirmDialog(null)
                setError(null)
                try {
                    await apiFetch('/api/guilds/transfer-leadership', {
                        method: 'POST',
                        body: JSON.stringify({ targetPlayerId: targetId }),
                    })
                    setSuccess(`Leadership transferred to ${username}.`)
                    await loadGuildData()
                } catch (err: any) {
                    setError(err.message)
                }
            }
        })
        return
    }

    const handleLeave = async () => {
        setConfirmDialog({
            message: 'Are you sure you want to leave the guild?',
            onConfirm: async () => {
                setConfirmDialog(null)
                setError(null)
                try {
                    await apiFetch('/api/guilds/leave', { method: 'POST' })
                    setSuccess('You have left the guild.')
                    setView('no_guild')
                    setGuild(null)
                } catch (err: any) {
                    setError(err.message)
                }
            }
        })
        return
    }

    const handleApply = async () => {
        if (!applyingTo) return
        setError(null)
        try {
            await apiFetch('/api/guilds/apply', {
                method: 'POST',
                body: JSON.stringify({ guildId: applyingTo.id, message: applyMessage }),
            })
            setSuccess(`Application sent to ${applyingTo.name}!`)
            setApplyingTo(null)
            setApplyMessage('')
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleRespondApplication = async (appId: number, accept: boolean) => {
        try {
            await apiFetch(`/api/guilds/applications/${appId}/respond`, {
                method: 'POST',
                body: JSON.stringify({ accept }),
            })
            setSuccess(accept ? 'Application accepted!' : 'Application rejected.')
            await loadGuildData()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const roleLabel = (role: string) => {
        if (role === 'founder') return '👑 Founder'
        if (role === 'leader') return '⚔ Leader'
        return 'Member'
    }

    const formatLastSeen = (lastSeen: string) => {
        if (!lastSeen) return 'Never'
        const date = new Date(lastSeen)
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)
        if (minutes < 2) return 'Just now'
        if (minutes < 60) return `${minutes}m ago`
        if (hours < 24) return `${hours}h ago`
        return `${days}d ago`
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="guild-modal" onClick={e => e.stopPropagation()}>
                <div className="guild-modal-header">
                    <h2 className="gold-text">
                        {view === 'my_guild' && guild ? `${guild.name} [${guild.tag}]` : 'Guild'}
                    </h2>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                {error && <p className="guild-error">{error}</p>}
                {success && <p className="guild-success">{success}</p>}

                {/* No guild view */}
                {view === 'no_guild' && (
                    <div className="guild-no-guild">
                        <p className="muted-text">You are not in a guild.</p>
                        <div className="guild-actions">
                            <button className="btn btn-gold" onClick={() => setView('create')}>Create Guild</button>
                            <button className="btn" onClick={loadGuildList}>Browse Guilds</button>
                        </div>
                    </div>
                )}

                {/* Create guild view */}
                {view === 'create' && (
                    <div className="guild-create">
                        <div className="guild-form-group">
                            <label className="muted-text">Guild Name</label>
                            <input
                                className="chat-input"
                                type="text"
                                value={createName}
                                onChange={e => setCreateName(e.target.value)}
                                placeholder="Enter guild name..."
                                maxLength={100}
                            />
                        </div>
                        <div className="guild-form-group">
                            <label className="muted-text">Guild Tag (1-5 characters)</label>
                            <input
                                className="chat-input"
                                type="text"
                                value={createTag}
                                onChange={e => setCreateTag(e.target.value.toUpperCase())}
                                placeholder="TAG"
                                maxLength={5}
                                style={{ width: '80px' }}
                            />
                        </div>
                        <div className="guild-form-group">
                            <label className="muted-text">Description (optional)</label>
                            <input
                                className="chat-input"
                                type="text"
                                value={createDesc}
                                onChange={e => setCreateDesc(e.target.value)}
                                placeholder="Enter guild description..."
                                maxLength={200}
                            />
                        </div>
                        <div className="guild-actions">
                            <button className="btn btn-gold" onClick={handleCreate}>Create Guild</button>
                            <button className="btn" onClick={() => setView('no_guild')}>Cancel</button>
                        </div>
                    </div>
                )}

                {/* Browse guilds view */}
                {view === 'browse' && (
                    <div className="guild-browse">
                        {applyingTo ? (
                            <div className="guild-apply-form">
                                <p className="gold-text">Apply to {applyingTo.name} [{applyingTo.tag}]</p>
                                <textarea
                                    className="chat-input"
                                    value={applyMessage}
                                    onChange={e => setApplyMessage(e.target.value)}
                                    placeholder="Optional message to the guild leader..."
                                    rows={3}
                                    style={{ width: '100%', resize: 'none' }}
                                />
                                <div className="guild-actions">
                                    <button className="btn btn-gold" onClick={handleApply}>Submit Application</button>
                                    <button className="btn" onClick={() => setApplyingTo(null)}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <button className="btn" style={{ marginBottom: '8px' }} onClick={() => setView('no_guild')}>← Back</button>
                                {guildList.length === 0 ? (
                                    <p className="muted-text">No guilds exist yet.</p>
                                ) : (
                                    guildList.map(g => (
                                        <div key={g.id} className="guild-list-item">
                                            <div className="guild-list-info">
                                                <span className="gold-text">{g.name}</span>
                                                <span className="muted-text">[{g.tag}]</span>
                                                <span className="muted-text" style={{ fontSize: '12px' }}>{g.memberCount} members</span>
                                            </div>
                                            {g.description && <p className="guild-list-desc">{g.description}</p>}
                                            <div className="guild-list-meta muted-text">
                                                Leader: {g.leader_name}
                                            </div>
                                            {g.open_applications && (
                                                <button className="btn" style={{ fontSize: '12px', marginTop: '4px' }} onClick={() => setApplyingTo(g)}>
                                                    Apply
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* My guild view */}
                {view === 'my_guild' && guild && (
                    <div className="guild-my-guild">
                        <div className="guild-info-row muted-text">
                            <span>Founder: <span className="gold-text">{guild.founderName}</span></span>
                            <span>Leader: <span className="gold-text">{guild.leaderName}</span></span>
                        </div>

                        {/* Pending applications */}
                        {applications.length > 0 && (
                            <div className="guild-applications">
                                <p className="guild-section-title gold-text">Pending Applications ({applications.length})</p>
                                {applications.map(app => (
                                    <div key={app.id} className="guild-application-item">
                                        <span className="gold-text">{app.username}</span>
                                        {app.message && <p className="muted-text" style={{ fontSize: '12px' }}>{app.message}</p>}
                                        <div className="guild-actions">
                                            <button className="btn btn-gold" style={{ fontSize: '11px' }} onClick={() => handleRespondApplication(app.id, true)}>Accept</button>
                                            <button className="btn btn-red" style={{ fontSize: '11px' }} onClick={() => handleRespondApplication(app.id, false)}>Reject</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Invite */}
                        {['founder', 'leader'].includes(myRole || '') && (
                            <div className="guild-invite">
                                <p className="guild-section-title gold-text">Invite Player</p>
                                <div className="guild-invite-row">
                                    <input
                                        className="chat-input"
                                        type="text"
                                        value={inviteUsername}
                                        onChange={e => setInviteUsername(e.target.value)}
                                        placeholder="Player name..."
                                        onKeyDown={e => e.key === 'Enter' && handleInvite()}
                                    />
                                    <button className="btn btn-gold" onClick={handleInvite}>Invite</button>
                                </div>
                            </div>
                        )}

                        {/* Members list */}
                        <p className="guild-section-title gold-text">Members ({members.length})</p>
                        <div className="guild-members-list">
                            {members.sort((a, b) => {
                                const roleOrder = { founder: 0, leader: 1, member: 2 }
                                return (roleOrder[a.role as keyof typeof roleOrder] ?? 3) - (roleOrder[b.role as keyof typeof roleOrder] ?? 3)
                            }).map(m => (
                                <div key={m.id} className="guild-member-item" style={{ cursor: 'pointer' }} onClick={() => onViewProfile?.(m.id)}>
                                    <div className="guild-member-status" style={{ background: m.online ? '#6ab87e' : '#c87e7e' }} />
                                    <div className="guild-member-info">
                                        <span className="guild-member-name" style={{ color: m.online ? '#6ab87e' : '#c87e7e' }}>
                                            {m.username}
                                        </span>
                                        <span className="muted-text" style={{ fontSize: '11px' }}>{roleLabel(m.role)}</span>
                                        <span className="muted-text" style={{ fontSize: '11px' }}>{m.location_name}</span>
                                        <span className="muted-text" style={{ fontSize: '11px' }}>
                                            {m.online ? 'Online' : formatLastSeen(m.last_seen)}
                                        </span>
                                    </div>
                                    {['founder', 'leader'].includes(myRole || '') && m.username !== playerUsername && m.role !== 'founder' && (
                                        <div className="guild-member-actions">
                                            {myRole === 'founder' && m.role !== 'leader' && (
                                                <button className="btn" style={{ fontSize: '10px' }} onClick={() => handleTransferLeadership(m.id, m.username)}>
                                                    Make Leader
                                                </button>
                                            )}
                                            <button className="btn btn-red" style={{ fontSize: '10px' }} onClick={() => handleKick(m.id, m.username)}>
                                                Kick
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Leave */}
                        {myRole !== 'founder' && (
                            <button className="btn btn-red" style={{ marginTop: '8px', fontSize: '12px' }} onClick={handleLeave}>
                                Leave Guild
                            </button>
                        )}
                    </div>
                )}
            </div>
            {confirmDialog && (
                <ConfirmModal
                    message={confirmDialog.message}
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </div>
    )
}