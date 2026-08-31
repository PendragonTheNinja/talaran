import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './MarketplaceMenu.css'

// Taiar Marketplace. Same modal shape and tokens as FishingMenu.
//
// The whole panel exists to make two prices legible: what a merchant charges,
// and what a merchant pays. The second one changes as you sell, so the sell
// confirm is the most important screen here, not the shelf.

interface Merchant {
    id: number
    key: string
    name: string
    title: string | null
    greeting: string | null
    buyRate: number
    buysAnything: boolean
    sells: boolean
}

interface StockLine {
    itemId: number
    name: string
    value: number
    price: number
    dailyLimit: number
    bought: number
    remaining: number
    isCore: boolean
}

interface Sellable {
    itemId: number
    name: string
    held: number
    value: number
    rate: number
    unitAtFullRate: number
    allowance: number
    soldToday: number
    remainingAtFullRate: number
    stackTotal: number
    stackSteppedDown: boolean
}

interface Band {
    quantity: number
    rate: number
    gold: number
}

interface Quote {
    itemId: number
    name: string
    quantity: number
    total: number
    bands: Band[]
    steppedDown: boolean
    unitAtFullRate: number
    allowance: number
    soldToday: number
}

interface MarketplaceMenuProps {
    onClose: () => void
    onGoldChanged?: (gold: number) => void
}

const fmt = (n: number) => n.toLocaleString('en-US')

type SortKey = 'name' | 'unit' | 'total' | 'held'
type SortDir = 'asc' | 'desc'

/**
 * Sort a list by one of three keys. Name is the default because it is the only
 * ordering a player can predict; the value sorts are for deciding what to dump.
 * Ties fall back to name so the order never jitters between renders.
 */
/**
 * `total` is what the stack is WORTH, and `held` is how many you have. They are
 * easy to confuse and sort very differently: six rabbits' feet outrank three
 * hundred strawberries by value while being nowhere near them by count. A
 * player looking for what is filling their pack wants the count, so both are
 * offered rather than one standing in for the other.
 */
function sortRows<T>(
    rows: T[],
    key: SortKey,
    dir: SortDir,
    pick: (row: T) => { name: string; unit: number; total: number; held?: number },
): T[] {
    const sign = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
        const A = pick(a), B = pick(b)
        if (key === 'name') return sign * A.name.localeCompare(B.name)
        const diff = key === 'unit' ? A.unit - B.unit
            : key === 'held' ? (A.held ?? 0) - (B.held ?? 0)
            : A.total - B.total
        return diff !== 0 ? sign * diff : A.name.localeCompare(B.name)
    })
}

function SortBar({ options, sortKey, sortDir, onChange }: {
    options: Array<{ key: SortKey; label: string }>
    sortKey: SortKey
    sortDir: SortDir
    onChange: (key: SortKey, dir: SortDir) => void
}) {
    return (
        <div className="mkt-sort">
            <span className="mkt-sort-label">Sort</span>
            {options.map(o => (
                <button
                    key={o.key}
                    className={`mkt-sort-btn${sortKey === o.key ? ' is-active' : ''}`}
                    /* Clicking the active key flips direction, which is the
                       behaviour every table in the world has trained people to
                       expect. Switching keys starts ascending. */
                    onClick={() => onChange(o.key, sortKey === o.key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc')}
                >
                    {o.label}
                    {sortKey === o.key && <span className="mkt-sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </button>
            ))}
        </div>
    )
}

/**
 * Icon paths come from the item NAME, the same as everywhere else in the app.
 * items.icon exists as a column but has never been populated, so reading it
 * gets you nothing.
 *
 * Not every item has art yet, so a failed load collapses to the blank slot
 * rather than leaving a broken-image glyph in the row.
 */
function ItemIcon({ name }: { name: string }) {
    const [failed, setFailed] = useState(false)
    if (failed) return <span className="mkt-icon mkt-icon-blank" aria-hidden="true" />
    return (
        <img
            className="mkt-icon"
            src={getItemIcon(name)}
            alt=""
            title={name}
            onError={() => setFailed(true)}
        />
    )
}

/**
 * The quantity control. A plain number input is miserable on mobile for the
 * "sell all 340 of these" case, so All sits next to it as its own button.
 */
function QtyPicker({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
    return (
        <div className="mkt-qty">
            <button className="mkt-qty-step" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>−</button>
            <input
                type="number"
                min={1}
                max={max}
                value={value}
                onChange={e => {
                    const n = Math.floor(Number(e.target.value))
                    onChange(Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : 1)
                }}
            />
            <button className="mkt-qty-step" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
            <button className="mkt-qty-all" onClick={() => onChange(max)} disabled={value >= max}>All</button>
        </div>
    )
}

export default function MarketplaceMenu({ onClose, onGoldChanged }: MarketplaceMenuProps) {
    const [merchants, setMerchants] = useState<Merchant[]>([])
    const [activeId, setActiveId] = useState<number | null>(null)
    const [tab, setTab] = useState<'buy' | 'sell'>('buy')
    const [gold, setGold] = useState(0)

    const [stock, setStock] = useState<StockLine[]>([])
    const [sellable, setSellable] = useState<Sellable[]>([])

    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    // Confirm state. sellQuote is the server's number, and the sell request is
    // then held to it.
    const [sellItem, setSellItem] = useState<Sellable | null>(null)
    const [sellQty, setSellQty] = useState(1)
    const [sellQuote, setSellQuote] = useState<Quote | null>(null)
    const [buying, setBuying] = useState<{ line: StockLine; qty: number } | null>(null)

    const [sortKey, setSortKey] = useState<SortKey>('name')
    const [sortDir, setSortDir] = useState<SortDir>('asc')

    const active = merchants.find(m => m.id === activeId) ?? null

    // Held in a ref, not a dependency. The parent passes this as an inline
    // arrow, so it gets a fresh identity on every render of theirs. Depending
    // on it directly makes the load effect refire, which refreshes the parent,
    // which re-renders, which makes a new arrow: a fetch loop that runs until
    // the rate limiter stops it and starves every other endpoint of its budget.
    const goldChangedRef = useRef(onGoldChanged)
    useEffect(() => { goldChangedRef.current = onGoldChanged })

    /**
     * Tell the rest of the app the purse moved. Only called after a completed
     * buy or sell: a plain read of the balance is not news, and announcing it
     * would refresh the parent for nothing.
     */
    const announceGold = useCallback((g: number) => {
        setGold(g)
        goldChangedRef.current?.(g)
    }, [])

    // Runs once on open.
    useEffect(() => {
        let cancelled = false
        // "Go and look at the market and come straight back." Ignored by the
        // server unless an active quest is asking for it.
        apiFetch('/api/quests/visit', {
            method: 'POST',
            body: JSON.stringify({ target: 'Taiar Marketplace' }),
        }).catch(() => { })
        apiFetch<{ gold: number; merchants: Merchant[] }>('/api/marketplace')
            .then(data => {
                if (cancelled) return
                setMerchants(data.merchants)
                setGold(data.gold)
                const first = data.merchants[0]
                if (first) {
                    setActiveId(first.id)
                    setTab(first.sells ? 'buy' : 'sell')
                }
                setLoading(false)
            })
            .catch(err => { if (!cancelled) { setError(err.message); setLoading(false) } })
        return () => { cancelled = true }
    }, [])

    const loadMerchant = useCallback(async (merchantId: number, which: 'buy' | 'sell') => {
        setError(null)
        try {
            if (which === 'buy') {
                const data = await apiFetch<{ gold: number; stock: StockLine[] }>(`/api/marketplace/${merchantId}/stock`)
                setStock(data.stock)
                setGold(data.gold)
            } else {
                const data = await apiFetch<{ gold: number; sellable: Sellable[] }>(`/api/marketplace/${merchantId}/sellable`)
                setSellable(data.sellable)
                setGold(data.gold)
            }
        } catch (err: any) {
            setError(err.message)
        }
    }, [])

    useEffect(() => {
        if (activeId !== null) loadMerchant(activeId, tab)
    }, [activeId, tab, loadMerchant])

    // ── Selling ──────────────────────────────────────────────────────────────

    const openSell = (item: Sellable) => {
        setSellItem(item)
        setSellQty(item.held)
        setSellQuote(null)
        setError(null)
    }

    const closeSell = () => {
        setSellItem(null)
        setSellQuote(null)
    }

    /**
     * Re-price whenever the item or quantity changes, but not on every
     * keystroke. Holding down the + button would otherwise fire a request per
     * click and rate-limit the player out of their own sale.
     */
    useEffect(() => {
        if (!sellItem || !active) return
        let cancelled = false
        const timer = setTimeout(() => {
            apiFetch<Quote>('/api/marketplace/quote', {
                method: 'POST',
                body: JSON.stringify({ merchantId: active.id, itemId: sellItem.itemId, quantity: sellQty }),
            })
                .then(q => { if (!cancelled) setSellQuote(q) })
                .catch(err => { if (!cancelled) setError(err.message) })
        }, 250)
        return () => { cancelled = true; clearTimeout(timer) }
    }, [sellItem, sellQty, active])

    const confirmSell = async () => {
        if (!active || !sellItem || !sellQuote) return
        setBusy(true)
        setError(null)
        try {
            const result = await apiFetch<{ sold: number; name: string; total: number; gold: number }>(
                '/api/marketplace/sell',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        merchantId: active.id,
                        itemId: sellItem.itemId,
                        quantity: sellQty,
                        // The server refuses if the true total came out below
                        // this, and hands back a fresh quote instead.
                        expectedTotal: sellQuote.total,
                    }),
                },
            )
            announceGold(result.gold)
            setNotice(`Sold ${fmt(result.sold)} ${result.name} for ${fmt(result.total)}g.`)
            closeSell()
            await loadMerchant(active.id, 'sell')
        } catch (err: any) {
            // A refusal carries the new quote so the player sees the real number
            // rather than being told only that something went wrong.
            const requote: Quote | null = err.body?.requote ?? null
            if (requote) {
                setSellQuote(requote)
                setError('The price changed while you were deciding. This is the new total.')
            } else {
                setError(err.message)
            }
        } finally {
            setBusy(false)
        }
    }

    // ── Buying ───────────────────────────────────────────────────────────────

    const confirmBuy = async () => {
        if (!active || !buying) return
        setBusy(true)
        setError(null)
        try {
            const result = await apiFetch<{ bought: number; name: string; cost: number; gold: number }>(
                '/api/marketplace/buy',
                {
                    method: 'POST',
                    body: JSON.stringify({ merchantId: active.id, itemId: buying.line.itemId, quantity: buying.qty }),
                },
            )
            announceGold(result.gold)
            setNotice(`Bought ${fmt(result.bought)} ${result.name} for ${fmt(result.cost)}g.`)
            setBuying(null)
            await loadMerchant(active.id, 'buy')
        } catch (err: any) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="mkt-overlay" onClick={onClose}>
            <div className="mkt-modal" onClick={e => e.stopPropagation()}>
                <div className="mkt-header">
                    <h2>Taiar Marketplace</h2>
                    <div className="mkt-header-right">
                        <span className="mkt-purse">{fmt(gold)}<span className="mkt-purse-unit">g</span></span>
                        <button className="mkt-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                {loading && <p className="mkt-empty">Crossing the square…</p>}
                {!loading && merchants.length === 0 && (
                    <p className="mkt-empty">Nobody is trading here.</p>
                )}

                {!loading && merchants.length > 0 && (
                    <>
                        <div className="mkt-merchants">
                            {merchants.map(m => (
                                <button
                                    key={m.id}
                                    className={`mkt-merchant${m.id === activeId ? ' is-active' : ''}`}
                                    onClick={() => {
                                        setActiveId(m.id)
                                        setTab(m.sells ? 'buy' : 'sell')
                                        closeSell(); setBuying(null); setNotice(null); setError(null)
                                    }}
                                >
                                    <span className="mkt-merchant-name">{m.name}</span>
                                    {m.title && <span className="mkt-merchant-title">{m.title}</span>}
                                </button>
                            ))}
                        </div>

                        {active?.greeting && <p className="mkt-greeting">{active.greeting}</p>}

                        <div className="mkt-tabs">
                            {active?.sells && (
                                <button className={`mkt-tab${tab === 'buy' ? ' is-active' : ''}`} onClick={() => { setTab('buy'); closeSell() }}>
                                    Buy
                                </button>
                            )}
                            <button className={`mkt-tab${tab === 'sell' ? ' is-active' : ''}`} onClick={() => { setTab('sell'); setBuying(null) }}>
                                Sell
                            </button>
                        </div>

                        {error && <p className="mkt-error">{error}</p>}
                        {notice && <p className="mkt-notice">{notice}</p>}

                        {/* ── Buy ─────────────────────────────────────────── */}
                        {tab === 'buy' && !buying && (
                            stock.length === 0
                                ? <p className="mkt-empty">The stall is bare today.</p>
                                : (
                                    <>
                                    <SortBar
                                        options={[{ key: 'name', label: 'Name' }, { key: 'unit', label: 'Price' }]}
                                        sortKey={sortKey}
                                        sortDir={sortDir}
                                        onChange={(k, d) => { setSortKey(k); setSortDir(d) }}
                                    />
                                    <ul className="mkt-list">
                                        {sortRows(stock, sortKey, sortDir, l => ({ name: l.name, unit: l.price, total: l.price })).map(line => (
                                            <li key={line.itemId} className="mkt-row">
                                                <ItemIcon name={line.name} />
                                                <div className="mkt-row-main">
                                                    <span className="mkt-row-name">{line.name}</span>
                                                    <span className="mkt-row-sub">
                                                        {line.remaining > 0
                                                            ? `${fmt(line.remaining)} available to you today`
                                                            : 'None left for you today'}
                                                        {line.isCore && <span className="mkt-tag">always stocked</span>}
                                                    </span>
                                                </div>
                                                <span className="mkt-row-price">{fmt(line.price)}g</span>
                                                <button
                                                    className="mkt-act"
                                                    disabled={line.remaining === 0 || gold < line.price}
                                                    onClick={() => setBuying({ line, qty: 1 })}
                                                >
                                                    Buy
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    </>
                                )
                        )}

                        {tab === 'buy' && buying && (
                            <div className="mkt-confirm">
                                <h3>Buy {buying.line.name}</h3>
                                <QtyPicker
                                    value={buying.qty}
                                    max={Math.max(1, Math.min(buying.line.remaining, Math.floor(gold / buying.line.price)))}
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

                        {/* ── Sell ────────────────────────────────────────── */}
                        {tab === 'sell' && !sellItem && (
                            sellable.length === 0
                                ? <p className="mkt-empty">You have nothing {active?.name} wants.</p>
                                : (
                                    <>
                                    <SortBar
                                        options={[
                                            { key: 'name', label: 'Name' },
                                            { key: 'unit', label: 'Each' },
                                            { key: 'total', label: 'Stack value' },
                                            { key: 'held', label: 'Amount' },
                                        ]}
                                        sortKey={sortKey}
                                        sortDir={sortDir}
                                        onChange={(k, d) => { setSortKey(k); setSortDir(d) }}
                                    />
                                    <ul className="mkt-list">
                                        {sortRows(sellable, sortKey, sortDir, i => ({ name: i.name, unit: i.unitAtFullRate, total: i.stackTotal, held: i.held })).map(item => (
                                            <li key={item.itemId} className="mkt-row">
                                                <ItemIcon name={item.name} />
                                                <div className="mkt-row-main">
                                                    <span className="mkt-row-name">{item.name}</span>
                                                    <span className="mkt-row-sub">
                                                        {fmt(item.held)} held
                                                        {item.remainingAtFullRate > 0
                                                            ? <> · {fmt(item.remainingAtFullRate)} left at full price</>
                                                            : <span className="mkt-warn-inline"> · reduced price today</span>}
                                                    </span>
                                                </div>
                                                <span className="mkt-row-price">{fmt(item.unitAtFullRate)}g ea</span>
                                                <button className="mkt-act" disabled={busy} onClick={() => openSell(item)}>
                                                    Sell
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    </>
                                )
                        )}

                        {tab === 'sell' && sellItem && (
                            <div className="mkt-confirm">
                                <h3>Sell {sellItem.name}</h3>

                                <QtyPicker
                                    value={sellQty}
                                    max={sellItem.held}
                                    onChange={setSellQty}
                                />

                                {!sellQuote && <p className="mkt-empty">Working out a price…</p>}

                                {sellQuote && (
                                    <>
                                        {/* The band breakdown is the whole point of
                                            this screen: it shows WHY a total is lower
                                            than the headline price, before anything
                                            is sold. */}
                                        <ul className="mkt-bands">
                                            {sellQuote.bands.map((band, i) => (
                                                <li key={i} className={`mkt-band${band.rate < 1 ? ' is-reduced' : ''}`}>
                                                    <span className="mkt-band-qty">{fmt(band.quantity)}</span>
                                                    <span className="mkt-band-rate">
                                                        {band.rate < 1
                                                            ? `at ${Math.round(band.rate * 100)}% price`
                                                            : 'at full price'}
                                                    </span>
                                                    <span className="mkt-band-gold">{fmt(band.gold)}g</span>
                                                </li>
                                            ))}
                                        </ul>

                                        <div className="mkt-total-row">
                                            <span>Total</span>
                                            <span className="mkt-total">{fmt(sellQuote.total)}g</span>
                                        </div>

                                        {/* Two different reasons a price drops, and
                                            they need different sentences. Blaming
                                            earlier sales when there were none reads
                                            as the game talking nonsense. */}
                                        {sellQuote.steppedDown && (
                                            <p className="mkt-warn">
                                                {sellQuote.soldToday > 0
                                                    ? <>You have already sold {fmt(sellQuote.soldToday)} {sellItem.name} today, so {active?.name} is paying less for part of this. Full price returns at midnight.</>
                                                    : <>{active?.name} pays full price for the first {fmt(sellQuote.allowance)} {sellItem.name} each day. This sale goes past that, so the rest fetches less. Full price returns at midnight.</>}
                                            </p>
                                        )}
                                    </>
                                )}

                                <div className="mkt-confirm-actions">
                                    <button className="mkt-cancel" onClick={closeSell} disabled={busy}>Back</button>
                                    <button className="mkt-act" onClick={confirmSell} disabled={busy || !sellQuote}>
                                        {sellQuote ? `Sell for ${fmt(sellQuote.total)}g` : 'Sell'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
