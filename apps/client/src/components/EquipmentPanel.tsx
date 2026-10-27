import { useEffect, useState } from 'react'
import type { Hp } from '../lib/combat'
import type { Talar } from '../lib/talar'
import SpellList from './SpellList'
import './FarmPanel.css'
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
    /** The main-hand weapon, or bare hands (`unarmed`) when it holds none. */
    weapon: { name: string; form: 'dual' | 'onehand' | 'twohand'; damageType: string; swingSeconds: number; unarmed: boolean }
    aim: number
    maxHit: number
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
    /** The reservoir, from the server (services/talar.ts). */
    talar?: Talar
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

export default function EquipmentPanel({ equipmentData, onEquipmentUpdate, onInventoryUpdate, hp, talar, combat }: EquipmentPanelProps) {
    const [error, setError] = useState<string | null>(null)
    // Mid-fight HP, announced by GameView as each swing lands (lib/combat.ts
    // announceHp), so the bar keeps up without refetching the whole player.
    // A fresh `hp` from the server takes over again when it arrives.
    const [liveHp, setLiveHp] = useState<{ hp: Hp; over: Hp | undefined } | null>(null)
    useEffect(() => {
        const onHp = (e: Event) => {
            const detail = (e as CustomEvent<Hp>).detail
            if (detail) setLiveHp({ hp: detail, over: hp })
        }
        window.addEventListener('talaran:hp', onHp)
        return () => window.removeEventListener('talaran:hp', onHp)
    }, [hp])
    const shownHp = liveHp && liveHp.over === hp ? liveHp.hp : hp

    // The reservoir the same way: a pushed change shows at once, and a fresh
    // figure from the server takes over again when it arrives.
    const [liveTalar, setLiveTalar] = useState<{ talar: Talar; over: Talar | undefined } | null>(null)
    useEffect(() => {
        const onTalar = (e: Event) => {
            const detail = (e as CustomEvent<Talar>).detail
            if (detail) setLiveTalar({ talar: detail, over: talar })
        }
        window.addEventListener('talaran:talar', onTalar)
        return () => window.removeEventListener('talaran:talar', onTalar)
    }, [talar])
    const shownTalar = liveTalar && liveTalar.over === talar ? liveTalar.talar : talar

    // The spellbook opens from the Talar bar: what you know, ready to cast.
    const [spellbookOpen, setSpellbookOpen] = useState(false)
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
                    <span className="vital-readout">{shownHp ? `Health ${shownHp.current} / ${shownHp.max}` : 'Health'}</span>
                    <div className="vital-track">
                        <div className="vital-fill health" style={{ height: `${shownHp && shownHp.max > 0 ? Math.round(100 * shownHp.current / shownHp.max) : 100}%` }} />
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

                <div className="vital-bar tal" style={{ cursor: 'pointer' }} onClick={() => setSpellbookOpen(true)} title="Your spellbook">
                    <span className="vital-readout">{shownTalar ? `Talar ${shownTalar.current} / ${shownTalar.max}` : 'Talar'}</span>
                    <div className="vital-track">
                        <div className="vital-fill mana" style={{ height: `${shownTalar && shownTalar.max > 0 ? Math.round(100 * shownTalar.current / shownTalar.max) : 0}%` }} />
                    </div>
                    <span className="vital-label">TAL</span>
                </div>
            </div>

            {spellbookOpen && (
                <div className="farm-overlay" onClick={() => setSpellbookOpen(false)}>
                    <div className="farm-modal" onClick={e => e.stopPropagation()}>
                        <div className="farm-header">
                            <h2>Spellbook</h2>
                            <button className="farm-close" onClick={() => setSpellbookOpen(false)}>✕</button>
                        </div>
                        <SpellList mode="cast" />
                    </div>
                </div>
            )}

            <div className="divider" />

            {/* Every number here comes from the server (services/combat.ts):
                weapon and armour from the item rows, the level terms from
                Melee and Defense. With no weapon in hand you fight with
                your fists, and the server says so. */}
            <div className="combat-stats panel-inset">
                <div className="panel-title">Combat Stats</div>
                <div className="cstat-body">
                    <div className="cstat-weapon" title="What you fight with: how it is held, the kind of blow it lands, and how often it swings">
                        {combat ? (
                            <>
                                <span className="cstat-chip">{combat.weapon.unarmed ? 'Fists' : FORM_LABEL[combat.weapon.form] ?? combat.weapon.form}</span>
                                <span className="cstat-chip">{capitalise(combat.weapon.damageType)}</span>
                                <span className="cstat-chip tabular-num">{combat.weapon.swingSeconds}s</span>
                            </>
                        ) : <span className="cstat-chip">-</span>}
                    </div>
                    <div className="cstat-grid">
                        <div className="cstat-tile" title="How often your blows land">
                            <span className="cstat-label">Aim</span>
                            <span className="cstat-value tabular-num">{combat?.aim ?? '-'}</span>
                        </div>
                        <div className="cstat-tile" title="Your hardest blow">
                            <span className="cstat-label">Max hit</span>
                            <span className="cstat-value tabular-num">{combat?.maxHit ?? '-'}</span>
                        </div>
                        {/* Defence is how hard you are to hit: your Defense level plus
                            the armour you wear. Armour also softens the blows
                            that do land, which is what Absorbs counts. One
                            armour total feeds both, so it is shown as the part
                            of each rather than as a third number. */}
                        <div className="cstat-tile" title="How hard you are to hit: your Defense level, plus the armour you wear">
                            <span className="cstat-label">Defence</span>
                            <span className="cstat-value tabular-num">{combat?.defence ?? '-'}</span>
                            {combat && <span className="cstat-sub tabular-num">{combat.armour} from armour</span>}
                        </div>
                        <div className="cstat-tile" title="Taken off every blow that does land, by the armour you wear">
                            <span className="cstat-label">Absorbs</span>
                            <span className="cstat-value tabular-num">{combat?.absorb ?? '-'}</span>
                            {combat && <span className="cstat-sub">a hit</span>}
                        </div>
                    </div>
                </div>
            </div>
            {tooltipEl}
        </div>
    )
}