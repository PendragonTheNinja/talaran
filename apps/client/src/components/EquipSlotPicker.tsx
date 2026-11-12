import { getItemIcon } from '../lib/items'
import { backdropClose } from '../lib/backdrop'
import './EquipSlotPicker.css'

export interface PickableItem {
    item_id: number
    name: string
    quantity: number
    slot?: string
    level_required?: number | null
    synthetic?: boolean
    iconName?: string
}

/**
 * What in the pack can go in one equipment slot, opened by holding (or
 * right-clicking) the slot (Nathan and the forum, 2026-11-11). Tap an item to
 * wear it; the server still decides (level, hands, the swap). Framed like the
 * spellbook (farm-modal), so every theme already dresses it.
 */
export default function EquipSlotPicker({ label, slot, items, equipped, busy, onEquip, onTakeOff, onClose }: {
    label: string
    slot: string
    items: PickableItem[]
    equipped: { name: string } | null
    busy: boolean
    onEquip: (item: PickableItem) => void
    onTakeOff: () => void
    onClose: () => void
}) {
    const fits = items.filter(i => !i.synthetic && i.slot === slot)
    return (
        <div className="farm-overlay" {...backdropClose(onClose)}>
            <div className="farm-modal equip-picker" onClick={e => e.stopPropagation()}>
                <div className="farm-header">
                    <h2>{label}</h2>
                    <button className="farm-close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="equip-picker-worn">
                    {equipped ? (
                        <>
                            <span>Wearing <span className="gold-text">{equipped.name}</span></span>
                            <button className="farm-btn" disabled={busy} onClick={onTakeOff}>Take off</button>
                        </>
                    ) : (
                        <span className="muted-text">Nothing worn here.</span>
                    )}
                </div>

                {fits.length === 0 ? (
                    <p className="farm-note">Nothing in your pack fits here.</p>
                ) : (
                    <div className="equip-picker-grid">
                        {fits.map(item => (
                            <button
                                key={item.item_id}
                                className="inventory-slot occupied equip-picker-item"
                                disabled={busy}
                                onClick={() => onEquip(item)}
                                title={item.level_required && item.level_required > 1
                                    ? `${item.name} (level ${item.level_required})` : item.name}
                            >
                                <img
                                    src={getItemIcon(item.iconName || item.name)}
                                    alt={item.name}
                                    className="inventory-item-icon"
                                    onError={e => {
                                        e.currentTarget.style.display = 'none'
                                        e.currentTarget.nextElementSibling?.removeAttribute('style')
                                    }}
                                />
                                <span className="inventory-item-text" style={{ display: 'none' }}>{item.name.split(' ')[0]}</span>
                                {item.quantity > 1 && <span className="inventory-item-qty">{item.quantity}</span>}
                                <span className="equip-picker-name">{item.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
