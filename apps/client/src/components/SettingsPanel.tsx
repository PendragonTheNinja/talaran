import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './SettingsPanel.css'
import { useIsMobile } from '../lib/useIsMobile'
import { useDockableWindow } from '../lib/useDockableWindow'
import DockableWindow from './DockableWindow'

interface SettingsPanelProps {
    onClose: () => void
    closing?: boolean
}

export default function SettingsPanel({ onClose, closing }: SettingsPanelProps) {
    const [tab, setTab] = useState<'account' | 'chat' | 'game'>('account')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Account fields
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [emailPassword, setEmailPassword] = useState('')
    const [showTravelLog, setShowTravelLog] = useState(true)

    // Chat settings
    const [mutedChannels, setMutedChannels] = useState<Record<string, boolean>>({
        world: false,
        region: false,
        trade: false,
        help: false,
    })

    const isMobile = useIsMobile()
    const dock = useDockableWindow('settings')

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        try {
            const data = await apiFetch<{ mutedChannels: string[]; showTravelLog?: boolean }>('/api/settings')
            const muted: Record<string, boolean> = {
                world: false,
                region: false,
                trade: false,
                help: false,
            }
            data.mutedChannels?.forEach(ch => { muted[ch] = true })
            setMutedChannels(muted)
            setShowTravelLog(data.showTravelLog ?? true)
        } catch (err) { }
    }

    const handlePasswordChange = async () => {
        setError(null)
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('All fields are required.')
            return
        }
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.')
            return
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.')
            return
        }
        try {
            await apiFetch('/api/settings/password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword }),
            })
            setSuccess('Password updated!')
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleEmailChange = async () => {
        setError(null)
        if (!newEmail || !emailPassword) {
            setError('Email and password are required.')
            return
        }
        try {
            await apiFetch('/api/settings/email', {
                method: 'POST',
                body: JSON.stringify({ newEmail, password: emailPassword }),
            })
            setSuccess('Email updated!')
            setNewEmail('')
            setEmailPassword('')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleChannelToggle = async (channel: string) => {
        const newMuted = { ...mutedChannels, [channel]: !mutedChannels[channel] }
        setMutedChannels(newMuted)
        try {
            const muted = Object.entries(newMuted).filter(([, v]) => v).map(([k]) => k)
            await apiFetch('/api/settings/chat', {
                method: 'POST',
                body: JSON.stringify({ mutedChannels: muted }),
            })
        } catch (err) {
            // Revert on error
            setMutedChannels(mutedChannels)
        }
    }

    const handleTravelLogToggle = async () => {
        const next = !showTravelLog
        setShowTravelLog(next)
        try {
            await apiFetch('/api/settings/travel-log', {
                method: 'POST',
                body: JSON.stringify({ showTravelLog: next }),
            })
        } catch (err) {
            setShowTravelLog(!next) // revert on failure
        }
    }

    const TABS = [
        { key: 'account', label: 'Account' },
        { key: 'chat', label: 'Chat' },
        { key: 'game', label: 'Game' },
    ]

    return (
        <DockableWindow
            dock={dock}
            enabled={!isMobile}
            onClose={onClose}
            className={`settings-panel ${closing ? 'closing' : ''}`}
            dragHandleClassName="settings-header"
        >
            <div className="settings-header">
                <h3 className="gold-text">Settings</h3>
                <div className="settings-header-actions">
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

            <div className="settings-tabs">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        className={`settings-tab ${tab === t.key ? 'active' : ''}`}
                        onClick={() => setTab(t.key as any)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {error && <p className="guild-error" style={{ padding: '0 var(--space-lg)' }}>{error}</p>}
            {success && <p className="guild-success" style={{ padding: '0 var(--space-lg)' }}>{success}</p>}

            <div className="settings-body">

                {/* Account tab */}
                {tab === 'account' && (
                    <div className="settings-section-group">
                        <div className="settings-section">
                            <h4 className="settings-section-title">Change Password</h4>
                            <div className="settings-field">
                                <label className="muted-text">Current Password</label>
                                <input
                                    className="chat-input"
                                    type="password"
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    placeholder="Current password"
                                />
                            </div>
                            <div className="settings-field">
                                <label className="muted-text">New Password</label>
                                <input
                                    className="chat-input"
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="New password"
                                />
                            </div>
                            <div className="settings-field">
                                <label className="muted-text">Confirm New Password</label>
                                <input
                                    className="chat-input"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handlePasswordChange()}
                                    placeholder="Confirm new password"
                                />
                            </div>
                            <button className="btn btn-gold" onClick={handlePasswordChange}>
                                Update Password
                            </button>
                        </div>

                        <div className="settings-divider" />

                        <div className="settings-section">
                            <h4 className="settings-section-title">Change Email</h4>
                            <div className="settings-field">
                                <label className="muted-text">New Email</label>
                                <input
                                    className="chat-input"
                                    type="email"
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    placeholder="New email address"
                                />
                            </div>
                            <div className="settings-field">
                                <label className="muted-text">Current Password</label>
                                <input
                                    className="chat-input"
                                    type="password"
                                    value={emailPassword}
                                    onChange={e => setEmailPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleEmailChange()}
                                    placeholder="Confirm with your password"
                                />
                            </div>
                            <button className="btn btn-gold" onClick={handleEmailChange}>
                                Update Email
                            </button>
                        </div>
                    </div>
                )}

                {/* Chat tab */}
                {tab === 'chat' && (
                    <div className="settings-section">
                        <h4 className="settings-section-title">Chat Channels</h4>
                        <p className="muted-text" style={{ fontSize: '14px', marginBottom: '16px' }}>
                            Muted channels will not display messages in your chat feed. Guild chat and system messages cannot be muted.
                        </p>
                        {[
                            { key: 'world', label: 'World Chat', desc: 'General chat visible to all players.' },
                            { key: 'region', label: 'Region Chat', desc: 'Chat visible to players on the same island.' },
                            { key: 'trade', label: 'Trade Chat', desc: 'Buying, selling, and auction listings.' },
                            { key: 'help', label: 'Help Chat', desc: 'Game questions and answers.' },
                        ].map(ch => (
                            <div key={ch.key} className="settings-toggle-row">
                                <div className="settings-toggle-info">
                                    <span className="settings-toggle-label">{ch.label}</span>
                                    <span className="muted-text" style={{ fontSize: '13px' }}>{ch.desc}</span>
                                </div>
                                <button
                                    className={`settings-toggle-btn ${mutedChannels[ch.key] ? 'muted' : 'active'}`}
                                    onClick={() => handleChannelToggle(ch.key)}
                                >
                                    {mutedChannels[ch.key] ? 'Muted' : 'Visible'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Game tab */}
                {tab === 'game' && (
                    <div className="settings-section">
                        <h4 className="settings-section-title">Game Options</h4>
                        <div className="settings-toggle-row">
                            <div className="settings-toggle-info">
                                <span className="settings-toggle-label">Travel Log</span>
                                <span className="muted-text" style={{ fontSize: '13px' }}>
                                    Show your journey log automatically when you find an item while traveling.
                                </span>
                            </div>
                            <button
                                className={`settings-toggle-btn ${showTravelLog ? 'active' : 'muted'}`}
                                onClick={handleTravelLogToggle}
                            >
                                {showTravelLog ? 'On' : 'Off'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </DockableWindow>
    )
}