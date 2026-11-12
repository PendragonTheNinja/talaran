import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import { onSocket } from '../lib/socket'
import { sortItems, useStoreSort } from '../lib/itemSort'
import StoreSortBar from './StoreSortBar'
import ConfirmModal from './ConfirmModal'
import { useItemTooltip } from './ItemTooltip'
import './PropertyStorage.css'
import './GuildHallTab.css'
import ErrorLine from './ErrorLine'

// The guild hall, as the Guild panel's Hall tab (server services/guildHall.ts).
// Building, the storehouse and its ledger are sub-tabs here, open only while
// the player stands at the hall. Everything allowed or refused is the
// server's call; this only draws what it is sent.

interface Requirement { item: string; needed: number; delivered: number; exists: boolean; held: number }
interface StoredItem { item_id: number; name: string; type: string; subtype: string | null; quantity: number; description?: string }
interface CarriedItem { item_id: number; name: string; type: string; subtype?: string | null; quantity: number; description?: string; synthetic?: boolean }
interface LedgerRow { player: string; item: string | null; delta: number; at: string; approvedBy?: string | null }
interface Request { id: number; playerId: number | null; player: string; item: string; itemId: number; quantity: number; status: 'pending' | 'approved'; approvedBy: string | null; at: string }

interface HallState {
    inGuild: boolean
    guildName?: string
    island: string | null
    locationName: string | null
    halls: { island: string; locationName: string; tier: number }[]
    hallOnIsland: { locationName: string; tier: number } | null
    atHall: boolean
    canFound: boolean
    canWithdrawItems: boolean
    canWithdrawGold: boolean
    canApprove: boolean
    isLeader: boolean
    /** Open requests: all of them for an approver, only your own otherwise. */
    requests: Request[]
    hall?: {
        tier: number
        maxTier: number
        gold: number
        capacity: number
        used: number
        building: { tier: number; capacityAfter: number; xpPerPiece: number; requirements: Requirement[] } | null
        storage: StoredItem[]
        ledger: LedgerRow[]
        builders: { name: string; given: number }[]
    }
}

interface GuildHallTabProps {
    /** Start the 20-second build action for this material (GameView's guild_build). */
    onStartBuild: (item: string) => void
}

export default function GuildHallTab({ onStartBuild, myName }: GuildHallTabProps & { myName?: string }) {
    const [state, setState] = useState<HallState | null>(null)
    const [carried, setCarried] = useState<CarriedItem[]>([])
    const [sub, setSub] = useState<'build' | 'store' | 'requests' | 'ledger'>('build')
    const [amount, setAmount] = useState(1)
    const [goldText, setGoldText] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [confirm, setConfirm] = useState<'found' | 'abandon' | null>(null)
    const [sort, setSort] = useStoreSort('guildStorageSort')
    const { hoverProps, tooltipEl } = useItemTooltip()

    const load = useCallback(() => Promise.all([
        apiFetch<HallState>('/api/guild-hall'),
        apiFetch<{ inventory: CarriedItem[] }>('/api/inventory'),
    ])
        .then(([s, pack]) => {
            setState(s)
            setCarried((pack.inventory ?? []).filter(i => !i.synthetic))
        })
        .catch(() => setError('The hall could not be reached just now.')), [])

    useEffect(() => {
        void Promise.all([
            apiFetch<HallState>('/api/guild-hall'),
            apiFetch<{ inventory: CarriedItem[] }>('/api/inventory'),
        ])
            .then(([s, pack]) => {
                setState(s)
                setCarried((pack.inventory ?? []).filter(i => !i.synthetic))
            })
            .catch(() => setError('The hall could not be reached just now.'))
        // Another member built, stored or took something: draw it fresh.
        const refresh = () => { load() }
        const offHall = onSocket('guild_hall_changed', refresh)
        const offPack = onSocket('inventory_changed', refresh)
        return () => { offHall(); offPack() }
    }, [load])

    const act = async (path: string, body?: unknown) => {
        setBusy(true); setError('')
        try {
            await apiFetch(`/api/guild-hall${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
            await load()
        } catch (err) {
            setError((err as { message?: string }).message || 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    /** Open requests, with what this player may do about each. */
    const requestList = (s: HallState) => (
        <div className="hall-requests">
            {s.requests.length === 0 && <p className="store-empty">No requests are open.</p>}
            {s.requests.map(r => {
                const mine = r.player === myName
                return (
                    <div key={r.id} className="hall-request">
                        <div className="inventory-slot occupied hall-req-icon" {...hoverProps({ name: r.item })}>
                            <img src={getItemIcon(r.item)} alt={r.item} className="inventory-item-icon" onError={e => { e.currentTarget.style.display = 'none' }} />
                        </div>
                        <div className="hall-req-body">
                            <span>{mine ? 'You ask' : `${r.player} asks`} for {r.quantity.toLocaleString()} {r.item}</span>
                            <span className="muted-text hall-req-count">
                                {r.status === 'approved' ? `Approved by ${r.approvedBy ?? 'an officer'}, set aside at the hall` : 'Waiting for an answer'}
                            </span>
                        </div>
                        <div className="hall-request-actions">
                            {s.canApprove && !mine && r.status === 'pending' && (
                                <>
                                    <button className="btn btn-gold" disabled={busy} onClick={() => act(`/requests/${r.id}/approve`, {})}>Approve</button>
                                    <button className="btn" disabled={busy} onClick={() => act(`/requests/${r.id}/deny`, {})}>Deny</button>
                                </>
                            )}
                            {s.canApprove && !mine && r.status === 'approved' && (
                                <button className="btn" disabled={busy} onClick={() => act(`/requests/${r.id}/deny`, {})}>Withdraw</button>
                            )}
                            {mine && r.status === 'approved' && s.atHall && (
                                <button className="btn btn-gold" disabled={busy} onClick={() => act(`/requests/${r.id}/collect`, {})}>Collect</button>
                            )}
                            {mine && (
                                <button className="btn" disabled={busy} onClick={() => act(`/requests/${r.id}/cancel`, {})}>Cancel</button>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )

    if (!state) return <p className="muted-text" style={{ fontStyle: 'italic' }}>{error || 'Walking up to the hall…'}</p>
    if (!state.inGuild) return <p className="muted-text">You are not in a guild.</p>

    const others = state.halls.filter(h => h.island !== state.island)
    const elsewhere = others.length > 0 && (
        <div className="hall-elsewhere">
            <p className="guild-section-title">Halls on Other Islands</p>
            {others.map(h => (
                <p key={h.island} className="muted-text">{h.island}: {h.locationName}, {h.tier > 0 ? `tier ${h.tier}` : 'foundations laid'}</p>
            ))}
        </div>
    )

    // No hall on this island yet.
    if (!state.hallOnIsland) {
        return (
            <div className="hall">
                <p className="hall-lead">Your guild has no hall on {state.island ?? 'this island'}.</p>
                {state.canFound ? (
                    <>
                        <p className="muted-text">
                            A hall is raised by the whole guild, one plank, block and nail at a time, and once its
                            first tier stands it holds a storehouse every member can use. You choose where it stands.
                        </p>
                        <button className="btn btn-gold" disabled={busy} onClick={() => setConfirm('found')}>
                            Lay the foundations here, at {state.locationName}
                        </button>
                    </>
                ) : (
                    <p className="muted-text">The guild&apos;s leader decides where its hall will stand.</p>
                )}
                <ErrorLine message={error} className="store-error" />
                {elsewhere}
                {confirm === 'found' && (
                    <ConfirmModal
                        message={`Raise your guild's hall for ${state.island} at ${state.locationName}? It can be moved later only by pulling it down and building again.`}
                        confirmLabel="Lay the Foundations"
                        onConfirm={() => { setConfirm(null); act('/found') }}
                        onCancel={() => setConfirm(null)}
                    />
                )}
            </div>
        )
    }

    // A hall on this island, somewhere else.
    if (!state.atHall || !state.hall) {
        return (
            <div className="hall">
                <p className="hall-lead">
                    Your hall on {state.island} stands at <span className="gold-text">{state.hallOnIsland.locationName}</span>
                    {state.hallOnIsland.tier > 0 ? `, tier ${state.hallOnIsland.tier}.` : ', its foundations laid.'}
                </p>
                <p className="muted-text">Go there to build it up or to use the storehouse.</p>
                {state.requests.length > 0 && (
                    <>
                        <p className="guild-section-title">Storehouse Requests</p>
                        <ErrorLine message={error} className="store-error" />
                        {requestList(state)}
                    </>
                )}
                {elsewhere}
            </div>
        )
    }

    const hall = state.hall
    const b = hall.building
    const percent = (n: number, of: number) => `${Math.min(100, (n / Math.max(1, of)) * 100).toFixed(1)}%`

    return (
        <div className="hall">
            <div className="hall-head">
                <span className="hall-title gold-text">
                    {hall.tier > 0 ? `Tier ${hall.tier} Hall` : 'Foundations'} at {state.locationName}
                </span>
                {hall.tier > 0 && <span className="muted-text">Storehouse: {hall.used.toLocaleString()} of {hall.capacity.toLocaleString()} stowed</span>}
            </div>

            <div className="hall-tabs">
                <button className={`hall-tab ${sub === 'build' ? 'active' : ''}`} onClick={() => setSub('build')}>Building</button>
                <button className={`hall-tab ${sub === 'store' ? 'active' : ''}`} onClick={() => setSub('store')} disabled={hall.tier < 1}>Storehouse</button>
                <button className={`hall-tab ${sub === 'requests' ? 'active' : ''}`} onClick={() => setSub('requests')} disabled={hall.tier < 1}>
                    Requests{state.requests.length > 0 ? ` (${state.requests.length})` : ''}
                </button>
                <button className={`hall-tab ${sub === 'ledger' ? 'active' : ''}`} onClick={() => setSub('ledger')} disabled={hall.tier < 1}>Ledger</button>
            </div>

            <ErrorLine message={error} className="store-error" />

            {sub === 'build' && (
                <div className="hall-build">
                    {b ? (
                        <>
                            <p className="muted-text hall-note">
                                Tier {b.tier}{hall.tier < 1 ? ', the hall itself' : ''}: every member can add to it, one piece every
                                20 seconds, with a mallet and saw in hand. Each piece pays {b.xpPerPiece} Carpentry experience.
                                {` When it stands, the storehouse holds ${b.capacityAfter.toLocaleString()}.`}
                            </p>
                            {b.requirements.map(r => {
                                const done = r.delivered >= r.needed
                                return (
                                    <div key={r.item} className="hall-req">
                                        <div className="inventory-slot occupied hall-req-icon" {...hoverProps({ name: r.item })}>
                                            <img src={getItemIcon(r.item)} alt={r.item} className="inventory-item-icon" onError={e => { e.currentTarget.style.display = 'none' }} />
                                        </div>
                                        <div className="hall-req-body">
                                            <span className="hall-req-name">{r.item}</span>
                                            <div className="hall-bar"><div className="hall-bar-fill" style={{ width: percent(r.delivered, r.needed) }} /></div>
                                            <span className="muted-text hall-req-count">
                                                {r.delivered.toLocaleString()} of {r.needed.toLocaleString()}
                                                {r.exists ? ` · you carry ${r.held.toLocaleString()}` : ' · no one in Talaran can make these yet'}
                                            </span>
                                        </div>
                                        <button
                                            className="btn btn-gold hall-req-btn"
                                            disabled={busy || done || !r.exists || r.held < 1}
                                            onClick={() => onStartBuild(r.item)}
                                        >
                                            {done ? 'Done' : !r.exists ? 'Not made yet' : `Add ${r.item}`}
                                        </button>
                                    </div>
                                )
                            })}
                        </>
                    ) : (
                        <p className="hall-lead">The hall stands as high as it can be built, for now.</p>
                    )}

                    {hall.builders.length > 0 && (
                        <div className="hall-builders">
                            <p className="guild-section-title">Builders</p>
                            {hall.builders.map((x, i) => (
                                <div key={x.name} className="hall-builder">
                                    <span className="muted-text">{i + 1}.</span>
                                    <span>{x.name}</span>
                                    <span className="gold-text tabular-num">{x.given.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {state.isLeader && (
                        <button className="btn btn-red hall-abandon" disabled={busy} onClick={() => setConfirm('abandon')}>
                            Pull the Hall Down
                        </button>
                    )}
                </div>
            )}

            {sub === 'store' && hall.tier > 0 && (
                <div className="store">
                    <div className="hall-gold">
                        <span>Gold: <span className="gold-text tabular-num">{hall.gold.toLocaleString()}</span></span>
                        <input
                            className="store-amt"
                            type="number"
                            min={1}
                            placeholder="Amount"
                            value={goldText}
                            onChange={e => setGoldText(e.target.value)}
                        />
                        <button className="btn" disabled={busy || !(parseInt(goldText) > 0)} onClick={() => act('/gold/deposit', { amount: parseInt(goldText) })}>Put In</button>
                        {state.canWithdrawGold && (
                            <button className="btn" disabled={busy || !(parseInt(goldText) > 0)} onClick={() => act('/gold/withdraw', { amount: parseInt(goldText) })}>Take Out</button>
                        )}
                    </div>

                    <div className="store-head">
                        <span>{hall.used.toLocaleString()} of {hall.capacity.toLocaleString()} stowed</span>
                        <label className="store-amt-label">
                            Amount
                            <input
                                className="store-amt"
                                type="number"
                                min={1}
                                value={amount}
                                onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                            />
                        </label>
                    </div>
                    <p className="store-note">
                        Room is counted by the item: 300 Granite Blocks take 300 of it.
                        {state.canWithdrawItems ? ' Tap the storehouse to take, your pack to put in.' : ' Tap your pack to put in. Tap the storehouse to ask for something; an officer will answer.'}
                    </p>

                    <StoreSortBar sort={sort} onChange={setSort} />

                    <div className="store-grid panel-inset">
                        {hall.storage.length === 0 && <p className="store-empty">Nothing stowed here yet.</p>}
                        {sortItems(hall.storage, sort.mode, sort.dir, sort.filter).map(item => (
                            <div
                                key={item.item_id}
                                className="inventory-slot occupied store-slot"
                                {...hoverProps(item, `Left-click to ${state.canWithdrawItems ? 'take' : 'ask for'} ${Math.min(amount, item.quantity)}`)}
                                onClick={() => {
                                    if (busy) return
                                    const qty = Math.min(amount, item.quantity)
                                    if (state.canWithdrawItems) act('/withdraw', { itemId: item.item_id, quantity: qty })
                                    else act('/request', { itemId: item.item_id, quantity: qty }).then(() => setSub('requests'))
                                }}
                            >
                                <img src={getItemIcon(item.name)} alt={item.name} className="inventory-item-icon" onError={e => { e.currentTarget.style.display = 'none' }} />
                                <span className="inventory-item-qty">{item.quantity.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>

                    <p className="store-section">Carrying</p>
                    <div className="store-grid panel-inset">
                        {carried.length === 0 && <p className="store-empty">Your pack is empty.</p>}
                        {sortItems(carried, sort.mode, sort.dir, sort.filter).map(item => (
                            <div
                                key={item.item_id}
                                className="inventory-slot occupied store-slot"
                                {...hoverProps(item, `Left-click to put in ${Math.min(amount, item.quantity)}`)}
                                onClick={() => !busy && act('/deposit', { itemId: item.item_id, quantity: Math.min(amount, item.quantity) })}
                            >
                                <img src={getItemIcon(item.name)} alt={item.name} className="inventory-item-icon" onError={e => { e.currentTarget.style.display = 'none' }} />
                                <span className="inventory-item-qty">{item.quantity.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {sub === 'requests' && hall.tier > 0 && requestList(state)}

            {sub === 'ledger' && hall.tier > 0 && (
                <div className="hall-ledger">
                    {hall.ledger.length === 0 && <p className="store-empty">Nothing has gone in or out yet.</p>}
                    {hall.ledger.map((l, i) => (
                        <div key={i} className="hall-ledger-row">
                            <span className="muted-text">{new Date(l.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            <span>{l.player}</span>
                            <span className={l.delta > 0 ? 'hall-in' : 'hall-out'}>
                                {l.delta > 0 ? 'put in' : 'took'} {Math.abs(l.delta).toLocaleString()} {l.item ?? 'gold'}
                                {l.approvedBy ? <span className="muted-text">, approved by {l.approvedBy}</span> : null}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {elsewhere}
            {tooltipEl}

            {confirm === 'abandon' && (
                <ConfirmModal
                    message="Pull the hall down? Everything built goes with it, so it can be raised again somewhere else from nothing. The storehouse must be empty first."
                    confirmLabel="Pull It Down"
                    onConfirm={() => { setConfirm(null); act('/abandon') }}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </div>
    )
}
