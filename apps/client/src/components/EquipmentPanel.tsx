import { useState } from 'react'
import { getItemIcon, getSlotIcon } from '../lib/items'
import { apiFetch } from '../lib/api'
import { useItemTooltip } from './ItemTooltip'

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

/**
 * A player's fighting numbers, worked out on the server from their combat
 * levels and what they wear (services/combat.ts) and sent with the equipment.
 */
export interface CombatProfile {
    weapon: { name: string; form: 'dual' | 'onehand' | 'twohand'; damageType: string; swingSeconds: number } | null
    aim: number | null
    maxHit: number | null
    defence: number
    armour: number
    absorb: number
}

interface EquipmentPanelProps {
    equipmentData: EquipmentData | null
    onEquipmentUpdate: () => void
    onInventoryUpdate: () => void
    /** Current and max HP, from the server. Absent while the player loads. */
    hp?: { current: number; max: number }
    /** Aim, defence, max hit and armour, from the server. Absent while equipment loads. */
    combat?: CombatProfile | null
}

/** How a weapon is held, in the panel's words. */
const FORM_LABEL: Record<string, string> = {
    dual: 'Pair',
    onehand: 'One hand',
    twohand: 'Two hands',
}

function capitalise(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
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

export default function EquipmentPanel({ equipmentData, onEquipmentUpdate, onInventoryUpdate, hp, combat }: EquipmentPanelProps) {
    const [error, setError] = useState<string | null>(null)
    // Item tooltips, shared with the pack.
    const { hoverProps, tooltipEl } = useItemTooltip()

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

                Health is live: max from Constitution, current from what the
                player has not yet healed, both from the server. Talar is not
                implemented, so its bar is still a placeholder. */}
            <div className="doll-row">
                <div className="vital-bar hp">
                    <span className="vital-readout">{hp ? `Health ${hp.current} / ${hp.max}` : 'Health'}</span>
                    <div className="vital-track">
                        <div className="vital-fill health" style={{ height: `${hp && hp.max > 0 ? Math.round(100 * hp.current / hp.max) : 100}%` }} />
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
                            title={equipped ? undefined : label}
                            {...hoverProps(equipped, 'Left-click to unequip')}
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

            {/* Every number here comes from the server (services/combat.ts):
                weapon and armour from the item rows, the level terms from
                Melee and Defense. A dash means no weapon in hand. */}
            <div className="combat-stats panel-inset">
                <div className="panel-title">Combat Stats</div>
                <div className="stat-row">
                    <span>Weapon</span>
                    <span>{combat?.weapon
                        ? `${FORM_LABEL[combat.weapon.form] ?? combat.weapon.form}, ${capitalise(combat.weapon.damageType)}, ${combat.weapon.swingSeconds}s`
                        : 'None'}</span>
                </div>
                <div className="stat-row"><span>Aim</span><span>{combat?.aim ?? '-'}</span></div>
                <div className="stat-row"><span>Max hit</span><span>{combat?.maxHit ?? '-'}</span></div>
                <div className="stat-row"><span>Defence</span><span>{combat?.defence ?? '-'}</span></div>
                <div className="stat-row">
                    <span>Armour</span>
                    <span>{combat ? `${combat.armour} (stops ${combat.absorb} a hit)` : '-'}</span>
                </div>
            </div>
            {tooltipEl}
        </div>
    )
}