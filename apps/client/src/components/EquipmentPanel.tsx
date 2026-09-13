import { useState } from 'react'
import { getItemIcon, getSlotIcon } from '../lib/items'
import { apiFetch } from '../lib/api'

interface EquipmentData {
    head: any | null
    neck: any | null
    back: any | null
    chest: any | null
    mainhand: any | null
    offhand: any | null
    legs: any | null
    hands: any | null
    feet: any | null
    finger: any | null
    mount: any | null
    trophy: any | null
}

interface EquipmentPanelProps {
    equipmentData: EquipmentData | null
    onEquipmentUpdate: () => void
    onInventoryUpdate: () => void
}

const SLOTS = [
    { key: 'neck', label: 'Neck' },
    { key: 'head', label: 'Head' },
    { key: 'back', label: 'Back' },
    { key: 'mainhand', label: 'Main Hand' },
    { key: 'chest', label: 'Chest' },
    { key: 'offhand', label: 'Off Hand' },
    { key: 'finger', label: 'Finger' },
    { key: 'legs', label: 'Legs' },
    { key: 'hands', label: 'Hands' },
    { key: 'mount', label: 'Mount' },
    { key: 'feet', label: 'Feet' },
    { key: 'trophy', label: 'Trophy' },
]

export default function EquipmentPanel({ equipmentData, onEquipmentUpdate, onInventoryUpdate }: EquipmentPanelProps) {
    const [error, setError] = useState<string | null>(null)

    const handleUnequip = async (slot: string) => {
        try {
            // Awaited and ordered, for the same reason as equipping: two
            // un-awaited refreshes can resolve out of order and leave the panel
            // and the pack disagreeing about where an item is.
            await apiFetch('/api/equipment/unequip', {
                method: 'POST',
                body: JSON.stringify({ slot }),
            })
            await onEquipmentUpdate()
            await onInventoryUpdate()
        } catch (err: any) {
            setError(err.message || 'Could not unequip item')
            setTimeout(() => setError(null), 3000)
        }
    }

    return (
        <div className="equipment-panel">
            {error && <div className="equipment-error">{error}</div>}

            {/* Bars flank the doll rather than stacking above it. Two full-width
                bars cost more vertical space than the doll itself, and the panel
                is the tightest column in the layout.

                Both are still placeholders: there is no health column on players
                and Talar is not implemented, so these read 100/100 and 50/50
                until combat lands. The shape is here so wiring them later is a
                value change rather than a layout change. */}
            <div className="doll-row">
                <div className="vital-bar hp">
                    <span className="vital-readout">Health 100 / 100</span>
                    <div className="vital-track">
                        <div className="vital-fill health" style={{ height: '100%' }} />
                    </div>
                    <span className="vital-label">HP</span>
                </div>

                <div className="equipment-grid">
                {SLOTS.map(({ key, label }) => {
                    const equipped = equipmentData?.[key as keyof EquipmentData]
                    const slotIcon = getSlotIcon(key)

                    return (
                        <div
                            key={key}
                            className={`equipment-slot panel-inset ${equipped ? 'occupied' : ''}`}
                            title={equipped ? `${equipped.name}\nClick to unequip` : label}
                            onClick={() => equipped && handleUnequip(key)}
                        >
                            {equipped ? (
                                <>
                                    <img
                                        src={getItemIcon(equipped.name)}
                                        alt={equipped.name}
                                        className="equipment-item-icon"
                                        onError={e => {
                                            e.currentTarget.style.display = 'none'
                                            e.currentTarget.nextElementSibling?.removeAttribute('style')
                                        }}
                                    />
                                    <span className="equipment-item-text" style={{ display: 'none' }}>{equipped.name.split(' ')[0]}</span>
                                </>
                            ) : (
                                <img src={slotIcon} alt={label} className="equipment-slot-icon" />
                            )}
                        </div>
                    )
                })}
                </div>

                <div className="vital-bar tal">
                    <span className="vital-readout">Talar 50 / 50</span>
                    <div className="vital-track">
                        <div className="vital-fill mana" style={{ height: '100%' }} />
                    </div>
                    <span className="vital-label">TAL</span>
                </div>
            </div>

            <div className="divider" />

            <div className="combat-stats panel-inset">
                <div className="panel-title">Combat Stats</div>
                <div className="stat-row"><span>Armor</span><span>0</span></div>
                <div className="stat-row"><span>Accuracy</span><span>0</span></div>
                <div className="stat-row"><span>Power</span><span>0</span></div>
            </div>
        </div>
    )
}