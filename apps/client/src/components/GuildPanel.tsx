import { useState, useEffect } from 'react'
import GuildForum from './GuildForum'
import { formatGameDate } from '../lib/time'
import { apiFetch } from '../lib/api'
import './GuildPanel.css'
import ConfirmModal from './ConfirmModal'
import { useIsMobile } from '../lib/useIsMobile'
import { useDockableWindow } from '../lib/useDockableWindow'
import DockableWindow from './DockableWindow'

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
    leader_id: number
    open_applications: boolean
    recruitment_message: string | null
    min_level_requirement: number
    tag_last_changed: string | null
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
    recruitment_message: string | null
    min_level_requirement: number
}

interface Application {
    id: number
    username: string
    message: string | null
    created_at: string
}

interface GuildPanelProps {
    onClose: () => void
    closing?: boolean
    playerUsername: string
    onViewProfile?: (playerId: number) => void
}

export default function GuildPanel({ onClose, closing, playerUsername, onViewProfile }: GuildPanelProps) {
    const [view, setView] = useState<'loading' | 'no_guild' | 'my_guild' | 'create' | 'browse'>('loading')
    const [tab, setTab] = useState<'overview' | 'members' | 'forum' | 'applications' | 'settings'>('overview')
    const [settingsName, setSettingsName] = useState('')
    const [settingsTag, setSettingsTag] = useState('')
    const [settingsDesc, setSettingsDesc] = useState('')
    const [settingsOpen, setSettingsOpen] = useState(true)
    const [settingsRecruitMsg, setSettingsRecruitMsg] = useState('')
    const [settingsMinLevel, setSettingsMinLevel] = useState(1)
    const [guild, setGuild] = useState<Guild | null>(null)
    const [members, setMembers] = useState<GuildMember[]>([])
    const [myRole, setMyRole] = useState<string | null>(null)
    const [guildList, setGuildList] = useState<GuildListItem[]>([])
    const [applications, setApplications] = useState<Application[]>([])
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)

    const [createName, setCreateName] = useState('')
    const [createTag, setCreateTag] = useState('')
    const [createDesc, setCreateDesc] = useState('')
    const [inviteUsername, setInviteUsername] = useState('')
    const [applyMessage, setApplyMessage] = useState('')
    const [applyingTo, setApplyingTo] = useState<GuildListItem | null>(null)

    const [invites, setInvites] = useState<any[]>([])

    const isMobile = useIsMobile()
    const dock = useDockableWindow('guild')

    useEffect(() => {
        loadGuildData()
    }, [])

    const loadGuildData = async () => {
        try {
            const data = await apiFetch<{ guild: Guild | null; members: GuildMember[]; myRole: string }>('/api/guilds/my')
            if (data.guild) {
                setGuild(data.guild)
                setGuild(data.guild)
                setSettingsName(data.guild.name)
                setSettingsTag(data.guild.tag)
                setSettingsDesc(data.guild.description || '')
                setSettingsOpen(data.guild.open_applications)
                setSettingsRecruitMsg(data.guild.recruitment_message || '')
                setSettingsMinLevel(data.guild.min_level_requirement || 1)
                setMembers(data.members)
                setMyRole(data.myRole)
                setView('my_guild')
                if (['founder', 'leader'].includes(data.myRole)) {
                    const appData = await apiFetch<{ applications: Application[] }>('/api/guilds/applications')
                    setApplications(appData.applications)
                }
            } else {
                // Load pending invites for guildless players
                const inviteData = await apiFetch<{ invites: any[] }>('/api/guilds/invites')
                setInvites(inviteData.invites || [])
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
            setSuccess(`${inviteUsername} has been invited to the guild!`)
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
    }

    const handleTransferLeadership = async (targetId: number, username: string) => {
        setConfirmDialog({
            message: `Transfer leadership to ${username}?`,
            onConfirm: async () => {
                setConfirmDialog(null)
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
    }

    const handleLeave = async () => {
        setConfirmDialog({
            message: 'Are you sure you want to leave the guild?',
            onConfirm: async () => {
                setConfirmDialog(null)
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

    const isLeader = ['founder', 'leader'].includes(myRole || '')

    const handleRespondInvite = async (inviteId: number, accept: boolean) => {
        try {
            const data = await apiFetch<{ message: string }>(`/api/guilds/invites/${inviteId}/respond`, {
                method: 'POST',
                body: JSON.stringify({ accept }),
            })
            setSuccess(data.message)
            await loadGuildData()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleSaveSettings = async () => {
        try {
            await apiFetch('/api/guilds/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    name: settingsName,
                    tag: settingsTag,
                    description: settingsDesc,
                    open_applications: settingsOpen,
                    recruitment_message: settingsRecruitMsg,
                    min_level_requirement: settingsMinLevel,
                }),
            })
            setSuccess('Guild settings saved!')
            loadGuildData()
        } catch (err: any) {
            setError(err.message)
        }
    }

    return (
        <>
            <DockableWindow
                dock={dock}
                enabled={!isMobile}
                onClose={onClose}
                className={`guild-panel ${closing ? 'closing' : ''}`}
                dragHandleClassName="guild-panel-header"
            >                <div className="guild-panel-header">
                    <h3 className="gold-text">
                        {view === 'my_guild' && guild ? `${guild.name} [${guild.tag}]` : 'Guild'}
                    </h3>
                    <div className="guild-header-actions">
                        {!isMobile && (
                            <>
                                <button className="dock-btn" onClick={dock.togglePop} title={dock.isPopped ? 'Dock panel' : 'Pop out'}>
                                    {dock.isPopped ? '⤡' : '⤢'}
                                </button>
                                {dock.isPopped && (
                                    <button className={`dock-btn ${dock.isPinned ? 'active' : ''}`} onClick={dock.togglePin} title={dock.isPinned ? 'Unpin (click-away closes)' : 'Pin on top'}>📌</button>
                                )}
                            </>
                        )}
                        <button className="modal-close-btn" onClick={onClose}>✕</button>
                    </div>
                </div>

                {error && <p className="guild-error" style={{ padding: '0 var(--space-lg)' }}>{error}</p>}
                {success && <p className="guild-success" style={{ padding: '0 var(--space-lg)' }}>{success}</p>}

                {/* Tabs for my_guild view */}
                {view === 'my_guild' && (
                    <div className="guild-panel-tabs">
                        <button className={`guild-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
                        <button className={`guild-tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>
                            Members ({members.length})
                        </button>
                        <button className={`guild-tab ${tab === 'forum' ? 'active' : ''}`} onClick={() => setTab('forum')}>
                            Forum
                        </button>
                        {['founder', 'leader'].includes(myRole || '') && (
                            <>
                                <button className={`guild-tab ${tab === 'applications' ? 'active' : ''}`} onClick={() => setTab('applications')}>
                                    Applications {applications.length > 0 && <span className="guild-tab-badge">{applications.length}</span>}
                                </button>
                                <button className={`guild-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
                                    Settings
                                </button>
                            </>
                        )}
                    </div>
                )}

                <div className="guild-panel-body">

                    {/* Loading */}
                    {view === 'loading' && (
                        <p className="muted-text" style={{ fontStyle: 'italic', fontSize: '14px' }}>Loading...</p>
                    )}

                    {/* No guild */}
                    {view === 'no_guild' && (
                        <div className="guild-no-guild">
                            {invites.length > 0 && (
                                <div className="guild-invites-section">
                                    <p className="guild-section-title">Pending Invitations ({invites.length})</p>
                                    {invites.map(inv => (
                                        <div key={inv.id} className="guild-application-item">
                                            <span className="gold-text" style={{ fontSize: '15px' }}>{inv.guild_name} [{inv.guild_tag}]</span>
                                            <p className="muted-text" style={{ fontSize: '13px', margin: '4px 0' }}>
                                                Invited by {inv.invited_by_name}
                                            </p>
                                            {inv.description && (
                                                <p className="muted-text" style={{ fontSize: '12px', fontStyle: 'italic', margin: '2px 0 6px' }}>{inv.description}</p>
                                            )}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                <button className="btn btn-gold" style={{ fontSize: '12px' }} onClick={() => handleRespondInvite(inv.id, true)}>Accept</button>
                                                <button className="btn btn-red" style={{ fontSize: '12px' }} onClick={() => handleRespondInvite(inv.id, false)}>Decline</button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="guild-divider" />
                                </div>
                            )}
                            <p className="muted-text" style={{ fontSize: '15px', marginBottom: '16px' }}>You are not in a guild.</p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-gold" onClick={() => setView('create')}>Create Guild</button>
                                <button className="btn" onClick={loadGuildList}>Browse Guilds</button>
                            </div>
                        </div>
                    )}

                    {/* Create guild */}
                    {view === 'create' && (
                        <div className="guild-create">
                            <div className="guild-form-group">
                                <label className="muted-text">Guild Name</label>
                                <input className="chat-input" type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Enter guild name..." maxLength={100} />
                            </div>
                            <div className="guild-form-group">
                                <label className="muted-text">Guild Tag (1–5 characters)</label>
                                <input className="chat-input" type="text" value={createTag} onChange={e => setCreateTag(e.target.value.toUpperCase())} placeholder="TAG" maxLength={5} style={{ width: '80px' }} />
                            </div>
                            <div className="guild-form-group">
                                <label className="muted-text">Description (optional)</label>
                                <input className="chat-input" type="text" value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="Enter guild description..." maxLength={200} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <button className="btn btn-gold" onClick={handleCreate}>Create Guild</button>
                                <button className="btn" onClick={() => setView('no_guild')}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* Browse guilds */}
                    {view === 'browse' && (
                        <div className="guild-browse">
                            {applyingTo ? (
                                <div className="guild-apply-form">
                                    <p className="gold-text" style={{ fontSize: '16px', marginBottom: '8px' }}>Apply to {applyingTo.name} [{applyingTo.tag}]</p>
                                    <textarea
                                        className="chat-input"
                                        value={applyMessage}
                                        onChange={e => setApplyMessage(e.target.value)}
                                        placeholder="Optional message to the guild leader..."
                                        rows={3}
                                        style={{ width: '100%', resize: 'none', fontSize: '14px' }}
                                    />
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                        <button className="btn btn-gold" onClick={handleApply}>Submit Application</button>
                                        <button className="btn" onClick={() => setApplyingTo(null)}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button className="btn" style={{ marginBottom: '12px', fontSize: '13px' }} onClick={() => setView('no_guild')}>← Back</button>
                                    {guildList.length === 0 ? (
                                        <p className="muted-text" style={{ fontSize: '14px' }}>No guilds exist yet.</p>
                                    ) : (
                                        guildList.map(g => (
                                            <div key={g.id} className="guild-list-item">
                                                <div className="guild-list-info">
                                                    <span className="gold-text" style={{ fontSize: '16px' }}>{g.name}</span>
                                                    <span className="muted-text" style={{ fontSize: '13px' }}>[{g.tag}]</span>
                                                    <span className="muted-text" style={{ fontSize: '12px' }}>{g.memberCount} members</span>
                                                </div>
                                                {g.description && <p className="guild-list-desc">{g.description}</p>}
                                                {g.recruitment_message && (
                                                    <p style={{ fontSize: '13px', fontStyle: 'italic', margin: '4px 0' }}>"{g.recruitment_message}"</p>
                                                )}
                                                <p className="muted-text" style={{ fontSize: '12px' }}>Leader: {g.leader_name}</p>
                                                {g.min_level_requirement > 1 && (
                                                    <p className="muted-text" style={{ fontSize: '12px' }}>
                                                        Min Total Level: <span className="gold-text">{g.min_level_requirement}</span>
                                                    </p>
                                                )}
                                                {g.open_applications && (
                                                    <button className="btn" style={{ fontSize: '12px', marginTop: '6px' }} onClick={() => setApplyingTo(g)}>Apply</button>
                                                )}
                                                {!g.open_applications && (
                                                    <p className="muted-text" style={{ fontSize: '12px', marginTop: '4px', fontStyle: 'italic' }}>Not accepting applications</p>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* My guild — Overview tab */}
                    {view === 'my_guild' && guild && tab === 'overview' && (
                        <div className="guild-overview">
                            <div className="guild-overview-info">
                                <div className="guild-overview-row">
                                    <span className="muted-text">Tag</span>
                                    <span className="gold-text" style={{ fontSize: '16px' }}>[{guild.tag}]</span>
                                </div>
                                <div className="guild-overview-row">
                                    <span className="muted-text">Founder</span>
                                    <span style={{ fontSize: '15px' }}>{guild.founderName}</span>
                                </div>
                                <div className="guild-overview-row">
                                    <span className="muted-text">Leader</span>
                                    <span style={{ fontSize: '15px' }}>{guild.leaderName}</span>
                                </div>
                                <div className="guild-overview-row">
                                    <span className="muted-text">Your Rank</span>
                                    <span style={{ fontSize: '15px' }}>{roleLabel(myRole || '')}</span>
                                </div>
                                <div className="guild-overview-row">
                                    <span className="muted-text">Members</span>
                                    <span style={{ fontSize: '15px' }}>{members.length}</span>
                                </div>
                            </div>
                            {guild.description && (
                                <p className="guild-overview-desc">{guild.description}</p>
                            )}
                            {isLeader && (
                                <div className="guild-invite-section">
                                    <p className="guild-section-title">Invite Player</p>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            className="chat-input"
                                            type="text"
                                            value={inviteUsername}
                                            onChange={e => setInviteUsername(e.target.value)}
                                            placeholder="Player name..."
                                            onKeyDown={e => e.key === 'Enter' && handleInvite()}
                                            style={{ flex: 1, fontSize: '14px' }}
                                        />
                                        <button className="btn btn-gold" onClick={handleInvite}>Invite</button>
                                    </div>
                                </div>
                            )}
                            {myRole !== 'founder' && (
                                <button className="btn btn-red" style={{ marginTop: '16px', fontSize: '13px' }} onClick={handleLeave}>
                                    Leave Guild
                                </button>
                            )}
                        </div>
                    )}

                    {/* My guild — Members tab */}
                    {/* The guild's own forum: its own boards, its own permissions. */}
                    {view === 'my_guild' && tab === 'forum' && <GuildForum />}

                    {view === 'my_guild' && tab === 'members' && (
                        <div className="guild-members">
                            {members.sort((a, b) => {
                                const roleOrder = { founder: 0, leader: 1, member: 2 }
                                return (roleOrder[a.role as keyof typeof roleOrder] ?? 3) - (roleOrder[b.role as keyof typeof roleOrder] ?? 3)
                            }).map(m => (
                                <div key={m.id} className="guild-member-item" style={{ cursor: 'pointer' }} onClick={() => onViewProfile?.(m.id)}>
                                    <div className="guild-member-status" style={{ background: m.online ? '#6ab87e' : '#c87e7e' }} />
                                    <div className="guild-member-info">
                                        <span className="guild-member-name" style={{ color: m.online ? '#6ab87e' : 'var(--color-text-base)', fontSize: '15px' }}>
                                            {m.username}
                                        </span>
                                        <span className="muted-text" style={{ fontSize: '12px' }}>{roleLabel(m.role)}</span>
                                        <span className="muted-text" style={{ fontSize: '12px' }}>
                                            {m.online ? `📍 ${m.location_name}` : `Last seen: ${formatLastSeen(m.last_seen)}`}
                                        </span>
                                    </div>
                                    {isLeader && m.username !== playerUsername && m.role !== 'founder' && (
                                        <div className="guild-member-actions" onClick={e => e.stopPropagation()}>
                                            {myRole === 'founder' && m.role !== 'leader' && (
                                                <button className="btn" style={{ fontSize: '11px' }} onClick={() => handleTransferLeadership(m.id, m.username)}>
                                                    Make Leader
                                                </button>
                                            )}
                                            <button className="btn btn-red" style={{ fontSize: '11px' }} onClick={() => handleKick(m.id, m.username)}>
                                                Kick
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* My guild — Applications tab */}
                    {view === 'my_guild' && tab === 'applications' && (
                        <div className="guild-applications">
                            {applications.length === 0 ? (
                                <p className="muted-text" style={{ fontSize: '14px', fontStyle: 'italic' }}>No pending applications.</p>
                            ) : (
                                applications.map(app => (
                                    <div key={app.id} className="guild-application-item">
                                        <span className="gold-text" style={{ fontSize: '15px' }}>{app.username}</span>
                                        {app.message && <p className="muted-text" style={{ fontSize: '13px', margin: '4px 0' }}>{app.message}</p>}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                            <button className="btn btn-gold" style={{ fontSize: '12px' }} onClick={() => handleRespondApplication(app.id, true)}>Accept</button>
                                            <button className="btn btn-red" style={{ fontSize: '12px' }} onClick={() => handleRespondApplication(app.id, false)}>Reject</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Settings tab */}
                    {view === 'my_guild' && tab === 'settings' && guild && (
                        <div className="guild-settings">
                            <div className="guild-form-group">
                                <label className="muted-text">Guild Name</label>
                                <input
                                    className="chat-input"
                                    type="text"
                                    value={settingsName}
                                    onChange={e => setSettingsName(e.target.value)}
                                    maxLength={100}
                                />
                            </div>

                            <div className="guild-form-group">
                                <label className="muted-text">
                                    Guild Tag
                                    {guild.tag_last_changed && (
                                        <span style={{ fontSize: '11px', marginLeft: '8px' }}>
                                            (last changed {formatGameDate(new Date(guild.tag_last_changed))}, 30 day cooldown)
                                        </span>
                                    )}
                                </label>
                                <input
                                    className="chat-input"
                                    type="text"
                                    value={settingsTag}
                                    onChange={e => setSettingsTag(e.target.value.toUpperCase())}
                                    maxLength={5}
                                    style={{ textTransform: 'uppercase' }}
                                />
                            </div>

                            <div className="guild-form-group">
                                <label className="muted-text">Description</label>
                                <textarea
                                    className="chat-input"
                                    value={settingsDesc}
                                    onChange={e => setSettingsDesc(e.target.value)}
                                    rows={3}
                                    maxLength={500}
                                />
                            </div>

                            <div className="guild-form-group">
                                <label className="muted-text">Recruitment Message</label>
                                <textarea
                                    className="chat-input"
                                    value={settingsRecruitMsg}
                                    onChange={e => setSettingsRecruitMsg(e.target.value)}
                                    rows={3}
                                    maxLength={500}
                                    placeholder="Shown to players browsing guild list..."
                                />
                            </div>

                            <div className="guild-form-group">
                                <label className="muted-text">Minimum Level Requirement</label>
                                <input
                                    className="chat-input"
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={settingsMinLevel}
                                    onChange={e => setSettingsMinLevel(parseInt(e.target.value))}
                                    style={{ width: '80px' }}
                                />
                            </div>

                            <div className="guild-form-group">
                                <label className="muted-text">
                                    <input
                                        type="checkbox"
                                        checked={settingsOpen}
                                        onChange={e => setSettingsOpen(e.target.checked)}
                                        style={{ marginRight: '8px' }}
                                    />
                                    Open Applications
                                </label>
                            </div>

                            <div className="guild-actions">
                                <button className="btn btn-gold" onClick={handleSaveSettings}>Save Settings</button>
                            </div>

                            <div className="divider" style={{ margin: '16px 0' }} />

                            <div className="guild-form-group">
                                <p className="muted-text" style={{ fontSize: '13px' }}>Danger Zone</p>
                                <button
                                    className="btn"
                                    style={{ color: 'var(--color-red-glow)', borderColor: 'var(--color-red-glow)', fontSize: '13px' }}
                                    onClick={() => setConfirmDialog({
                                        message: 'Are you sure you want to disband the guild? This cannot be undone.',
                                        onConfirm: async () => {
                                            try {
                                                await apiFetch('/api/guilds/disband', { method: 'POST' })
                                                loadGuildData()
                                            } catch (err: any) {
                                                setError(err.message)
                                            }
                                        }
                                    })}
                                >
                                    Disband Guild
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </DockableWindow>

            {confirmDialog && (
                <ConfirmModal
                    message={confirmDialog.message}
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </>
    )
}