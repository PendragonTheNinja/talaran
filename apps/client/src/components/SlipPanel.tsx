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
interface Hire {
    rate: number; purse: number; hands: string[]; laid: { item: string; quantity: number }[]
    /** Per material: still wanted across every piece left, laid here, and room for more (server stillWanted). */
    materials: { item: string; wanted: number; laid: number; room: number }[]
}
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
                                            ? ` Pays ${fmt(j.hull.hire.rate)} gold for each piece you set in, from a purse of ${fmt(j.hull.hire.purse)}: enough for ${fmt(Math.floor(j.hull.hire.purse / j.hull.hire.rate))} more.`
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
 * The owner's side of building for hire (docs/antura-plan.md §6b), in the
 * order a player thinks of it: who may build, what a piece pays, the purse
 * that pays it, and materials left for them (Nathan, 2026-11-20: the first
 * version read as one block of controls).
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
    const piecesPaid = h.rate > 0 ? Math.floor(h.purse / h.rate) : null

    return (
        <div className="hall-hire">
            <p className="tavern-section">Hire Carpenters</p>
            <p className="muted-text hall-note">
                Anyone with the Carpentry for this boat and a mallet and saw in hand can build it for you. You choose who, and what they are paid.
            </p>

            <p className="hall-hire-step">1. Who may work on it</p>
            <div className="hall-hire-row">
                {h.hands.length ? h.hands.map(n => (
                    <button key={n} className="btn hall-hire-chip" disabled={busy} title={`Stop ${n} working on it`}
                        onClick={() => onPost('/api/boats/hands/remove', { boat, name: n }, 'That carpenter could not be let go.')}>
                        {n} ✕
                    </button>
                )) : <span className="muted-text">Nobody yet. You can always work on it yourself.</span>}
            </div>
            <div className="hall-hire-row">
                <input className="hall-hire-input" placeholder="A carpenter's name" value={hand} maxLength={32}
                    onChange={e => setHand(e.target.value)} />
                <button className="btn btn-gold" disabled={busy || !hand.trim()}
                    onClick={() => { void onPost('/api/boats/hands', { boat, name: hand.trim() }, 'That carpenter could not be added.'); setHand('') }}>
                    Add
                </button>
            </div>

            <p className="hall-hire-step">2. What a piece pays</p>
            <div className="hall-hire-row">
                <input className="hall-hire-input hall-hire-num" inputMode="numeric" value={rate} onChange={e => setRate(e.target.value)} />
                <span className="muted-text">gold for each piece a carpenter sets in</span>
                <button className="btn btn-gold" disabled={busy || String(h.rate) === rate.trim()}
                    onClick={() => onPost('/api/boats/rate', { boat, rate: Number(rate) }, 'The pay could not be set.')}>
                    Set
                </button>
            </div>
            <p className="muted-text hall-note">
                {h.rate > 0 ? `Now ${fmt(h.rate)} gold a piece.` : 'Now nothing: carpenters work on it as a favour.'}
            </p>

            <p className="hall-hire-step">3. The purse</p>
            <p className="muted-text hall-note">
                {`It holds ${fmt(h.purse)} gold`}
                {piecesPaid !== null ? `, enough for ${fmt(piecesPaid)} more ${piecesPaid === 1 ? 'piece' : 'pieces'}.` : '.'}
                {' '}Each piece is paid from it the moment it goes in. When it cannot pay for the next piece, the carpenter stops.
            </p>
            <div className="hall-hire-row">
                <input className="hall-hire-input hall-hire-num" inputMode="numeric" placeholder="Gold" value={gold} onChange={e => setGold(e.target.value)} />
                <button className="btn btn-gold" disabled={busy || !hull.atSlip || !(Number(gold) > 0)}
                    onClick={() => { void onPost('/api/boats/purse/lay', { boat, amount: Number(gold) }, 'The gold could not be put in.'); setGold('') }}>
                    Put in
                </button>
                <button className="btn" disabled={busy || !hull.atSlip || !(Number(gold) > 0) || h.purse < 1}
                    onClick={() => { void onPost('/api/boats/purse/take', { boat, amount: Number(gold) }, 'The gold could not be taken out.'); setGold('') }}>
                    Take out
                </button>
            </div>

            <p className="hall-hire-step">4. Materials at the slip</p>
            <p className="muted-text hall-note">Carpenters use these before their own. Only what the boat still needs can be left here.</p>
            {h.materials.map(m => {
                const n = amountOf(m.item)
                return (
                    <div key={m.item} className="hall-hire-row">
                        <span className="hall-req-name">
                            {m.item}: {fmt(m.laid)} here{m.room > 0 ? `, room for ${fmt(m.room)} more` : ', all it needs'}
                        </span>
                        <input className="hall-hire-input hall-hire-num" inputMode="numeric" placeholder="How many" value={qty[m.item] ?? ''}
                            onChange={e => setQty(q => ({ ...q, [m.item]: e.target.value }))} />
                        <button className="btn btn-gold" disabled={busy || !hull.atSlip || !(n > 0) || n > m.room}
                            onClick={() => { void onPost('/api/boats/stock/lay', { boat, item: m.item, quantity: n }, 'Those could not be left here.'); setQty(q => ({ ...q, [m.item]: '' })) }}>
                            Leave
                        </button>
                        <button className="btn" disabled={busy || !hull.atSlip || !(n > 0) || n > m.laid}
                            onClick={() => { void onPost('/api/boats/stock/take', { boat, item: m.item, quantity: n }, 'Those could not be taken back.'); setQty(q => ({ ...q, [m.item]: '' })) }}>
                            Take back
                        </button>
                    </div>
                )
            })}
            <p className="muted-text hall-note">Whatever is left in the purse or at the slip comes back to you when the boat is finished.</p>
        </div>
    )
}
