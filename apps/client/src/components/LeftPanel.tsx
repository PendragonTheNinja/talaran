import { useState } from 'react'
import { getItemIcon, getSlotIcon, getQualityColor } from '../lib/items'
import { apiFetch } from '../lib/api'
import './LeftPanel.css'

interface InventoryItem {
  id: number
  item_id: number
  name: string
  type: string
  subtype: string | null
  quality: string | null
  tier: number
  description: string
  stackable: boolean
  quantity: number
  slot?: string
}

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

interface LeftPanelProps {
  inventoryData: InventoryItem[]
  equipmentData: EquipmentData | null
  onEquipmentUpdate: () => void
  onInventoryUpdate: () => void
}

const SLOTS = [
  { key: 'neck',     label: 'Neck' },
  { key: 'head',     label: 'Head' },
  { key: 'back',     label: 'Back' },
  { key: 'mainhand', label: 'Main Hand' },
  { key: 'chest',    label: 'Chest' },
  { key: 'offhand',  label: 'Off Hand' },
  { key: 'finger',   label: 'Finger' },
  { key: 'legs',     label: 'Legs' },
  { key: 'hands',    label: 'Hands' },
  { key: 'mount',    label: 'Mount' },
  { key: 'feet',     label: 'Feet' },
  { key: 'trophy',   label: 'Trophy' },
]

export default function LeftPanel({ inventoryData, equipmentData, onEquipmentUpdate, onInventoryUpdate }: LeftPanelProps) {
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const INVENTORY_SLOTS = Math.max(16, inventoryData.length)

  const handleEquip = async (item: InventoryItem) => {
    if (!item.slot) {
      setError('This item cannot be equipped')
      setTimeout(() => setError(null), 3000)
      return
    }

    try {
      await apiFetch('/api/equipment/equip', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.item_id }),
      })
      onEquipmentUpdate()
      onInventoryUpdate()
    } catch (err: any) {
      setError(err.message || 'Could not equip item')
      setTimeout(() => setError(null), 3000)
    }
  }

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
    <aside className="left-panel panel">

      {/* Inventory */}
      <div className="panel-title">Inventory</div>
      <div className="inventory-grid panel-inset">
        {Array.from({ length: INVENTORY_SLOTS }).map((_, i) => {
          const item = inventoryData[i]
          const icon = item ? getItemIcon(item.name) : null
          const qualityColor = item ? getQualityColor(item.quality) : null

          return (
            <div
              key={i}
              className={`inventory-slot ${item ? 'occupied' : ''}`}
              title={item ? `${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ''}\n${item.description}${item.slot ? '\nClick to equip' : ''}` : ''}
              style={item && qualityColor ? { borderColor: qualityColor } : {}}
              onClick={() => item && handleEquip(item)}
            >
              {item && (
                <>
                  {icon ? (
                    <img src={icon} alt={item.name} className="inventory-item-icon" />
                  ) : (
                    <span className="inventory-item-text">{item.name.split(' ')[0]}</span>
                  )}
                  {item.quantity > 1 && (
                    <span className="inventory-item-qty">{item.quantity}</span>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="equipment-error">{error}</div>
      )}

      <div className="divider" />

      {/* Equipment / Paper Doll */}
      <div className="panel-title">Equipment</div>
      <div className="equipment-grid">
        {SLOTS.map(({ key, label }) => {
          const equipped = equipmentData?.[key as keyof EquipmentData]
          const slotIcon = getSlotIcon(key)
          const itemIcon = equipped ? getItemIcon(equipped.name) : null

          return (
            <div
              key={key}
              className={`equipment-slot panel-inset ${equipped ? 'occupied' : ''}`}
              title={equipped ? `${equipped.name}\nClick to unequip` : label}
              onClick={() => equipped && handleUnequip(key)}
            >
              {equipped ? (
                itemIcon ? (
                  <img src={itemIcon} alt={equipped.name} className="equipment-item-icon" />
                ) : (
                  <span className="equipment-item-text">{equipped.name.split(' ')[0]}</span>
                )
              ) : (
                <img src={slotIcon} alt={label} className="equipment-slot-icon" />
              )}
            </div>
          )
        })}
      </div>

      <div className="divider" />

      {/* Combat stats */}
      <div className="combat-stats panel-inset">
        <div className="panel-title">Combat Stats</div>
        <div className="stat-row">
          <span>Armor</span><span>0</span>
        </div>
        <div className="stat-row">
          <span>Accuracy</span><span>0</span>
        </div>
        <div className="stat-row">
          <span>Power</span><span>0</span>
        </div>
      </div>

      <div className="divider" />

      {/* Health & Mana */}
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

    </aside>
  )
}