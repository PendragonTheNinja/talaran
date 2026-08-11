import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './ShopsMenu.css'

// Player Shops (docs/marketplace-spec.md §4).
//
// Two views: the row of shopfronts standing here, and the inside of one. There
// is deliberately NO cross-shop index; finding a good price is a player
// activity, so the filter and sort live inside a shopfront.

interface ShopSummary {
    id: number
    name: string
    /** One line, list only. The description is the sign inside the shop. */
    tagline: string | null
    isOpen: boolean
    ownerId: number
    owner: string
    isEmpty: boolean
}

interface Listing {
    id: number
    itemId: number
    name: string
    quantity: number
    unitPrice: number
}

interface BuyOrder {
    id: number
    itemId: number
    name: string
    wanted: number
    unitPrice: number
    youHold: number
}

interface ShopFront {
    id: number
    name: string
    tagline: string | null
    description: string | null
    isOpen: boolean
    owner: string
    ownerId: number
    isMine: boolean
    listings: Listing[]
    buyOrders: BuyOrder[]
}

interface BuildInfo {
    town: string
    hasShop: boolean
    atTown: boolean
    carpentryLevel: number
    carpentryRequired: number
    seconds: number
    cost: Array<{ itemName: string; need: number; have: number }>
    canAfford: boolean
    missingTool: string | null
    tier1: { storageSlots: number; sellSlots: number; buySlots: number }
}

interface ShopsMenuProps {
    onClose: () => void
    onChanged?: () => void
    onManage?: () => void
    /**
     * Hands the started build off to the game view timer. Without this the
     * action row exists on the server and the player sees nothing happen, then
     * gets told they are already busy when they try again.
     */
    onActionStarted?: (timerSeconds: number) => void
}

const fmt = (n: number) => n.toLocaleString('en-US')

type SortKey = 'name' | 'price' | 'stock'
type SortDir = 'asc' | 'desc'

function ItemIcon({ name }: { name: string }) {
    const [failed, setFailed] = useState(false)
    if (failed) return <span className="shp-icon shp-icon-blank" aria-hidden="true" />
    return <img className="shp-icon" src={getItemIcon(name)} alt="" title={name} onError={() => setFailed(true)} />
}

export default function ShopsMenu({ onClose, onChanged, onManage, onActionStarted }: ShopsMenuProps) {
    const [shops, setShops] = useState<ShopSummary[]>([])
    const [build, setBuild] = useState<BuildInfo | null>(null)
    const [hasShop, setHasShop] = useState(false)
    const [gold, setGold] = useState(0)

    const [openShop, setOpenShop] = useState<ShopFront | null>(null)
    const [filter, setFilter] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('name')
    const [sortDir, setSortDir] = useState<SortDir>('asc')

    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    const [pendingBuy, setPendingBuy] = useState<{ listing: Listing; qty: number } | null>(null)
    const [pendingSell, setPendingSell] = useState<{ order: BuyOrder; qty: number } | null>(null)

    // Ref, not a dependency: the parent passes an inline arrow, and depending on
    // it directly turns the load effect into a fetch loop.
    const changedRef = useRef(onChanged)
    useEffect(() => { changedRef.current = onChanged })

    const loadList = useCallback(async () => {
        const data = await apiFetch<{ gold: number; shops: ShopSummary[]; mine: any; build: BuildInfo }>('/api/shops')
        setShops(data.shops)
        setBuild(data.build)
        setHasShop(!!data.mine)
        setGold(data.gold)
    }, [])

    useEffect(() => {
        let cancelled = false
        loadList()
            .catch(err => { if (!cancelled) setError(err.message) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [loadList])

    const enterShop = async (shopId: number) => {
        setError(null); setNotice(null); setFilter('')
        try {
            const data = await apiFetch<{ gold: number; shop: ShopFront }>(`/api/shops/${shopId}`)
            setOpenShop(data.shop)
            setGold(data.gold)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const refreshShop = async () => {
        if (openShop) await enterShop(openShop.id)
        await loadList().catch(() => {})
        changedRef.current?.()
    }

    const confirmBuy = async () => {
        if (!pendingBuy) return
        setBusy(true); setError(null)
        try {
            const result = await apiFetch<{ message: string; gold: number }>('/api/shops/buy', {
                method: 'POST',
                body: JSON.stringify({ listingId: pendingBuy.listing.id, quantity: pendingBuy.qty }),
            })
            setGold(result.gold)
            setNotice(result.message)
            setPendingBuy(null)
            await refreshShop()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    const confirmSell = async () => {
        if (!pendingSell) return
        setBusy(true); setError(null)
        try {
            const result = await apiFetch<{ message: string; gold: number }>('/api/shops/sell', {
                method: 'POST',
                body: JSON.stringify({ orderId: pendingSell.order.id, quantity: pendingSell.qty }),
            })
            setGold(result.gold)
            setNotice(result.message)
            setPendingSell(null)
            await refreshShop()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    const startBuild = async () => {
        setBusy(true); setError(null)
        try {
            const result = await apiFetch<{ message: string; timerSeconds: number }>(
                '/api/shops/build', { method: 'POST' },
            )
            changedRef.current?.()
            onActionStarted?.(result.timerSeconds)
            onClose()
        } catch (err: any) {
            // 423 means a bot check is due. The server has already emitted
            // bot_check_required and the overlay is about to appear, so a red
            // error underneath it just reads as a second, unrelated failure.
            if (err?.status !== 423) setError(err.message || 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    const applyView = <T extends { name: string; unitPrice: number }>(rows: T[], stockOf: (r: T) => number): T[] => {
        const needle = filter.trim().toLowerCase()
        const shown = needle ? rows.filter(r => r.name.toLowerCase().includes(needle)) : rows
        const sign = sortDir === 'asc' ? 1 : -1
        return [...shown].sort((a, b) => {
            if (sortKey === 'name') return sign * a.name.localeCompare(b.name)
            const diff = sortKey === 'price' ? a.unitPrice - b.unitPrice : stockOf(a) - stockOf(b)
            return diff !== 0 ? sign * diff : a.name.localeCompare(b.name)
        })
    }

    const sortBtn = (key: SortKey, label: string) => (
        <button
            className={`shp-sort-btn${sortKey === key ? ' is-active' : ''}`}
            onClick={() => {
                if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                else { setSortKey(key); setSortDir('asc') }
            }}
        >
            {label}{sortKey === key && <span className="shp-sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
        </button>
    )

    return (
        <div className="shp-overlay" onClick={onClose}>
            <div className="shp-modal" onClick={e => e.stopPropagation()}>
                <div className="shp-header">
                    <h2>{openShop ? openShop.name : 'Player Shops'}</h2>
                    <div className="shp-header-right">
                        <span className="shp-purse">{fmt(gold)}<span className="shp-purse-unit">g</span></span>
                        <button className="shp-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                {error && <p className="shp-error">{error}</p>}
                {notice && <p className="shp-notice">{notice}</p>}

                {loading && <p className="shp-empty">Walking the row…</p>}

                {/* ── The row of shopfronts ──────────────────────────────── */}
                {!loading && !openShop && (
                    <>
                        {shops.length === 0
                            ? <p className="shp-empty">Nobody keeps a shop here yet.</p>
                            : (
                                <ul className="shp-list">
                                    {/* One row per shop. A market town is meant to
                                        hold a hundred of these, so nothing here
                                        gets a line of its own. */}
                                    {shops.map(s => (
                                        <li
                                            key={s.id}
                                            className={`shp-front${s.isOpen ? '' : ' is-shut'}`}
                                            onClick={() => s.isOpen && enterShop(s.id)}
                                        >
                                            <span className="shp-front-name">{s.name}</span>
                                            <span className="shp-front-owner">{s.owner}</span>
                                            {s.tagline && <span className="shp-front-tag">{s.tagline}</span>}
                                            <span className="shp-front-state">
                                                {!s.isOpen ? 'closed' : s.isEmpty ? 'empty' : ''}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                        {hasShop && (
                            <div className="shp-mine-row">
                                <button className="shp-act" onClick={() => { onManage?.(); onClose() }}>
                                    Manage my shop
                                </button>
                            </div>
                        )}

                        {/* ── Raising one ────────────────────────────────── */}
                        {!hasShop && build && (
                            <div className="shp-build">
                                <h3>Raise a shopfront</h3>
                                <p className="shp-build-blurb">
                                    A shop of your own in {build.town}: {build.tier1.storageSlots} storage slots,
                                    {' '}{build.tier1.sellSlots} things you can sell at once, and
                                    {' '}{build.tier1.buySlots} standing offers to buy. It trades while you are away.
                                </p>
                                <ul className="shp-cost">
                                    {build.cost.map(c => (
                                        <li key={c.itemName} className={c.have >= c.need ? 'is-met' : 'is-short'}>
                                            <span>{c.itemName}</span>
                                            <span>{fmt(c.have)} / {fmt(c.need)}</span>
                                        </li>
                                    ))}
                                </ul>
                                {build.missingTool && <p className="shp-warn">{build.missingTool}</p>}
                                {!build.atTown && <p className="shp-warn">You must be in {build.town} to build here.</p>}
                                {build.carpentryLevel < build.carpentryRequired && (
                                    <p className="shp-warn">Requires Carpentry level {build.carpentryRequired}.</p>
                                )}
                                <button
                                    className="shp-act"
                                    disabled={busy || !build.atTown || !build.canAfford || !!build.missingTool}
                                    onClick={startBuild}
                                >
                                    Begin building
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ── Inside a shopfront ─────────────────────────────────── */}
                {!loading && openShop && !pendingBuy && !pendingSell && (
                    <>
                        <div className="shp-back-row">
                            <button className="shp-cancel" onClick={() => setOpenShop(null)}>← All shops</button>
                            <span className="shp-front-owner">{openShop.owner}</span>
                        </div>

                        {/* pre-wrap: the owner's line breaks are theirs to keep.
                            The server has already collapsed blank-line runs and
                            capped the total. */}
                        {openShop.description && <p className="shp-desc">{openShop.description}</p>}

                        <div className="shp-controls">
                            <input
                                className="shp-filter"
                                value={filter}
                                onChange={e => setFilter(e.target.value)}
                                placeholder="Filter by name…"
                            />
                            <div className="shp-sort">
                                {sortBtn('name', 'Name')}
                                {sortBtn('price', 'Price')}
                                {sortBtn('stock', 'Stock')}
                            </div>
                        </div>

                        <p className="shp-section">For sale</p>
                        {openShop.listings.length === 0
                            ? <p className="shp-empty">The shelves are bare.</p>
                            : (
                                <ul className="shp-list">
                                    {applyView(openShop.listings, l => l.quantity).map(l => (
                                        <li key={l.id} className="shp-row">
                                            <ItemIcon name={l.name} />
                                            <div className="shp-row-main">
                                                <span className="shp-row-name">{l.name}</span>
                                                <span className="shp-row-sub">{fmt(l.quantity)} in stock</span>
                                            </div>
                                            <span className="shp-row-price">{fmt(l.unitPrice)}g ea</span>
                                            <button
                                                className="shp-act"
                                                disabled={openShop.isMine || gold < l.unitPrice}
                                                onClick={() => setPendingBuy({ listing: l, qty: 1 })}
                                            >
                                                Buy
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                        {openShop.buyOrders.length > 0 && (
                            <>
                                <p className="shp-section">Wanted</p>
                                <ul className="shp-list">
                                    {applyView(openShop.buyOrders, o => o.wanted).map(o => (
                                        <li key={o.id} className="shp-row">
                                            <ItemIcon name={o.name} />
                                            <div className="shp-row-main">
                                                <span className="shp-row-name">{o.name}</span>
                                                <span className="shp-row-sub">
                                                    wants {fmt(o.wanted)}
                                                    {o.youHold > 0
                                                        ? <span className="shp-have"> · you have {fmt(o.youHold)}</span>
                                                        : <> · you have none</>}
                                                </span>
                                            </div>
                                            <span className="shp-row-price">{fmt(o.unitPrice)}g ea</span>
                                            <button
                                                className="shp-act"
                                                disabled={openShop.isMine || o.youHold === 0}
                                                onClick={() => setPendingSell({ order: o, qty: Math.min(o.youHold, o.wanted) })}
                                            >
                                                Sell
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </>
                )}

                {/* ── Confirms ───────────────────────────────────────────── */}
                {pendingBuy && (
                    <div className="shp-confirm">
                        <h3>Buy {pendingBuy.listing.name}</h3>
                        <QtyPicker
                            value={pendingBuy.qty}
                            max={Math.max(1, Math.min(pendingBuy.listing.quantity, Math.floor(gold / pendingBuy.listing.unitPrice)))}
                            onChange={n => setPendingBuy({ ...pendingBuy, qty: n })}
                        />
                        <div className="shp-total-row">
                            <span>Total</span>
                            <span className="shp-total">{fmt(pendingBuy.listing.unitPrice * pendingBuy.qty)}g</span>
                        </div>
                        <div className="shp-confirm-actions">
                            <button className="shp-cancel" onClick={() => setPendingBuy(null)} disabled={busy}>Back</button>
                            <button className="shp-act" onClick={confirmBuy} disabled={busy}>Buy</button>
                        </div>
                    </div>
                )}

                {pendingSell && (
                    <div className="shp-confirm">
                        <h3>Sell {pendingSell.order.name}</h3>
                        <QtyPicker
                            value={pendingSell.qty}
                            max={Math.min(pendingSell.order.youHold, pendingSell.order.wanted)}
                            onChange={n => setPendingSell({ ...pendingSell, qty: n })}
                        />
                        <div className="shp-total-row">
                            <span>You receive</span>
                            <span className="shp-total">{fmt(pendingSell.order.unitPrice * pendingSell.qty)}g</span>
                        </div>
                        {/* The tithe is taken from the seller, so say so before
                            they commit rather than after the number lands. */}
                        <p className="shp-warn">A small market tithe comes out of this, the same as at any stall.</p>
                        <div className="shp-confirm-actions">
                            <button className="shp-cancel" onClick={() => setPendingSell(null)} disabled={busy}>Back</button>
                            <button className="shp-act" onClick={confirmSell} disabled={busy}>Sell</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function QtyPicker({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
    return (
        <div className="shp-qty">
            <button className="shp-qty-step" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>−</button>
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
            <button className="shp-qty-step" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
            <button className="shp-qty-all" onClick={() => onChange(max)} disabled={value >= max}>All</button>
        </div>
    )
}
