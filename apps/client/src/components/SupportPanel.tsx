import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { openTalerCheckout, paddleConfigured } from '../lib/paddle'
import DockableWindow from './DockableWindow'
import { useDockableWindow } from '../lib/useDockableWindow'
import { useIsMobile } from '../lib/useIsMobile'
import { useTalerStore, type SupportTab } from '../lib/talerStore'
import { openSettings } from '../lib/avatar'
import { THEMES, applyTheme, previewTheme, initTheme, saveTheme, type ThemeId } from '../lib/theme'
import ConfirmModal from './ConfirmModal'
import './SupportPanel.css'
import './SettingsPanel.css'

interface Tier {
    usdCents: number
    talers: number
    bonusLabel: string | null
    paddlePriceId: string | null
    available: boolean
}

interface LedgerEntry {
    delta: number
    reason: string
    created_at: string
}

interface SupportPanelProps {
    playerId: number
    onClose: () => void
    closing?: boolean
    /** Guests have no email, so Paddle checkout cannot complete for them. */
    isGuest?: boolean
    /** Open at this tab (lib/talerStore.ts openSupport). */
    initialTab?: SupportTab
}

/** The theme bundle saves this much against buying each missing theme alone. */
const SINGLE_THEME_PRICE = 300

/** A seasonal item's last day on sale, as '31 October' (UTC, the store's clock). */
function lastSaleDay(saleEndsAt: string | null): string | null {
    if (!saleEndsAt) return null
    return new Date(new Date(saleEndsAt).getTime() - 1)
        .toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** Where a perk is used, once owned: the Settings tab that holds it. */
const PERK_SETTINGS: Record<string, string> = {
    'perk:custom_palette': 'themes',
    'perk:custom_sound': 'game',
}

const REASON_LABELS: Record<string, string> = {
    purchase: 'Taler purchase',
    unlock: 'Unlock',
    admin_grant: 'Grant',
}

export default function SupportPanel({ playerId, onClose, closing, isGuest, initialTab }: SupportPanelProps) {
    const [tab, setTab] = useState<SupportTab>(initialTab ?? 'talers')
    const { store, buy: buyItem, item, owns } = useTalerStore()
    const [confirmBuy, setConfirmBuy] = useState<{ key: string; name: string; price: number } | null>(null)
    const [previewing, setPreviewing] = useState<ThemeId | null>(null)
    const [balance, setBalance] = useState<number | null>(null)
    const [history, setHistory] = useState<LedgerEntry[]>([])
    const [tiers, setTiers] = useState<Tier[]>([])
    const [error, setError] = useState<string | null>(null)
    const [crediting, setCrediting] = useState(false)
    const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
    const isMobile = useIsMobile()
    const dock = useDockableWindow('support')

    const loadBalance = async () => {
        const d = await apiFetch<{ balance: number; history: LedgerEntry[] }>('/api/talers')
        setBalance(d.balance)
        setHistory(d.history)
        return d.balance
    }

    useEffect(() => {
        loadBalance().catch(() => setError('Could not load your Taler balance.'))
        apiFetch<{ tiers: Tier[] }>('/api/talers/tiers')
            .then(d => setTiers(d.tiers))
            .catch(() => setError('Could not load support tiers.'))
        return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
    }, [])

    // A theme tried on here is only ever a preview: closing the panel puts
    // back whatever the player actually wears.
    const previewingRef = useRef<ThemeId | null>(null)
    useEffect(() => { previewingRef.current = previewing }, [previewing])
    useEffect(() => () => { if (previewingRef.current) initTheme() }, [])

    const tryTheme = (id: ThemeId) => { previewTheme(id); setPreviewing(id) }
    const endPreview = () => { initTheme(); setPreviewing(null) }

    const wearTheme = async (id: ThemeId) => {
        applyTheme(id)
        setPreviewing(null)
        try { await saveTheme(id) } catch { setError('Theme applied but could not be saved. It may reset on another device.') }
    }

    /** Buy a theme or perk with Talers, after the confirmation. */
    const purchase = async (key: string) => {
        setError(null)
        try {
            const res = await buyItem(key)
            setBalance(res.balance)
            // A single theme bought is worn at once.
            if (key.startsWith('theme:')) await wearTheme(key.slice('theme:'.length) as ThemeId)
            loadBalance().catch(() => { })
        } catch (err) {
            const message = (err as { message?: string }).message
            setError(message === 'Not enough Talers.'
                ? 'Not enough Talers. You can buy more on the Talers tab.'
                : message || 'Purchase failed.')
        }
    }

    // After Paddle reports completion, the webhook credits asynchronously —
    // poll until the balance moves (up to ~30s), then celebrate.
    const startCreditPolling = (before: number) => {
        setCrediting(true)
        let attempts = 0
        pollTimer.current = setInterval(async () => {
            attempts++
            try {
                const now = await loadBalance()
                if (now > before || attempts >= 15) {
                    if (pollTimer.current) clearInterval(pollTimer.current)
                    setCrediting(false)
                    if (now <= before) setError('Payment received — Talers are taking longer than usual to arrive. They will appear shortly.')
                }
            } catch { /* keep polling */ }
        }, 2000)
    }

    const buy = async (tier: Tier) => {
        if (!tier.paddlePriceId) return
        // Stopped here rather than at the server. Paddle needs an email to bill,
        // so a guest reaching checkout gets its generic "something went wrong",
        // which reads as the store being broken rather than as a restriction.
        if (isGuest) {
            setError('Claim your character first. Talers need an account with an email address.')
            return
        }
        setError(null)
        try {
            const before = balance ?? 0
            await openTalerCheckout(tier.paddlePriceId, playerId, () => startCreditPolling(before))
        } catch (err: any) {
            setError(err.message || 'Could not open checkout.')
        }
    }

    return (
        <DockableWindow
            dock={dock}
            enabled={!isMobile}
            onClose={onClose}
            className={`support-panel-window ${closing ? 'closing' : ''}`}
            dragHandleClassName="support-header"
        >
            <div className="support-header">
                <h3 className="gold-text">Support the Game</h3>
                <div className="settings-header-actions">
                    {!isMobile && (
                        <button className="dock-btn" onClick={dock.togglePop} title={dock.isPopped ? 'Dock panel' : 'Pop out'}>
                            {dock.isPopped ? '\u2921' : '\u2922'}
                        </button>
                    )}
                    <button className="modal-close-btn" onClick={onClose} aria-label="Close">{'\u2715'}</button>
                </div>
            </div>
            <div className="support-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'talers'} className={`support-tab ${tab === 'talers' ? 'active' : ''}`} onClick={() => setTab('talers')}>Talers</button>
                <button role="tab" aria-selected={tab === 'themes'} className={`support-tab ${tab === 'themes' ? 'active' : ''}`} onClick={() => setTab('themes')}>Themes</button>
                <button role="tab" aria-selected={tab === 'perks'} className={`support-tab ${tab === 'perks' ? 'active' : ''}`} onClick={() => setTab('perks')}>Perks</button>
            </div>
            <div className="support-panel">
                <div className="support-balance">
                    <span className="support-balance-label">Your Talers</span>
                    <span className="support-balance-value gold-text">
                        {balance === null ? '—' : balance.toLocaleString()}
                    </span>
                    {crediting && <span className="support-crediting">Payment received — crediting…</span>}
                </div>

                {error && <p className="guild-error">{error}</p>}

                {tab === 'talers' && (
                    <>
                        <p className="support-pitch">
                            <span className="gold-text">Talers</span> are Talaran's in-game currency, spent
                            on cosmetic upgrades — interface themes and custom palettes. Cosmetic only: never
                            power, never progression. And since Talaran is a one-person project, every purchase
                            also helps keep the servers lit and the world growing.
                        </p>

                        {!paddleConfigured() ? (
                            <p className="muted-text">Purchases aren't available just yet — check back soon.</p>
                        ) : (
                            <div className="support-tiers">
                                {tiers.map(t => (
                                    <button
                                        key={t.usdCents}
                                        className="support-tier-card"
                                        disabled={!t.available}
                                        onClick={() => buy(t)}
                                    >
                                        <span className="support-tier-talers gold-text">{t.talers.toLocaleString()}</span>
                                        <span className="support-tier-unit">Talers</span>
                                        {t.bonusLabel && <span className="support-tier-bonus">{t.bonusLabel} bonus</span>}
                                        <span className="support-tier-price">${(t.usdCents / 100).toFixed(0)}</span>
                                        {!t.available && <span className="muted-text" style={{ fontSize: '11px' }}>coming soon</span>}
                                    </button>
                                ))}
                            </div>
                        )}

                        {history.length > 0 && (
                            <div className="support-history">
                                <p className="support-history-title">History</p>
                                {history.map((h, i) => (
                                    <div key={i} className="support-history-row">
                                        <span className="muted-text">{new Date(h.created_at).toLocaleDateString()}</span>
                                        <span>{REASON_LABELS[h.reason] ?? h.reason}</span>
                                        <span className={h.delta > 0 ? 'gold-text' : 'muted-text'}>
                                            {h.delta > 0 ? '+' : ''}{h.delta.toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <p className="support-legal muted-text">
                            Payments are securely processed by Paddle, our merchant of record — your statement
                            will show Paddle. Talers have no real-world value, are non-transferable, and are
                            non-refundable once spent. See our <a href="/terms">Terms</a>,{' '}
                            <a href="/refunds">Refund Policy</a>, and <a href="/privacy">Privacy Policy</a>.
                        </p>
                    </>
                )}

                {tab === 'themes' && (
                    <>
                        <p className="support-pitch">
                            Themes repaint every panel in the game. Try one on before you buy it; nothing is
                            charged or saved until you unlock it. Pick between the ones you own in Settings.
                        </p>
                        {previewing && (
                            <p className="settings-previewing">
                                Trying on <span className="gold-text">{THEMES.find(t => t.id === previewing)?.name}</span>. Nothing is saved yet.
                                <button className="btn" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px' }} onClick={endPreview}>Take it off</button>
                            </p>
                        )}
                        <div className="settings-theme-grid">
                            {THEMES.filter(t => t.premium).map(t => {
                                const it = item(`theme:${t.id}`)
                                const owned = owns(`theme:${t.id}`)
                                const saleLastDay = t.seasonal ? lastSaleDay(it?.saleEndsAt ?? null) : null
                                // Out of season, a seasonal theme is shown only to those who own it.
                                if (t.seasonal && !owned && !saleLastDay) return null
                                const price = it?.price ?? SINGLE_THEME_PRICE
                                return (
                                    <div key={t.id} className={`settings-theme-card ${owned ? '' : 'locked'}`}>
                                        <span className="settings-theme-swatches">
                                            {t.swatches.map((c, i) => (
                                                <span key={i} className="settings-theme-swatch" style={{ background: c }} />
                                            ))}
                                        </span>
                                        <span className="settings-theme-name">
                                            {t.name}
                                            {!owned && <span className="settings-theme-price gold-text"> · {price} Talers</span>}
                                        </span>
                                        <span className="muted-text" style={{ fontSize: '12px' }}>{t.description}</span>
                                        {saleLastDay && !owned && <span className="settings-theme-season">On sale until {saleLastDay}</span>}
                                        <span className="settings-theme-actions">
                                            {owned ? (
                                                <>
                                                    <span className="settings-theme-active gold-text">Owned</span>
                                                    <button className="btn" onClick={() => wearTheme(t.id)}>Wear it</button>
                                                </>
                                            ) : (
                                                <>
                                                    <button className="btn" onClick={() => tryTheme(t.id)}>Try it</button>
                                                    <button className="btn btn-gold" onClick={() => setConfirmBuy({ key: `theme:${t.id}`, name: t.name, price })}>Unlock</button>
                                                </>
                                            )}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                        {(() => {
                            const bundle = item('bundle:themes')
                            if (!bundle || bundle.owned) return null
                            const missing = bundle.grants.filter(g => !owns(g)).length
                            const saving = missing * SINGLE_THEME_PRICE - bundle.effectivePrice
                            const label = missing === bundle.grants.length
                                ? `All three year-round themes. Saves ${saving} Talers.`
                                : `The ${missing} you are missing. Saves ${saving} Talers.`
                            return (
                                <div className="settings-theme-bundle">
                                    <span>
                                        <span className="settings-theme-name">{bundle.name}</span>
                                        <span className="muted-text" style={{ fontSize: '12px', marginLeft: '8px' }}>{label}</span>
                                    </span>
                                    <button className="btn btn-gold" onClick={() => setConfirmBuy({ key: bundle.key, name: bundle.name, price: bundle.effectivePrice })}>
                                        {bundle.effectivePrice} Talers
                                    </button>
                                </div>
                            )
                        })()}
                    </>
                )}

                {tab === 'perks' && (
                    <>
                        <p className="support-pitch">
                            Perks are yours for good once unlocked, on every device you play from.
                        </p>
                        {store?.items.filter(i => i.key.startsWith('perk:')).map(p => (
                            <div key={p.key} className={`settings-theme-card support-perk-card ${p.owned ? '' : 'locked'}`}>
                                <span className="settings-theme-name">
                                    {p.name}
                                    {!p.owned && <span className="settings-theme-price gold-text"> · {p.effectivePrice.toLocaleString()} Talers</span>}
                                </span>
                                <span className="muted-text" style={{ fontSize: '13px' }}>{p.description}</span>
                                <span className="settings-theme-actions">
                                    {p.owned ? (
                                        <>
                                            <span className="settings-theme-active gold-text">Owned</span>
                                            {PERK_SETTINGS[p.key] && (
                                                <button className="btn" onClick={() => { onClose(); openSettings(PERK_SETTINGS[p.key]) }}>Open in Settings</button>
                                            )}
                                        </>
                                    ) : (
                                        <button className="btn btn-gold" onClick={() => setConfirmBuy({ key: p.key, name: p.name, price: p.effectivePrice })}>Unlock</button>
                                    )}
                                </span>
                            </div>
                        ))}
                        {!store && <p className="muted-text">Opening the ledger…</p>}
                    </>
                )}
            </div>
            {confirmBuy && (
                <ConfirmModal
                    message={`Unlock ${confirmBuy.name} for ${confirmBuy.price.toLocaleString()} Talers?`}
                    confirmLabel="Unlock"
                    onConfirm={() => { const key = confirmBuy.key; setConfirmBuy(null); purchase(key) }}
                    onCancel={() => setConfirmBuy(null)}
                />
            )}
        </DockableWindow>
    )
}
