import { useEffect, useState } from 'react'
import { getItemIcon } from '../lib/items'
import { apiFetch } from '../lib/api'
import './WorkstationPanel.css'

interface EligibleItem {
    itemId: number
    itemName: string
    tier: number
    quantity: number
}

interface FilledTool {
    index: number
    itemName: string
    tier: number
}

interface StationSlot {
    slot: string
    label: string
    capacity: number
    isRequired: boolean
    filled: FilledTool[]
    eligible: EligibleItem[]
}

interface StationData {
    exists: boolean
    stationId: number | null
    type: string
    slots: StationSlot[]
    isActive: boolean
    missingRequired: string[]
}

interface WorkstationPanelProps {
    stationType: string
    title: string
    onClose: () => void
    onInventoryUpdate: () => void
}

/**
 * The workstation paper doll. Same shape as the player's equipment panel: slots
 * on the left, click a slot to see what in your pack fits it, click an item to
 * fit it in.
 *
 * Both mutations answer with the whole station, so nothing here re-fetches it
 * separately. Two un-awaited refreshes can resolve out of order and paint a
 * slot as it was a moment ago, which is the bug the equipment panel already
 * learned the hard way.
 */
export default function WorkstationPanel({ stationType, title, onClose, onInventoryUpdate }: WorkstationPanelProps) {
    const [station, setStation] = useState<StationData | null>(null)
    const [openSlot, setOpenSlot] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loadFailed, setLoadFailed] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const flash = (msg: string) => {
        setError(msg)
        setTimeout(() => setError(null), 3000)
    }

    const load = async () => {
        try {
            setLoadFailed(null)
            const data = await apiFetch<StationData>(`/api/workstations/${stationType}`)
            setStation(data)
        } catch (err: any) {
            // A failure here used to leave the panel showing its loading line
            // forever, which is indistinguishable from a slow request and hides
            // the actual cause (an unregistered route answers 404).
            setLoadFailed(err.message || 'Could not load the workstation.')
        }
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stationType])

    const handleSocket = async (slot: string, itemName: string) => {
        if (busy) return
        setBusy(true)
        try {
            const res = await apiFetch<{ station: StationData }>(`/api/workstations/${stationType}/socket`, {
                method: 'POST',
                body: JSON.stringify({ slot, itemName }),
            })
            setStation(res.station)
            setOpenSlot(null)
            await onInventoryUpdate()
        } catch (err: any) {
            flash(err.message || 'Could not fit that')
        } finally {
            setBusy(false)
        }
    }

    const handleUnsocket = async (slot: string, slotIndex: number) => {
        if (busy) return
        setBusy(true)
        try {
            const res = await apiFetch<{ station: StationData }>(`/api/workstations/${stationType}/unsocket`, {
                method: 'POST',
                body: JSON.stringify({ slot, slotIndex }),
            })
            setStation(res.station)
            await onInventoryUpdate()
        } catch (err: any) {
            flash(err.message || 'Could not remove that')
        } finally {
            setBusy(false)
        }
    }

    if (!station) {
        return (
            <div className="workstation-overlay" onClick={onClose}>
                <div className="workstation-panel" onClick={e => e.stopPropagation()}>
                    <div className="workstation-header">
                        <h3>{title}</h3>
                        <button className="workstation-close" onClick={onClose}>✕</button>
                    </div>
                    {loadFailed ? (
                        <>
                            <div className="error-message">{loadFailed}</div>
                            <button className="workstation-retry" onClick={load}>Try again</button>
                        </>
                    ) : (
                        <p className="muted">Looking over the bench...</p>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="workstation-overlay" onClick={onClose}>
        <div className="workstation-panel" onClick={e => e.stopPropagation()}>
            <div className="workstation-header">
                <h3>{title}</h3>
                <button className="workstation-close" onClick={onClose}>✕</button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="workstation-grid">
                {station.slots.map(slot => {
                    const hasRoom = slot.filled.length < slot.capacity
                    // A repeated slot (the apiary's flowers) shows one cell per
                    // unit of capacity; a tool slot is a single cell.
                    const cells: Array<FilledTool | null> = []
                    for (let i = 0; i < slot.capacity; i++) {
                        cells.push(slot.filled.find(f => f.index === i) ?? null)
                    }

                    return cells.map((tool, i) => (
                        <button
                            key={`${slot.slot}-${i}`}
                            className={`workstation-cell${tool ? ' occupied' : ''}${slot.isRequired ? ' required' : ''}`}
                            title={tool
                                ? `${tool.itemName} (tier ${tool.tier})\nClick to take it back`
                                : `${slot.label}\nClick to fit a tool`}
                            disabled={busy || (!tool && !hasRoom)}
                            onClick={() => tool
                                ? handleUnsocket(slot.slot, tool.index)
                                : setOpenSlot(openSlot === slot.slot ? null : slot.slot)}
                        >
                            {tool ? (
                                <>
                                    <img
                                        src={getItemIcon(tool.itemName)}
                                        alt={tool.itemName}
                                        className="workstation-cell-icon"
                                        onError={e => {
                                            e.currentTarget.style.display = 'none'
                                            e.currentTarget.nextElementSibling?.removeAttribute('style')
                                        }}
                                    />
                                    <span className="workstation-cell-text" style={{ display: 'none' }}>
                                        {tool.itemName.split(' ')[0]}
                                    </span>
                                </>
                            ) : (
                                <span className="workstation-cell-label">{slot.label}</span>
                            )}
                        </button>
                    ))
                })}
            </div>

            {openSlot && (() => {
                const slot = station.slots.find(s => s.slot === openSlot)
                if (!slot) return null
                return (
                    <div className="workstation-picker">
                        <div className="workstation-picker-title">Fit into {slot.label.toLowerCase()}</div>
                        {slot.eligible.length === 0 ? (
                            <p className="muted">Nothing in your pack fits here.</p>
                        ) : (
                            slot.eligible.map(item => (
                                <button
                                    key={item.itemId}
                                    className="workstation-pick"
                                    onClick={() => handleSocket(slot.slot, item.itemName)}
                                    disabled={busy}
                                >
                                    <img
                                        src={getItemIcon(item.itemName)}
                                        alt={item.itemName}
                                        className="workstation-pick-icon"
                                        onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                                    />
                                    <span className="tool-name">{item.itemName}</span>
                                    <span className="tool-tier">tier {item.tier}</span>
                                    {item.quantity > 1 && <span className="tool-qty">x{item.quantity}</span>}
                                </button>
                            ))
                        )}
                    </div>
                )
            })()}

            <p className="workstation-hint">
                Better tools work faster. Tools of the same tier as the job run at full speed,
                and a tool more than two tiers behind the work will not manage it at all.
            </p>
        </div>
        </div>
    )
}
