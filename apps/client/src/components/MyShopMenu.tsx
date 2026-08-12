import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './MyShopMenu.css'

// The owner's side of a player shop (docs/marketplace-spec.md §4).
//
// Opens on Storage, because moving goods in is the first thing anyone does and
// nothing can be listed until something is in the back room.
//
// The two gold stores are kept visually apart everywhere. They are not
// interchangeable: the till is money you have earned, the fund is money you
// have committed to spend, and part of the fund is already promised to sellers
// who have not walked in yet.

interface Listing { id: number; itemId: number; name: string; quantity: number; unitPrice: number }
interface BuyOrder { id: number; itemId: number; name: string; wanted: number; unitPrice: number }
interface StoredItem { itemId: number; name: string; quantity: number }

interface MyShop {
    id: number
    name: string
    tagline: string | null
    description: string | null
    isOpen: boolean
    listings: Listing[]
    buyOrders: BuyOrder[]
    sellSlots: number
    buySlots: number
    till: number
    buyFund: number
    buyFundReserved: number
    buyFundAvailable: number
    storageSlots: number
    storageUsed: number
    atShop: boolean
    taxRate: number
}

interface HistoryEntry {
    id: number
    direction: 'sale' | 'purchase'
    name: string
    quantity: number
    unitPrice: number
    gross: number
    tax: number
    net: number
    counterparty: string | null
    at: string
}

interface HistoryData {
    entries: HistoryEntry[]
    totals: { earned: number; tithed: number; spent: number }
}

interface StorageState {
    slots: number
    used: number
    items: StoredItem[]
    carried: StoredItem[]
}

interface MyShopMenuProps {
    onClose: () => void
    onChanged?: () => void
}

const fmt = (n: number) => n.toLocaleString('en-US')

function ItemIcon({ name }: { name: string }) {
    const [failed, setFailed] = useState(false)
    if (failed) return <span className="msh-icon msh-icon-blank" aria-hidden="true" />
    return <img className="msh-icon" src={getItemIcon(name)} alt="" title={name} onError={() => setFailed(true)} />
}

export default function MyShopMenu({ onClose, onChanged }: MyShopMenuProps) {
    const [tab, setTab] = useState<'storage' | 'manage' | 'history'>('storage')
    const [history, setHistory] = useState<HistoryData | null>(null)
    const [shop, setShop] = useState<MyShop | null>(null)
    const [storage, setStorage] = useState<StorageState | null>(null)
    const [gold, setGold] = useState(0)

    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    // Draft state for the forms.
    const [nameDraft, setNameDraft] = useState('')
    const [taglineDraft, setTaglineDraft] = useState('')
    const [descDraft, setDescDraft] = useState('')
    const [listDraft, setListDraft] = useState<{ itemId: string; qty: string; price: string }>({ itemId: '', qty: '', price: '' })
    const [orderDraft, setOrderDraft] = useState<{ itemId: string; qty: string; price: string }>({ itemId: '', qty: '', price: '' })
    const [fundAmount, setFundAmount] = useState('')
    // Kept as text so the box can be cleared and retyped; only valid values move.
    const [amountText, setAmountText] = useState('1')
    const moveAmount = Math.max(1, parseInt(amountText) || 1)

    const changedRef = useRef(onChanged)
    useEffect(() => { changedRef.current = onChanged })

    const applyShop = useCallback((next: MyShop | null, nextGold?: number) => {
        setShop(next)
        if (next) { setNameDraft(next.name); setTaglineDraft(next.tagline ?? ''); setDescDraft(next.description ?? '') }
        if (nextGold !== undefined) setGold(nextGold)
        changedRef.current?.()
    }, [])

    const loadAll = useCallback(async () => {
        const [state, store] = await Promise.all([
            apiFetch<{ gold: number; mine: MyShop | null }>('/api/shops/mine/state'),
            apiFetch<StorageState>('/api/shops/mine/storage'),
        ])
        setShop(state.mine)
        if (state.mine) { setNameDraft(state.mine.name); setTaglineDraft(state.mine.tagline ?? ''); setDescDraft(state.mine.description ?? '') }
        setGold(state.gold)
        setStorage(store)
    }, [])

    useEffect(() => {
        let cancelled = false
        loadAll()
            .catch(err => { if (!cancelled) setError(err.message) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [loadAll])

    /** Every owner action returns { message, gold, mine }, so one handler does. */
    const act = async (path: string, body?: unknown, method: 'POST' | 'DELETE' = 'POST') => {
        setBusy(true); setError(null)
        try {
            const result = await apiFetch<{ message: string; gold: number; mine: MyShop }>(path, {
                method,
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            })
            applyShop(result.mine, result.gold)
            setNotice(result.message)
            // Listing and unlisting move goods between shelf and storage, so the
            // back room is always refetched rather than guessed at.
            setStorage(await apiFetch<StorageState>('/api/shops/mine/storage'))
            return true
        } catch (err: any) {
            setError(err.message)
            return false
        } finally {
            setBusy(false)
        }
    }

    // Loaded on demand: a shop that has never been visited has nothing to show,
    // and the list can run to 200 rows.
    useEffect(() => {
        if (tab !== 'history') return
        let cancelled = false
        apiFetch<HistoryData>('/api/shops/mine/history')
            .then(h => { if (!cancelled) setHistory(h) })
            .catch(err => { if (!cancelled) setError(err.message) })
        return () => { cancelled = true }
    }, [tab])

    /** Tap-to-move, either direction, capped by what the stack actually holds. */
    const move = (dir: 'deposit' | 'withdraw', item: StoredItem) =>
        act(`/api/shops/mine/storage/${dir}`, {
            itemId: item.itemId,
            quantity: Math.min(moveAmount, item.quantity),
        })

    if (loading) {
        return (
            <div className="msh-overlay" onClick={onClose}>
                <div className="msh-modal" onClick={e => e.stopPropagation()}>
                    <p className="msh-empty">Opening up…</p>
                </div>
            </div>
        )
    }

    if (!shop) {
        return (
            <div className="msh-overlay" onClick={onClose}>
                <div className="msh-modal" onClick={e => e.stopPropagation()}>
                    <p className="msh-empty">You have no shop.</p>
                </div>
            </div>
        )
    }

    const listingSlotsLeft = shop.sellSlots - shop.listings.length
    const orderSlotsLeft = shop.buySlots - shop.buyOrders.length

    return (
        <div className="msh-overlay" onClick={onClose}>
            <div className="msh-modal" onClick={e => e.stopPropagation()}>
                <div className="msh-header">
                    <h2>{shop.name}</h2>
                    <div className="msh-header-right">
                        <span className="msh-purse">{fmt(gold)}<span className="msh-purse-unit">g</span></span>
                        <button className="msh-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                {!shop.atShop && (
                    <p className="msh-warn">You are away from your shop. Come back to Talador to change anything.</p>
                )}

                <div className="msh-tabs">
                    <button className={`msh-tab${tab === 'storage' ? ' is-active' : ''}`} onClick={() => setTab('storage')}>
                        Storage
                    </button>
                    <button className={`msh-tab${tab === 'manage' ? ' is-active' : ''}`} onClick={() => setTab('manage')}>
                        Manage Shop
                    </button>
                    <button className={`msh-tab${tab === 'history' ? ' is-active' : ''}`} onClick={() => setTab('history')}>
                        History
                    </button>
                </div>

                {error && <p className="msh-error">{error}</p>}
                {notice && <p className="msh-notice">{notice}</p>}

                {/* ── Storage ───────────────────────────────────────────── */}
                {/* Two grids, same slot styling as the homestead store. Tap a
                    stored item to take it, tap a carried item to store it. The
                    homestead's Deposit Mode works by tapping the inventory
                    panel, which is behind this modal, so both sides live here
                    instead. */}
                {tab === 'storage' && storage && (
                    <>
                        <div className="msh-store-head">
                            <span className={storage.used >= storage.slots ? 'msh-full' : ''}>
                                {fmt(storage.used)} / {fmt(storage.slots)} slots
                            </span>
                            <label className="msh-amt-label">
                                Amount
                                <input
                                    className="msh-amt"
                                    type="number"
                                    min={1}
                                    value={amountText}
                                    onChange={e => setAmountText(e.target.value)}
                                    onBlur={() => { if (!(parseInt(amountText) >= 1)) setAmountText('1') }}
                                />
                            </label>
                        </div>

                        {!shop.atShop && <p className="msh-note">Come back to Talador to move anything.</p>}

                        <p className="msh-section">In storage</p>
                        <div className="store-grid panel-inset">
                            {storage.items.length === 0 && <p className="store-empty">Nothing back here yet.</p>}
                            {storage.items.map(item => (
                                <div
                                    key={item.itemId}
                                    className="inventory-slot occupied store-slot"
                                    title={`${item.name}: tap to take ${fmt(Math.min(moveAmount, item.quantity))}`}
                                    onClick={() => shop.atShop && !busy && move('withdraw', item)}
                                >
                                    <img src={getItemIcon(item.name)} alt={item.name} className="inventory-item-icon" />
                                    <span className="inventory-item-qty">{fmt(item.quantity)}</span>
                                </div>
                            ))}
                        </div>

                        <p className="msh-section">Carrying</p>
                        <div className="store-grid panel-inset">
                            {storage.carried.length === 0 && <p className="store-empty">Your pack is empty.</p>}
                            {storage.carried.map(item => (
                                <div
                                    key={item.itemId}
                                    className="inventory-slot occupied store-slot"
                                    title={`${item.name}: tap to store ${fmt(Math.min(moveAmount, item.quantity))}`}
                                    onClick={() => shop.atShop && !busy && move('deposit', item)}
                                >
                                    <img src={getItemIcon(item.name)} alt={item.name} className="inventory-item-icon" />
                                    <span className="inventory-item-qty">{fmt(item.quantity)}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* ── Manage ────────────────────────────────────────────── */}
                {tab === 'manage' && (
                    <>
                        {/* Money first: it is the thing an owner comes back to check. */}
                        <div className="msh-money">
                            <div className="msh-money-box">
                                <span className="msh-money-label">Till</span>
                                <span className="msh-money-value">{fmt(shop.till)}g</span>
                                <span className="msh-money-note">takings from sales</span>
                                <button
                                    className="msh-act"
                                    disabled={busy || !shop.atShop || shop.till <= 0}
                                    onClick={() => act('/api/shops/mine/till')}
                                >
                                    Collect
                                </button>
                            </div>

                            <div className="msh-money-box">
                                <span className="msh-money-label">Buying fund</span>
                                <span className="msh-money-value">{fmt(shop.buyFund)}g</span>
                                <span className="msh-money-note">
                                    {fmt(shop.buyFundReserved)}g promised to buy orders, {fmt(shop.buyFundAvailable)}g free
                                </span>
                                <div className="msh-money-row">
                                    <input
                                        className="msh-input msh-input-short"
                                        type="number"
                                        min={1}
                                        value={fundAmount}
                                        placeholder="Amount"
                                        onChange={e => setFundAmount(e.target.value)}
                                    />
                                    <button
                                        className="msh-act"
                                        disabled={busy || !shop.atShop || !parseInt(fundAmount)}
                                        onClick={async () => {
                                            if (await act('/api/shops/mine/fund', { amount: parseInt(fundAmount), direction: 'in' })) setFundAmount('')
                                        }}
                                    >
                                        Add
                                    </button>
                                    <button
                                        className="msh-cancel"
                                        disabled={busy || !shop.atShop || !parseInt(fundAmount)}
                                        onClick={async () => {
                                            if (await act('/api/shops/mine/fund', { amount: parseInt(fundAmount), direction: 'out' })) setFundAmount('')
                                        }}
                                    >
                                        Take out
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ── Shopfront ─────────────────────────────────── */}
                        <p className="msh-section">Shopfront</p>
                        <input
                            className="msh-input"
                            value={nameDraft}
                            maxLength={60}
                            placeholder="Shop name"
                            onChange={e => setNameDraft(e.target.value)}
                        />
                        <input
                            className="msh-input"
                            value={taglineDraft}
                            maxLength={80}
                            placeholder="One line, shown next to your name in the shop list"
                            onChange={e => setTaglineDraft(e.target.value)}
                        />
                        <textarea
                            className="msh-input msh-textarea"
                            value={descDraft}
                            maxLength={500}
                            placeholder="What do you deal in? Visitors see this above your shelves."
                            onChange={e => setDescDraft(e.target.value)}
                        />
                        <div className="msh-row-actions">
                            <button
                                className="msh-act"
                                disabled={busy || !shop.atShop}
                                onClick={() => act('/api/shops/mine/details', {
                                    name: nameDraft,
                                    tagline: taglineDraft || null,
                                    description: descDraft || null,
                                })}
                            >
                                Save
                            </button>
                            <button
                                className="msh-cancel"
                                disabled={busy || !shop.atShop}
                                onClick={() => act('/api/shops/mine/open', { open: !shop.isOpen })}
                            >
                                {shop.isOpen ? 'Close shop' : 'Open shop'}
                            </button>
                        </div>

                        {/* ── Listings ──────────────────────────────────── */}
                        <p className="msh-section">
                            For sale <span className="msh-slots">{shop.listings.length} of {shop.sellSlots} slots</span>
                        </p>

                        {/* Listing happens here, from storage. Goods move out of
                            the back room onto the shelf, so only stored items
                            can be listed. */}
                        {listingSlotsLeft > 0 && storage && (
                            <>
                                <div className="msh-money-row">
                                    <select
                                        className="msh-input"
                                        value={listDraft.itemId}
                                        onChange={e => setListDraft({ ...listDraft, itemId: e.target.value })}
                                    >
                                        <option value="">Choose from storage…</option>
                                        {storage.items
                                            .slice()
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .map(i => (
                                                <option key={i.itemId} value={i.itemId}>
                                                    {i.name} ({fmt(i.quantity)})
                                                </option>
                                            ))}
                                    </select>
                                    <input
                                        className="msh-input msh-input-short"
                                        type="number"
                                        min={1}
                                        value={listDraft.qty}
                                        placeholder="How many"
                                        onChange={e => setListDraft({ ...listDraft, qty: e.target.value })}
                                    />
                                    <input
                                        className="msh-input msh-input-short"
                                        type="number"
                                        min={1}
                                        value={listDraft.price}
                                        placeholder="Price each"
                                        onChange={e => setListDraft({ ...listDraft, price: e.target.value })}
                                    />
                                    <button
                                        className="msh-act"
                                        disabled={busy || !shop.atShop || !listDraft.itemId || !parseInt(listDraft.qty) || !parseInt(listDraft.price)}
                                        onClick={async () => {
                                            const ok = await act('/api/shops/mine/listings', {
                                                itemId: parseInt(listDraft.itemId),
                                                quantity: parseInt(listDraft.qty),
                                                unitPrice: parseInt(listDraft.price),
                                            })
                                            if (ok) setListDraft({ itemId: '', qty: '', price: '' })
                                        }}
                                    >
                                        List
                                    </button>
                                </div>
                                <p className="msh-note">
                                    A tithe of {Math.round(shop.taxRate * 100)}% comes out of whatever you sell.
                                </p>
                            </>
                        )}

                        {shop.listings.length === 0
                            ? <p className="msh-empty">Nothing on the shelves yet.</p>
                            : (
                                <ul className="msh-list">
                                    {shop.listings.map(l => (
                                        <li key={l.id} className="msh-row">
                                            <ItemIcon name={l.name} />
                                            <div className="msh-row-main">
                                                <span className="msh-row-name">{l.name}</span>
                                                <span className="msh-row-sub">{fmt(l.quantity)} on the shelf</span>
                                            </div>
                                            <input
                                                className="msh-input msh-input-price"
                                                type="number"
                                                min={1}
                                                defaultValue={l.unitPrice}
                                                disabled={!shop.atShop}
                                                onBlur={e => {
                                                    const price = parseInt(e.target.value)
                                                    if (price && price !== l.unitPrice) {
                                                        act(`/api/shops/mine/listings/${l.id}/price`, { unitPrice: price })
                                                    }
                                                }}
                                            />
                                            <button
                                                className="msh-cancel"
                                                disabled={busy || !shop.atShop}
                                                onClick={() => act(`/api/shops/mine/listings/${l.id}`, undefined, 'DELETE')}
                                            >
                                                Unlist
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        {listingSlotsLeft <= 0 && <p className="msh-note">All selling slots are in use.</p>}

                        {/* ── Buy orders ────────────────────────────────── */}
                        <p className="msh-section">
                            Wanted <span className="msh-slots">{shop.buyOrders.length} of {shop.buySlots} slots</span>
                        </p>
                        <p className="msh-note">
                            Post what you want to buy and visitors can sell it to you while you are away.
                            The gold is held out of your buying fund until someone fills the order.
                        </p>

                        {orderSlotsLeft > 0 && storage && (
                            <div className="msh-money-row">
                                <select
                                    className="msh-input"
                                    value={orderDraft.itemId}
                                    onChange={e => setOrderDraft({ ...orderDraft, itemId: e.target.value })}
                                >
                                    <option value="">Choose an item…</option>
                                    {[...storage.items, ...storage.carried]
                                        .filter((i, idx, arr) => arr.findIndex(x => x.itemId === i.itemId) === idx)
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map(i => <option key={i.itemId} value={i.itemId}>{i.name}</option>)}
                                </select>
                                <input
                                    className="msh-input msh-input-short"
                                    type="number"
                                    min={1}
                                    value={orderDraft.qty}
                                    placeholder="How many"
                                    onChange={e => setOrderDraft({ ...orderDraft, qty: e.target.value })}
                                />
                                <input
                                    className="msh-input msh-input-short"
                                    type="number"
                                    min={1}
                                    value={orderDraft.price}
                                    placeholder="Price each"
                                    onChange={e => setOrderDraft({ ...orderDraft, price: e.target.value })}
                                />
                                <button
                                    className="msh-act"
                                    disabled={busy || !shop.atShop || !orderDraft.itemId || !parseInt(orderDraft.qty) || !parseInt(orderDraft.price)}
                                    onClick={async () => {
                                        const ok = await act('/api/shops/mine/orders', {
                                            itemId: parseInt(orderDraft.itemId),
                                            quantity: parseInt(orderDraft.qty),
                                            unitPrice: parseInt(orderDraft.price),
                                        })
                                        if (ok) setOrderDraft({ itemId: '', qty: '', price: '' })
                                    }}
                                >
                                    Post
                                </button>
                            </div>
                        )}

                        {shop.buyOrders.length === 0
                            ? <p className="msh-empty">You are not buying anything right now.</p>
                            : (
                                <ul className="msh-list">
                                    {shop.buyOrders.map(o => (
                                        <li key={o.id} className="msh-row">
                                            <ItemIcon name={o.name} />
                                            <div className="msh-row-main">
                                                <span className="msh-row-name">{o.name}</span>
                                                <span className="msh-row-sub">
                                                    want {fmt(o.wanted)} more · {fmt(o.wanted * o.unitPrice)}g held
                                                </span>
                                            </div>
                                            <span className="msh-row-price">{fmt(o.unitPrice)}g ea</span>
                                            <button
                                                className="msh-cancel"
                                                disabled={busy || !shop.atShop}
                                                onClick={() => act(`/api/shops/mine/orders/${o.id}`, undefined, 'DELETE')}
                                            >
                                                Withdraw
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                    </>
                )}

                {/* ── History ───────────────────────────────────────────── */}
                {/* The whole promise of a shop is that it trades while you are
                    away, which is worth nothing if you come back to a fuller
                    till and no idea what left the shelf. */}
                {tab === 'history' && (
                    <>
                        {!history && <p className="msh-empty">Turning the pages…</p>}

                        {history && (
                            <>
                                <div className="msh-money">
                                    <div className="msh-money-box">
                                        <span className="msh-money-label">Earned, all time</span>
                                        <span className="msh-money-value">{fmt(history.totals.earned)}g</span>
                                        <span className="msh-money-note">after {fmt(history.totals.tithed)}g in tithes</span>
                                    </div>
                                    <div className="msh-money-box">
                                        <span className="msh-money-label">Spent on buy orders</span>
                                        <span className="msh-money-value">{fmt(history.totals.spent)}g</span>
                                        <span className="msh-money-note">paid out to sellers</span>
                                    </div>
                                </div>

                                {history.entries.length === 0
                                    ? <p className="msh-empty">Nobody has traded here yet.</p>
                                    : (
                                        <ul className="msh-list">
                                            {history.entries.map(e => (
                                                <li key={e.id} className="msh-hist">
                                                    <span className={`msh-hist-dir is-${e.direction}`}>
                                                        {e.direction === 'sale' ? 'sold' : 'bought'}
                                                    </span>
                                                    <span className="msh-hist-what">
                                                        {fmt(e.quantity)} {e.name}
                                                    </span>
                                                    <span className="msh-hist-who">
                                                        {e.counterparty ?? 'someone'}
                                                    </span>
                                                    <span className="msh-hist-when">
                                                        {new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    </span>
                                                    {/* Net, not gross: the tithe is already gone, and
                                                        showing the bigger number would only mislead. */}
                                                    <span className={`msh-hist-gold is-${e.direction}`}>
                                                        {e.direction === 'sale' ? '+' : '−'}{fmt(e.direction === 'sale' ? e.net : e.gross)}g
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
