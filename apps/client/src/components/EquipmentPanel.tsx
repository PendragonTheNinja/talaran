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

            <div className="stat-bars">
                <div className="stat-bar-wrapper">
                    <div className="stat-bar-label">
                        <span>Health</span>
                        <span>100 / 100</span>
                    </div>
                    <div className="stat-bar-track">
                        <div className="stat-bar-fill health" style={{ width: '100%' }} />
                    </div>
                </div>
                <div className="stat-bar-wrapper">
                    <div className="stat-bar-label">
                        <span>Mana</span>
                        <span>50 / 50</span>
                    </div>
                    <div className="stat-bar-track">
                        <div className="stat-bar-fill mana" style={{ width: '100%' }} />
                    </div>
                </div>
            </div>

            <div className="divider" />

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