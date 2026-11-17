import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import { backdropClose } from '../lib/backdrop'
import { useItemTooltip } from './ItemTooltip'
import ErrorLine from './ErrorLine'
import type { VoyageState } from './IsletActions'
import './TavernPanel.css'
import './GuildHallTab.css'

// The slip (server services/boats.ts): lay a hull, then set its pieces in
// order, 1 to 5 of a material every 20 seconds. Everything allowed or refused
// is the server's call; this only draws what it is sent.

interface Requirement { item: string; needed: number; delivered: number; exists: boolean; held: number }
interface Hull {
    locationName: string
    atSlip: boolean
    pieceNumber: number
    pieceCount: number
    pieceName: string | null
    piecesDone: string[]
    requirements: Requirement[]
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
interface State { locationName: string | null; hasSlip: boolean; carpentryLevel: number; boats: Boat[] }

const fmt = (n: number) => n.toLocaleString('en-US')
const percent = (n: number, of: number) => `${Math.min(100, (n / Math.max(1, of)) * 100).toFixed(1)}%`

export default function SlipPanel({ onClose, onStartBuild, onPutToSea }: {
    onClose: () => void
    /** Put to sea in this boat (GameLayout's handleVoyage). */
    onPutToSea: (boat: string) => void
    /** Start setting `item` into the hull of `boat` (GameView's vessel_build). */
    onStartBuild: (boat: string, item: string) => void
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

    useEffect(() => {
        void apiFetch<VoyageState>('/api/voyages').then(setVoyage).catch(() => setVoyage(null))
        void apiFetch<State>('/api/boats')
            .then(setState)
            .catch(err => setError((err as { message?: string }).message || 'The slip could not be read.'))
    }, [])

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
                                    Needs Carpentry {b.buildLevel}, and a mallet and saw in hand. Built in {b.materials.length} pieces:{' '}
                                    {b.materials.map(p => `${p.name.toLowerCase()} (${p.materials.map(m => `${fmt(m.qty)} ${m.item}`).join(', ')})`).join('; ')}.
                                </p>
                                <button
                                    className="btn btn-gold"
                                    disabled={busy || !b.canBuild || !state.hasSlip}
                                    onClick={() => layKeel(b.key)}
                                >
                                    {b.canBuild ? `Lay the keel of a ${b.name}` : `Needs Carpentry ${b.buildLevel}`}
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
                                {b.hull.requirements.map(r => {
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
                                                    {fmt(r.delivered)} of {fmt(r.needed)}
                                                    {r.exists ? ` · you carry ${fmt(r.held)}` : ' · no one in Talaran can make these yet'}
                                                </span>
                                            </div>
                                            <button
                                                className="btn btn-gold hall-req-btn"
                                                disabled={busy || done || !r.exists || r.held < 1}
                                                onClick={() => { onStartBuild(b.key, r.item); onClose() }}
                                            >
                                                {done ? 'Done' : !r.exists ? 'Not made yet' : `Add ${r.item}`}
                                            </button>
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                ))}
                {tooltipEl}
            </div>
        </div>
    )
}
