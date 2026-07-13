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
    { key: 'neck', label: 'Neck', x: 25, y: 16 },
    { key: 'head', label: 'Head', x: 50, y: 16 },
    { key: 'back', label: 'Back', x: 75, y: 16 },
    { key: 'mainhand', label: 'Main Hand', x: 25, y: 38 },
    { key: 'chest', label: 'Chest', x: 50, y: 38 },
    { key: 'offhand', label: 'Off Hand', x: 75, y: 38 },
    { key: 'finger', label: 'Finger', x: 25, y: 60 },
    { key: 'legs', label: 'Legs', x: 50, y: 60 },
    { key: 'hands', label: 'Hands', x: 75, y: 60 },
    { key: 'mount', label: 'Mount', x: 25, y: 82 },
    { key: 'feet', label: 'Feet', x: 50, y: 82 },
    { key: 'trophy', label: 'Trophy', x: 75, y: 82 },
]

export default function EquipmentPanel({ equipmentData, onEquipmentUpdate, onInventoryUpdate }: EquipmentPanelProps) {
    const [error, setError] = useState<string | null>(null)

    const handleUnequip = async (slot: string) => {
        try {
            await apiFetch('/api/equipment/unequip', {
                method: 'POST',
                body: JSON.stringify({ slot }),
            })
            onEquipmentUpdate()
            onInventoryUpdate()
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

            <div className="paper-doll">
                {SLOTS.map(({ key, label, x, y }) => {
                    const equipped = equipmentData?.[key as keyof EquipmentData]

                    return (
                        <div
                            key={key}
                            className={`paper-doll-slot ${equipped ? 'occupied' : 'empty'}`}
                            style={{ left: `${x}%`, top: `${y}%` }}
                            title={equipped ? `${equipped.name}\nClick to unequip` : label}
                            onClick={() => equipped && handleUnequip(key)}
                        >
                            {equipped ? (
                                <img
                                    src={getItemIcon(equipped.name)}
                                    alt={equipped.name}
                                    className="paper-doll-item-icon"
                                />
                            ) : (
                                <span className="paper-doll-slot-label">{label}</span>
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