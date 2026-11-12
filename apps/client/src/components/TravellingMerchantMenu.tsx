import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { onWorldEventsChanged, timeLeft } from '../lib/worldEvents'
import { useItemTooltip } from './ItemTooltip'
import { ItemIcon, QtyPicker } from './MarketplaceMenu'
import './MarketplaceMenu.css'
import { backdropClose } from '../lib/backdrop'

// The travelling merchant's cart (docs/WORLD-EVENTS-AND-MUSEUMS.md, step 3).
// The marketplace's modal, rows and controls, with one difference that matters:
// his stock is shared by the whole server, so what is left is what is left for
// everyone, and it can go while you look.

interface Line { itemId: number; name: string; value: number; price: number; left: number; total: number }
/** Something he is buying: yourRoom is how many more he will take from you. */
interface Want { itemId: number; name: string; price: number; left: number; total: number; yourRoom: number; have: number }
interface Visit { eventId: number; location: string; endsAt: string; stock: Line[]; wants?: Want[]; gold: number }

const fmt = (n: number) => n.toLocaleString('en-US')

export default function TravellingMerchantMenu({ onClose, onGoldChanged }: {
    onClose: () => void
    onGoldChanged?: (gold: number) => void
}) {
    const { hoverProps, tooltipEl } = useItemTooltip()
    const [visit, setVisit] = useState<Visit | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [buying, setBuying] = useState<{ line: Line; qty: number } | null>(null)
    const [selling, setSelling] = useState<{ want: Want; qty: number } | null>(null)
    const [tab, setTab] = useState<'buy' | 'sell'>('buy')
    const [busy, setBusy] = useState(false)
    const [now, setNow] = useState(() => Date.now())

    const load = useCallback(() => {
        return apiFetch<{ visit: Visit | null }>('/api/events/merchant')
            .then(d => setVisit(d.visit))
            .catch(() => setError('Could not reach his cart.'))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        load()
        // Others are buying from the same cart; keep the counts honest.
        const refresh = setInterval(load, 15_000)
        const clock = setInterval(() => setNow(Date.now()), 30_000)
        const unsubscribe = onWorldEventsChanged(load)
        return () => { clearInterval(refresh); clearInterval(clock); unsubscribe() }
    }, [load])

    const confirmBuy = async () => {
        if (!visit || !buying) return
        setBusy(true)
        setError(null)
        try {
            const result = await apiFetch<{ bought: number; name: string; cost: number; gold: number }>(
                '/api/events/merchant/buy',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        eventId: visit.eventId, itemId: buying.line.itemId,
                        quantity: buying.qty, price: buying.line.price,
                    }),
                },
            )
            onGoldChanged?.(result.gold)
            setNotice(`Bought ${fmt(result.bought)} ${result.name} for ${fmt(result.cost)}g.`)
            setBuying(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'That did not work.')
        } finally {
            setBusy(false)
            load()
        }
    }

    const confirmSell = async () => {
        if (!visit || !selling) return
        setBusy(true)
        setError(null)
        try {
            const result = await apiFetch<{ sold: number; name: string; earned: number; gold: number }>(
                '/api/events/merchant/sell',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        eventId: visit.eventId, itemId: selling.want.itemId,
                        quantity: selling.qty, price: selling.want.price,
                    }),
                },
            )
            onGoldChanged?.(result.gold)
            setNotice(`Sold ${fmt(result.sold)} ${result.name} for ${fmt(result.earned)}g.`)
            setSelling(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'That did not work.')
        } finally {
            setBusy(false)
            load()
        }
    }

    const gold = visit?.gold ?? 0
    const wants = visit?.wants ?? []

    return (
        <div className="mkt-overlay" {...backdropClose(onClose)}>
            <div className="mkt-modal" onClick={e => e.stopPropagation()}>
                <div className="mkt-header">
                    <h2>The Travelling Merchant</h2>
                    <div className="mkt-header-right">
                        <span className="mkt-purse">{fmt(gold)}<span className="mkt-purse-unit">g</span></span>
                        <button className="mkt-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                {loading && <p className="mkt-empty">Looking for his cart…</p>}
                {!loading && !visit && <p className="mkt-empty">His cart is gone. He has moved on.</p>}

                {visit && (
                    <>
                        <p className="mkt-greeting">
                            Goods from all over the island, and nothing more once they are gone.
                            He leaves {visit.location} in {timeLeft(visit.endsAt, now)}.
                        </p>
                        {!buying && !selling && (
                            <div className="mkt-tabs">
                                <button className={`mkt-tab${tab === 'buy' ? ' is-active' : ''}`} onClick={() => setTab('buy')}>His wares</button>
                                <button className={`mkt-tab${tab === 'sell' ? ' is-active' : ''}`} onClick={() => setTab('sell')}>
                                    Buying{wants.length ? ` (${wants.length})` : ''}
                                </button>
                            </div>
                        )}
                        {error && <p className="mkt-error">{error}</p>}
                        {notice && <p className="mkt-notice">{notice}</p>}

                        {tab === 'sell' && !selling && (
                            wants.length === 0
                                ? <p className="mkt-empty">He is buying nothing this time.</p>
                                : (
                                    <ul className="mkt-list">
                                        {wants.map(w => {
                                            const most = Math.min(w.left, w.yourRoom, w.have)
                                            return (
                                                <li key={w.itemId} className="mkt-row">
                                                    <ItemIcon name={w.name} hover={hoverProps({ name: w.name }, 'Left-click to sell')} />
                                                    <div className="mkt-row-main">
                                                        <span className="mkt-row-name">{w.name}</span>
                                                        <span className="mkt-row-sub">
                                                            {w.left === 0
                                                                ? 'He has all he wants'
                                                                : w.yourRoom === 0
                                                                    ? 'He will take no more from you'
                                                                    : `Wants ${fmt(w.left)} more, up to ${fmt(w.yourRoom)} from you. You have ${fmt(w.have)}.`}
                                                        </span>
                                                    </div>
                                                    <span className="mkt-row-price">{fmt(w.price)}g</span>
                                                    <button
                                                        className="mkt-act"
                                                        disabled={most <= 0}
                                                        onClick={() => { setNotice(null); setSelling({ want: w, qty: most }) }}
                                                    >
                                                        Sell
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )
                        )}

                        {selling && (
                            <div className="mkt-confirm">
                                <h3>Sell {selling.want.name}</h3>
                                <QtyPicker
                                    value={selling.qty}
                                    max={Math.max(1, Math.min(selling.want.left, selling.want.yourRoom, selling.want.have))}
                                    onChange={n => setSelling({ ...selling, qty: n })}
                                />
                                <div className="mkt-total-row">
                                    <span>He pays</span>
                                    <span className="mkt-total">{fmt(selling.want.price * selling.qty)}g</span>
                                </div>
                                <div className="mkt-confirm-actions">
                                    <button className="mkt-cancel" onClick={() => setSelling(null)} disabled={busy}>Back</button>
                                    <button className="mkt-act" onClick={confirmSell} disabled={busy}>Sell</button>
                                </div>
                            </div>
                        )}

                        {tab === 'buy' && !buying && (
                            <ul className="mkt-list">
                                {visit.stock.map(line => (
                                    <li key={line.itemId} className="mkt-row">
                                        <ItemIcon name={line.name} hover={hoverProps({ name: line.name }, 'Left-click to buy')} />
                                        <div className="mkt-row-main">
                                            <span className="mkt-row-name">{line.name}</span>
                                            <span className="mkt-row-sub">
                                                {line.left > 0 ? `${fmt(line.left)} of ${fmt(line.total)} left` : 'Sold out'}
                                            </span>
                                        </div>
                                        <span className="mkt-row-price">{fmt(line.price)}g</span>
                                        <button
                                            className="mkt-act"
                                            disabled={line.left === 0 || gold < line.price}
                                            onClick={() => { setNotice(null); setBuying({ line, qty: 1 }) }}
                                        >
                                            Buy
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {buying && (
                            <div className="mkt-confirm">
                                <h3>Buy {buying.line.name}</h3>
                                <QtyPicker
                                    value={buying.qty}
                                    max={Math.max(1, Math.min(buying.line.left, Math.floor(gold / buying.line.price)))}
                                    onChange={n => setBuying({ ...buying, qty: n })}
                                />
                                <div className="mkt-total-row">
                                    <span>Total</span>
                                    <span className="mkt-total">{fmt(buying.line.price * buying.qty)}g</span>
                                </div>
                                <div className="mkt-confirm-actions">
                                    <button className="mkt-cancel" onClick={() => setBuying(null)} disabled={busy}>Back</button>
                                    <button className="mkt-act" onClick={confirmBuy} disabled={busy}>Buy</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
            {tooltipEl}
        </div>
    )
}
