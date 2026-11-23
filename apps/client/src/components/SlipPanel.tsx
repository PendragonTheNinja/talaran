import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { onSocket } from '../lib/socket'
import { backdropClose } from '../lib/backdrop'
import { useItemTooltip } from './ItemTooltip'
import ErrorLine from './ErrorLine'
import BuildHireControls from './BuildHireControls'
import BuildRequirementRow from './BuildRequirementRow'
import { NameNewsLines, type VoyageState } from './IsletActions'
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

    const requirementRow = (r: Requirement, onAdd: () => void, blocked: string | null) => (
        <BuildRequirementRow key={r.item} r={r} site="the slip" busy={busy} blocked={blocked} hoverProps={hoverProps} onAdd={onAdd} />
    )

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
                                {voyage && <NameNewsLines news={voyage.nameNews} onSeen={() => setVoyage({ ...voyage, nameNews: [] })} />}
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
                                <BuildHireControls
                                    site="slip"
                                    hire={b.hull.hire}
                                    atSite={b.hull.atSlip}
                                    busy={busy}
                                    intro="Anyone with the Carpentry for this boat and a mallet and saw in hand can build it for you. You choose who, and what they are paid. You can always work on it yourself."
                                    leftover="Whatever is left in the purse or at the slip comes back to you when the boat is finished."
                                    onAct={(op, body, fallback) => post(`/api/boats/${op}`, { boat: b.key, ...body }, fallback)}
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
                                            : ' Unpaid: a favor.'}
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
