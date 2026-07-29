import { useState, useEffect } from 'react'
import { setItemAnimationEnabled } from '../lib/itemFly'
import { apiFetch } from '../lib/api'
import './SettingsPanel.css'
import { useIsMobile } from '../lib/useIsMobile'
import { useDockableWindow } from '../lib/useDockableWindow'
import DockableWindow from './DockableWindow'
import { THEMES, applyTheme, previewTheme, currentTheme, initTheme, saveTheme, type ThemeId } from '../lib/theme'
import PaletteEditor from './PaletteEditor'
import PaletteGallery from './PaletteGallery'

interface SettingsPanelProps {
    onClose: () => void
    closing?: boolean
}

export default function SettingsPanel({ onClose, closing }: SettingsPanelProps) {
    const [tab, setTab] = useState<'account' | 'chat' | 'game' | 'themes'>('account')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Account fields
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [emailPassword, setEmailPassword] = useState('')
    const [showTravelLog, setShowTravelLog] = useState(true)
    const [showItemAnimation, setShowItemAnimation] = useState(true)
    const [hideTallyWhenBuilt, setHideTallyWhenBuilt] = useState(false)
    const [activeTheme, setActiveTheme] = useState<string>(() => {
        try { return localStorage.getItem('talaran-theme') ?? currentTheme() } catch { return currentTheme() }
    })
    const [previewing, setPreviewing] = useState<ThemeId | null>(null)
    const [store, setStore] = useState<{ balance: number; items: { key: string; name: string; price: number; effectivePrice: number; grants: string[]; available: boolean; owned: boolean }[] } | null>(null)

    useEffect(() => {
        apiFetch<NonNullable<typeof store>>('/api/store')
            .then(setStore)
            .catch(() => { /* store optional; picker degrades to free themes */ })
    }, [])

    const themeOwned = (id: ThemeId): boolean => {
        const meta = THEMES.find(t => t.id === id)
        if (!meta?.premium) return true
        return !!store?.items.find(i => i.key === `theme:${id}`)?.owned
    }

    const themePrice = (id: ThemeId): number | null =>
        store?.items.find(i => i.key === `theme:${id}`)?.price ?? null

    const handleThemeSelect = async (id: ThemeId) => {
        if (!themeOwned(id)) return
        applyTheme(id)            // instant, live
        setActiveTheme(id)
        setPreviewing(null)
        try {
            await saveTheme(id)   // persists across devices
        } catch {
            setError('Theme applied but could not be saved — it may reset on another device.')
        }
    }

    const handlePreview = (id: ThemeId) => {
        previewTheme(id)          // visual only — nothing saved
        setPreviewing(id)
    }

    const endPreview = () => {
        initTheme()               // restores the saved theme, palettes included
        setPreviewing(null)
    }

    const handleBuy = async (key: string, name: string, price: number) => {
        if (!window.confirm(`Unlock ${name} for ${price} Talers?`)) return
        try {
            const res = await apiFetch<{ balance: number }>('/api/store/purchase', {
                method: 'POST',
                body: JSON.stringify({ key }),
            })
            const refreshed = await apiFetch<NonNullable<typeof store>>('/api/store')
            setStore({ ...refreshed, balance: res.balance })
            setError(null)
            // Buying a single theme? Wear it immediately.
            if (key.startsWith('theme:')) handleThemeSelect(key.slice(6) as ThemeId)
        } catch (err: any) {
            setError(err.message === 'Not enough Talers.'
                ? 'Not enough Talers — you can get more in the ♥ Support panel.'
                : err.message || 'Purchase failed.')
        }
    }

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
            const data = await apiFetch<{ mutedChannels: string[]; showTravelLog?: boolean; showItemAnimation?: boolean; hideTallyWhenBuilt?: boolean }>('/api/settings')
            const muted: Record<string, boolean> = {
                world: false,
                region: false,
                trade: false,
                help: false,
            }
            data.mutedChannels?.forEach(ch => { muted[ch] = true })
            setMutedChannels(muted)
            setShowTravelLog(data.showTravelLog ?? true)
            setShowItemAnimation(data.showItemAnimation ?? true)
            setHideTallyWhenBuilt(data.hideTallyWhenBuilt ?? false)
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

    const handleTallyLinkToggle = async () => {
        const next = !hideTallyWhenBuilt
        setHideTallyWhenBuilt(next)
        try {
            await apiFetch('/api/settings/tally-link', {
                method: 'POST',
                body: JSON.stringify({ hideTallyWhenBuilt: next }),
            })
        } catch (err) {
            setHideTallyWhenBuilt(!next) // revert on failure
        }
    }

    const handleItemAnimationToggle = async () => {
        const next = !showItemAnimation
        setShowItemAnimation(next)
        // Apply immediately so the next find reflects the choice without a reload.
        setItemAnimationEnabled(next)
        try {
            await apiFetch('/api/settings/item-animation', {
                method: 'POST',
                body: JSON.stringify({ showItemAnimation: next }),
            })
        } catch (err) {
            setShowItemAnimation(!next) // revert on failure
            setItemAnimationEnabled(!next)
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
        { key: 'themes', label: 'Themes' },
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
                {tab === 'themes' && (
                    <div className="settings-section">
                        <h4 className="settings-section-title">
                            Theme
                            {store && <span className="muted-text settings-theme-balance">Your Talers: <span className="gold-text">{store.balance.toLocaleString()}</span></span>}
                        </h4>
                        {previewing && (
                            <p className="settings-previewing">
                                Previewing <span className="gold-text">{THEMES.find(t => t.id === previewing)?.name}</span> — nothing saved yet.
                                <button className="btn" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px' }} onClick={endPreview}>Revert</button>
                            </p>
                        )}
                        <div className="settings-theme-grid">
                            {THEMES.map(t => {
                                const owned = themeOwned(t.id)
                                const price = t.premium ? themePrice(t.id) : null
                                return (
                                    <div
                                        key={t.id}
                                        className={`settings-theme-card ${activeTheme === t.id ? 'active' : ''} ${!owned ? 'locked' : ''}`}
                                        onClick={owned ? () => handleThemeSelect(t.id) : undefined}
                                        role="button"
                                    >
                                        <span className="settings-theme-swatches">
                                            {t.swatches.map((c, i) => (
                                                <span key={i} className="settings-theme-swatch" style={{ background: c }} />
                                            ))}
                                        </span>
                                        <span className="settings-theme-name">
                                            {t.name}
                                            {t.premium && !owned && <span className="settings-theme-price gold-text"> · {price ?? 300} Talers</span>}
                                        </span>
                                        <span className="muted-text" style={{ fontSize: '12px' }}>{t.description}</span>
                                        {activeTheme === t.id && <span className="settings-theme-active gold-text">✓ Active</span>}
                                        {!owned && (
                                            <span className="settings-theme-actions">
                                                <button className="btn" onClick={(e) => { e.stopPropagation(); handlePreview(t.id) }}>Try it</button>
                                                <button className="btn btn-gold" onClick={(e) => { e.stopPropagation(); handleBuy(`theme:${t.id}`, t.name, price ?? 300) }}>Unlock</button>
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        {store && (() => {
                            const bundle = store.items.find(i => i.key === 'bundle:themes')
                            if (!bundle || bundle.owned) return null
                            const missing = bundle.grants.filter(g => !store.items.find(i => i.key === g)?.owned).length
                            const individually = missing * 300
                            const label = missing === bundle.grants.length
                                ? `All three premium themes — save ${individually - bundle.effectivePrice} Talers`
                                : `Complete the set (${missing} remaining) — save ${individually - bundle.effectivePrice} Talers`
                            return (
                                <div className="settings-theme-bundle">
                                    <span>
                                        <span className="settings-theme-name">{bundle.name}</span>
                                        <span className="muted-text" style={{ fontSize: '12px', marginLeft: '8px' }}>{label}</span>
                                    </span>
                                    <button className="btn btn-gold" onClick={() => handleBuy(bundle.key, bundle.name, bundle.effectivePrice)}>
                                        {bundle.effectivePrice} Talers
                                    </button>
                                </div>
                            )
                        })()}
                        <PaletteEditor
                            hasPerk={!!store?.items.find(i => i.key === 'perk:custom_palette')?.owned}
                            perkPrice={store?.items.find(i => i.key === 'perk:custom_palette')?.effectivePrice ?? 1500}
                            onPurchasePerk={() => {
                                const perk = store?.items.find(i => i.key === 'perk:custom_palette')
                                if (perk) handleBuy(perk.key, perk.name, perk.effectivePrice)
                            }}
                            activeTheme={activeTheme}
                            onApplied={setActiveTheme}
                            onError={setError}
                        />
                        <PaletteGallery
                            hasPerk={!!store?.items.find(i => i.key === 'perk:custom_palette')?.owned}
                            activeTheme={activeTheme}
                            onApplied={setActiveTheme}
                            onError={setError}
                        />
                    </div>
                )}

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

                        <div className="settings-toggle-row">
                            <div className="settings-toggle-info">
                                <span className="settings-toggle-label">Item Animation</span>
                                <span className="muted-text" style={{ fontSize: '13px' }}>
                                    Fly found items into your pack. Turn this off for a quieter screen.
                                </span>
                            </div>
                            <button
                                className={`settings-toggle-btn ${showItemAnimation ? 'active' : 'muted'}`}
                                onClick={handleItemAnimationToggle}
                            >
                                {showItemAnimation ? 'On' : 'Off'}
                            </button>
                        </div>

                        <div className="settings-toggle-row">
                            <div className="settings-toggle-info">
                                <span className="settings-toggle-label">Hide Tally Board Link</span>
                                <span className="muted-text" style={{ fontSize: '13px' }}>
                                    Once a board is built, hide its link everywhere on that island
                                    except where the board itself stands.
                                </span>
                            </div>
                            <button
                                className={`settings-toggle-btn ${hideTallyWhenBuilt ? 'active' : 'muted'}`}
                                onClick={handleTallyLinkToggle}
                            >
                                {hideTallyWhenBuilt ? 'On' : 'Off'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </DockableWindow>
    )
}