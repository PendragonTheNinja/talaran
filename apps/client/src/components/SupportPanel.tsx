import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { openTalerCheckout, paddleConfigured } from '../lib/paddle'
import DockableWindow from './DockableWindow'
import { useDockableWindow } from '../lib/useDockableWindow'
import { useIsMobile } from '../lib/useIsMobile'
import './SupportPanel.css'

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
}

const REASON_LABELS: Record<string, string> = {
    purchase: 'Taler purchase',
    unlock: 'Unlock',
    admin_grant: 'Grant',
}

export default function SupportPanel({ playerId, onClose, closing }: SupportPanelProps) {
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
                <h3 className="gold-text">Support Talaran</h3>
                <div className="settings-header-actions">
                    {!isMobile && (
                        <button className="dock-btn" onClick={dock.togglePop} title={dock.isPopped ? 'Dock panel' : 'Pop out'}>
                            {dock.isPopped ? '\u2921' : '\u2922'}
                        </button>
                    )}
                    <button className="modal-close-btn" onClick={onClose}>\u2715</button>
                </div>
            </div>
            <div className="support-panel">
                <p className="support-pitch">
                    Talaran is built by one person, for the love of it. Supporting the game buys
                    <span className="gold-text"> Talers</span> — a currency spent purely on looks and flair:
                    themes, palettes, and badges. Never power, never progression. Every Taler keeps the
                    servers lit and the world growing.
                </p>

                <div className="support-balance">
                    <span className="support-balance-label">Your Talers</span>
                    <span className="support-balance-value gold-text">
                        {balance === null ? '—' : balance.toLocaleString()}
                    </span>
                    {crediting && <span className="support-crediting">Payment received — crediting…</span>}
                </div>

                {error && <p className="guild-error">{error}</p>}

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
            </div>
        </DockableWindow>
    )
}
