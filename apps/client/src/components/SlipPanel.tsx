import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { onSocket } from '../lib/socket'
import { getItemIcon } from '../lib/items'
import { backdropClose } from '../lib/backdrop'
import { useItemTooltip } from './ItemTooltip'
import ErrorLine from './ErrorLine'
import type { VoyageState } from './IsletActions'
import './TavernPanel.css'
import './GuildHallTab.css'
import './SlipPanel.css'

// The slip (server services/boats.ts): lay a hull, then set its pieces in
// order, 1 to 5 of a material every 20 seconds. Everything allowed or refused
// is the server's call; this only draws what it is sent.

interface Requirement { item: string; needed: number; delivered: number; exists: boolean; held: number; stocked: number }
/** Building for hire (docs/antura-plan.md §6b): who may work on the hull, and what it pays. */
interface Hire { rate: number; purse: number; hands: string[]; laid: { item: string; quantity: number }[] }
interface Hull {
    locationName: string
    atSlip: boolean
    pieceNumber: number
    pieceCount: number
    pieceName: string | null
    piecesDone: string[]
    requirements: Requirement[]
    hire: Hire
}
/** A hull of someone else's that this player has been asked to work on. */
interface HireJob {
    ownerId: number
    ownerName: string
    key: string
    name: string
    buildLevel: number
    canBuild: boolean
    xpPerTurn: number
    piecesPerTurn: number
    hull: Hull
}
interface Boat {
    key: string
    name: string
    tier: number
    buildLevel: number
    sailLevel: number
    description: string | null
    owned: boolean
    canBuild: boolean
    xpPerTurn: number
    piecesPerTurn: number
    materials: { name: string; materials: { item: string; qty: number }[] }[]
    hull: Hull | null
}
interface State { locationName: string | null; hasSlip: boolean; carpentryLevel: number; boats: Boat[]; hires: HireJob[] }

const fmt = (n: number) => n.toLocaleString('en-US')
const percent = (n: number, of: number) => `${Math.min(100, (n / Math.max(1, of)) * 100).toFixed(1)}%`

export default function SlipPanel({ onClose, onStartBuild, onPutToSea }: {
    onClose: () => void
    /** Put to sea in this boat (GameLayout's handleVoyage). */
    onPutToSea: (boat: string) => void
    /** Start setting `item` into the hull of `boat`, someone else's when `owner` is given (GameView's vessel_build). */
    onStartBuild: (boat: string, item: string, owner?: number) => void
}) {
    const [state, setState] = useState<State | null>(null)
    const [voyage, setVoyage] = useState<VoyageState | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const { hoverProps, tooltipEl } = useItemTooltip()

    const load = useCallback(async () => {
        try {
            setState(await apiFetch<State>('/api/boats'))
        } catch (err) {
            setError((err as { message?: string }).message || 'The slip could not be read.')
        }
    }, [])

    // A hand finishing the owner's boat (server boats_changed): read the slip again.
    useEffect(() => onSocket('boats_changed', () => {
        void apiFetch<State>('/api/boats').then(setState).catch(() => { /* keep what is showing */ })
    }), [])

    useEffect(() => {
        void apiFetch<VoyageState>('/api/voyages').then(setVoyage).catch(() => setVoyage(null))
        void apiFetch<State>('/api/boats')
            .then(setState)
            .catch(err => setError((err as { message?: string }).message || 'The slip could not be read.'))
    }, [])

    // One owner's control at a time: post it, then read the slip again.
    const post = async (path: string, body: Record<string, unknown>, fallback: string) => {
        setBusy(true)
        setError(null)
        try {
            await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
            await load()
        } catch (err) {
            setError((err as { message?: string }).message || fallback)
        } finally {
            setBusy(false)
        }
    }

    const requirementRow = (r: Requirement, onAdd: () => void, blocked: string | null) => {
        const done = r.delivered >= r.needed
        const can = r.held + r.stocked
        return (
            <div key={r.item} className="hall-req">
                <div className="inventory-slot occupied hall-req-icon" {...hoverProps({ name: r.item })}>
                    <img src={getItemIcon(r.item)} alt={r.item} className="inventory-item-icon" onError={e => { e.currentTarget.style.display = 'none' }} />
                </div>
                <div className="hall-req-body">
                    <span className="hall-req-name">{r.item}</span>
                    <div className="hall-bar"><div className="hall-bar-fill" style={{ width: percent(r.delivered, r.needed) }} /></div>
                    <span className="muted-text hall-req-count">
                        {fmt(r.delivered)} of {fmt(r.needed)}
                        {r.exists ? ` · you carry ${fmt(r.held)}` : ' · no one in Talaran can make these yet'}
                        {r.stocked > 0 && ` · ${fmt(r.stocked)} laid at the slip`}
                    </span>
                </div>
                <button
                    className="btn btn-gold hall-req-btn"
                    disabled={busy || done || !r.exists || can < 1 || !!blocked}
                    title={blocked ?? undefined}
                    onClick={onAdd}
                >
                    {done ? 'Done' : !r.exists ? 'Not made yet' : `Add ${r.item}`}
                </button>
            </div>
        )
    }

    const layKeel = async (boat: string) => {
        setBusy(true)
        setError(null)
        try {
            await apiFetch('/api/boats/keel', { method: 'POST', body: JSON.stringify({ boat }) })
            await load()
        } catch (err) {
            setError((err as { message?: string }).message || 'The keel could not be laid.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="tavern-overlay" {...backdropClose(onClose)}>
            <div className="tavern-modal" onClick={e => e.stopPropagation()}>
                <div className="tavern-header">
                    <h2>The Slip{state?.locationName ? `, ${state.locationName}` : ''}</h2>
                    <button className="tavern-close" onClick={onClose}>✕</button>
                </div>

                <ErrorLine message={error} className="tavern-error" />

                {state && !state.hasSlip && (
                    <p className="tavern-scene">There is no slip here. Hulls are laid down in a port.</p>
                )}

                {state?.boats.map(b => (
                    <div key={b.key} className="hall-build">
                        <p className="tavern-section">{b.name}</p>
                        {b.description && <p className="tavern-scene">{b.description}</p>}

                        {b.owned ? (
                            <>
                                <p className="muted-text hall-note">
                                    Yours. Out to the islets, by chance, and home again; up to three landings before you must make port.
                                    {voyage && ` Islets found: ${voyage.islets.filter(i => i.found).length} of ${voyage.islets.length}.`}
                                </p>
                                {voyage && voyage.islets.some(i => i.found) && (
                                    <p className="muted-text hall-note">
                                        {voyage.islets.filter(i => i.found).map(i => `${i.name} (${i.landings} landing${i.landings === 1 ? '' : 's'})`).join(', ')}
                                    </p>
                                )}
                                <button
                                    className="btn btn-gold"
                                    disabled={busy || !state.hasSlip}
                                    onClick={() => { onPutToSea(b.key); onClose() }}
                                >
                                    Put to sea
                                </button>
                            </>
                        ) : !b.hull ? (
                            <>
                                <p className="muted-text hall-note">
                                    Building it needs Carpentry {b.buildLevel} and a mallet and saw in hand, yours or a carpenter's you hire. Built in {b.materials.length} pieces:{' '}
                                    {b.materials.map(p => `${p.name.toLowerCase()} (${p.materials.map(m => `${fmt(m.qty)} ${m.item}`).join(', ')})`).join('; ')}.
                                </p>
                                <button
                                    className="btn btn-gold"
                                    disabled={busy || !state.hasSlip}
                                    onClick={() => layKeel(b.key)}
                                >
                                    {`Lay the keel of a ${b.name}`}
                                </button>
                            </>
                        ) : !b.hull.atSlip ? (
                            <p className="muted-text hall-note">Your {b.name} stands on the slip at {b.hull.locationName}.</p>
                        ) : (
                            <>
                                <p className="muted-text hall-note">
                                    Piece {b.hull.pieceNumber} of {b.hull.pieceCount}: the {b.hull.pieceName?.toLowerCase()}.
                                    {b.hull.piecesDone.length > 0 && ` Done: ${b.hull.piecesDone.map(p => p.toLowerCase()).join(', ')}.`}
                                    {` 1 to 5 pieces every 20 seconds (about ${b.piecesPerTurn} at your Carpentry level), each turn paying ${b.xpPerTurn} Carpentry experience.`}
                                </p>
                                {b.hull.requirements.map(r => requirementRow(r, () => { onStartBuild(b.key, r.item); onClose() }, null))}
                                <HireControls
                                    boat={b.key}
                                    hull={b.hull}
                                    busy={busy}
                                    onPost={post}
                                />
                            </>
                        )}
                    </div>
                ))}
                {state && state.hires.length > 0 && (
                    <>
                        <p className="tavern-section">Asked to work on</p>
                        {state.hires.map(j => {
                            const purseEmpty = j.hull.hire.rate > 0 && j.hull.hire.purse < j.hull.hire.rate
                            const blocked = !j.hull.atSlip ? `It stands on the slip at ${j.hull.locationName}.`
                                : !j.canBuild ? `Needs Carpentry ${j.buildLevel}.`
                                    : purseEmpty ? 'The purse at the slip is empty.' : null
                            return (
                                <div key={`${j.ownerId}-${j.key}`} className="hall-build">
                                    <p className="muted-text hall-note">
                                        {j.ownerName}'s {j.name}, on the slip at {j.hull.locationName}. Piece {j.hull.pieceNumber} of {j.hull.pieceCount}: the {j.hull.pieceName?.toLowerCase()}.
                                        {j.hull.hire.rate > 0
                                            ? ` Pays ${fmt(j.hull.hire.rate)} gold a piece; the purse holds ${fmt(j.hull.hire.purse)}.`
                                            : ' Unpaid: a favour.'}
                                        {` Each turn pays you ${j.xpPerTurn} Carpentry experience. Materials laid at the slip are used before your own.`}
                                    </p>
                                    {j.hull.atSlip && j.hull.requirements.map(r =>
                                        requirementRow(r, () => { onStartBuild(j.key, r.item, j.ownerId); onClose() }, blocked))}
                                    {!j.hull.atSlip && <p className="muted-text hall-note">{blocked}</p>}
                                </div>
                            )
                        })}
                    </>
                )}
                {tooltipEl}
            </div>
        </div>
    )
}

/**
 * The owner's side of building for hire (docs/antura-plan.md §6b): name the
 * hands who may work on the hull, set what each piece pays, keep the purse,
 * and lay materials at the slip for the hands to use.
 */
function HireControls({ boat, hull, busy, onPost }: {
    boat: string
    hull: Hull
    busy: boolean
    onPost: (path: string, body: Record<string, unknown>, fallback: string) => Promise<void>
}) {
    const [hand, setHand] = useState('')
    const [rate, setRate] = useState(String(hull.hire.rate))
    const [gold, setGold] = useState('')
    const [qty, setQty] = useState<Record<string, string>>({})
    const h = hull.hire
    const amountOf = (item: string) => Math.floor(Number(qty[item] ?? ''))

    return (
        <div className="hall-hire">
            <p className="tavern-section">Hands and pay</p>
            <p className="muted-text hall-note">
                Anyone you name may work on this hull with their own mallet and saw, and the Carpentry for it.
                Each piece they set in pays them from the purse at once; a piece the purse cannot pay for is not set.
            </p>
            <div className="hall-hire-row">
                <span className="hall-req-name">Hands</span>
                <span className="muted-text">
                    {h.hands.length ? h.hands.map(n => (
                        <button key={n} className="btn hall-hire-chip" disabled={busy} title={`Stop ${n} working on it`}
                            onClick={() => onPost('/api/boats/hands/remove', { boat, name: n }, 'That hand could not be let go.')}>
                            {n} ✕
                        </button>
                    )) : 'Nobody yet.'}
                </span>
            </div>
            <div className="hall-hire-row">
                <input className="hall-hire-input" placeholder="A carpenter's name" value={hand} maxLength={32}
                    onChange={e => setHand(e.target.value)} />
                <button className="btn btn-gold" disabled={busy || !hand.trim()}
                    onClick={() => { void onPost('/api/boats/hands', { boat, name: hand.trim() }, 'That carpenter could not be named.'); setHand('') }}>
                    Name a hand
                </button>
            </div>
            <div className="hall-hire-row">
                <span className="hall-req-name">Gold a piece</span>
                <input className="hall-hire-input hall-hire-num" inputMode="numeric" value={rate} onChange={e => setRate(e.target.value)} />
                <button className="btn btn-gold" disabled={busy || String(h.rate) === rate.trim()}
                    onClick={() => onPost('/api/boats/rate', { boat, rate: Number(rate) }, 'The pay could not be set.')}>
                    Set
                </button>
            </div>
            <div className="hall-hire-row">
                <span className="hall-req-name">Purse: {fmt(h.purse)} gold</span>
                <input className="hall-hire-input hall-hire-num" inputMode="numeric" placeholder="Gold" value={gold} onChange={e => setGold(e.target.value)} />
                <button className="btn btn-gold" disabled={busy || !hull.atSlip || !(Number(gold) > 0)}
                    onClick={() => { void onPost('/api/boats/purse/lay', { boat, amount: Number(gold) }, 'The gold could not be laid.'); setGold('') }}>
                    Lay
                </button>
                <button className="btn" disabled={busy || !hull.atSlip || !(Number(gold) > 0) || h.purse < 1}
                    onClick={() => { void onPost('/api/boats/purse/take', { boat, amount: Number(gold) }, 'The gold could not be taken back.'); setGold('') }}>
                    Take back
                </button>
            </div>
            <p className="muted-text hall-note">Materials laid at the slip are used before the builder's own, and are yours to take back until they are built in. Whatever is left comes back to you when the boat is finished.</p>
            {hull.requirements.filter(r => r.exists).map(r => {
                const n = amountOf(r.item)
                return (
                    <div key={r.item} className="hall-hire-row">
                        <span className="hall-req-name">{r.item}: {fmt(r.stocked)} laid</span>
                        <input className="hall-hire-input hall-hire-num" inputMode="numeric" placeholder="How many" value={qty[r.item] ?? ''}
                            onChange={e => setQty(q => ({ ...q, [r.item]: e.target.value }))} />
                        <button className="btn btn-gold" disabled={busy || !hull.atSlip || !(n > 0) || n > r.held}
                            onClick={() => { void onPost('/api/boats/stock/lay', { boat, item: r.item, quantity: n }, 'Those could not be laid.'); setQty(q => ({ ...q, [r.item]: '' })) }}>
                            Lay
                        </button>
                        <button className="btn" disabled={busy || !hull.atSlip || !(n > 0) || n > r.stocked}
                            onClick={() => { void onPost('/api/boats/stock/take', { boat, item: r.item, quantity: n }, 'Those could not be taken back.'); setQty(q => ({ ...q, [r.item]: '' })) }}>
                            Take back
                        </button>
                    </div>
                )
            })}
            {h.laid.filter(l => !hull.requirements.some(r => r.item === l.item)).map(l => (
                <div key={l.item} className="hall-hire-row">
                    <span className="hall-req-name">{l.item}: {fmt(l.quantity)} laid, for a later piece</span>
                    <button className="btn" disabled={busy || !hull.atSlip}
                        onClick={() => onPost('/api/boats/stock/take', { boat, item: l.item, quantity: l.quantity }, 'Those could not be taken back.')}>
                        Take back
                    </button>
                </div>
            ))}
        </div>
    )
}
