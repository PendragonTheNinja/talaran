import { useState } from 'react'
import { getItemIcon, getQualityColor } from '../lib/items'
import { apiFetch } from '../lib/api'
import './LeftPanel.css'
import EquipmentPanel from './EquipmentPanel'

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
  onDropItem: (itemId: number, quantity: number) => void
  dropMode?: boolean
  dropAmount?: number
  tradeMode?: boolean
  tradeId?: number
  onToggleDropMode?: () => void
  onDropAmountChange?: (amount: number) => void
}

export default function LeftPanel({ inventoryData, equipmentData, onEquipmentUpdate, onInventoryUpdate, onDropItem, dropMode, onToggleDropMode, dropAmount, onDropAmountChange, tradeMode, tradeId }: LeftPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: InventoryItem; mode?: 'drop' | 'trade' } | null>(null)
  const [dropQuantity, setDropQuantity] = useState(1)
  const [tradeAmount, setTradeAmount] = useState(1)
  const [showDropQuantity, setShowDropQuantity] = useState(false)

  const INVENTORY_SLOTS = Math.max(16, inventoryData.length)

  const [tooltip, setTooltip] = useState<{ x: number; y: number; item: InventoryItem } | null>(null)

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

  const handleContextMenu = (e: React.MouseEvent, item: InventoryItem) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, item })
    setDropQuantity(1)
    setShowDropQuantity(false)
  }



  return (
    <aside className="left-panel panel">

      {/* Inventory */}
      <div className={`inventory-grid panel-inset ${dropMode ? 'drop-mode-active' : ''} ${tradeMode ? 'trade-mode-active' : ''}`}>        {Array.from({ length: INVENTORY_SLOTS }).map((_, i) => {
        const item = inventoryData[i]
        const qualityColor = item ? getQualityColor(item.quality) : null

        return (
          <div
            key={i}
            className={`inventory-slot ${item ? 'occupied' : ''}`}
            title=""
            style={item && qualityColor ? { borderColor: qualityColor } : {}}
            onClick={() => {
              if (tradeMode && tradeId) {
                const qty = Math.min(tradeAmount, item.quantity)
                apiFetch('/api/trades/offer/item', {
                  method: 'POST',
                  body: JSON.stringify({ tradeId, itemId: item.item_id, quantity: qty }),
                }).catch(err => console.error(err))
                return
              }
              if (dropMode) {
                const qty = Math.min(dropAmount || 1, item.quantity)
                onDropItem(item.item_id, qty)
              } else {
                handleEquip(item)
              }
            }}
            onContextMenu={e => item && handleContextMenu(e, item)}
            onMouseEnter={e => { if (item) setTooltip({ x: e.clientX, y: e.clientY, item }) }}
            onMouseLeave={() => setTooltip(null)}
            onMouseMove={e => { if (item) setTooltip({ x: e.clientX, y: e.clientY, item }) }}
          >
            {item && (
              <>
                <img
                  src={getItemIcon(item.name)}
                  alt={item.name}
                  className="inventory-item-icon"
                  onLoad={e => {
                    e.currentTarget.style.display = ''
                    e.currentTarget.nextElementSibling?.setAttribute('style', 'display: none')
                  }}
                  onError={e => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.removeAttribute('style')
                  }}
                />
                <span className="inventory-item-text" style={{ display: 'none' }}>{item.name.split(' ')[0]}</span>
                {item.quantity > 1 && (
                  <span className="inventory-item-qty">{item.quantity}</span>
                )}
              </>
            )}
          </div>
        )
      })}
      </div>

      <div className="drop-controls">
        <button
          className={`drop-mode-btn ${dropMode ? 'active' : ''}`}
          onClick={() => onToggleDropMode?.()}
          title={dropMode ? 'Drop Mode ON — tap items to drop' : 'Toggle Drop Mode'}
        >
          {dropMode ? '🗑 ON' : '🗑 Drop'}
        </button>
        {dropMode && (
          <label className="drop-amount-label">
            Qty
            <input
              type="number"
              min={1}
              value={dropAmount}
              onChange={e => onDropAmountChange?.(Math.max(1, parseInt(e.target.value) || 1))}
              className="context-menu-qty-input"
              style={{ width: '52px' }}
            />
          </label>
        )}
      </div>

      {error && <div className="equipment-error">{error}</div>}

      <div className="divider" />

      {/* Paper-doll (equipment) — lives under the inventory */}
      <EquipmentPanel
        equipmentData={equipmentData}
        onEquipmentUpdate={onEquipmentUpdate}
        onInventoryUpdate={onInventoryUpdate}
      />

      <div className="divider" />

      {/* Context Menu */}
      {
        contextMenu && (
          <>
            {console.log('contextMenu open, showDropQuantity:', showDropQuantity, 'item qty:', contextMenu.item.quantity)}
            <div
              className="context-menu-overlay"
              onClick={() => { setContextMenu(null); setShowDropQuantity(false) }}
            />
            <div
              className="context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <div className="context-menu-title">{contextMenu.item.name}</div>
              <div className="context-menu-divider" />
              {contextMenu.item.slot && (
                <button className="context-menu-item" onClick={() => {
                  handleEquip(contextMenu.item)
                  setContextMenu(null)
                }}>
                  {equipmentData?.[contextMenu.item.slot as keyof EquipmentData] ? 'Unequip' : 'Equip'}
                </button>
              )}
              <button className="context-menu-item" onClick={() => {
                setShowDropQuantity(true)
                setDropQuantity(1)
              }}>
                Drop
              </button>
              {showDropQuantity && (
                <div className="context-menu-drop-qty">
                  {contextMenu.item.quantity > 1 && (
                    <input
                      type="number"
                      min={1}
                      max={contextMenu.item.quantity}
                      value={dropQuantity}
                      onChange={e => setDropQuantity(Math.min(contextMenu.item.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="context-menu-qty-input"
                      autoFocus
                    />
                  )}
                  <button className="context-menu-item confirm" onClick={() => {
                    if (contextMenu?.mode === 'trade' && tradeId) {
                      apiFetch('/api/trades/offer/item', {
                        method: 'POST',
                        body: JSON.stringify({ tradeId, itemId: contextMenu.item.item_id, quantity: dropQuantity }),
                      }).catch(err => console.error(err))
                    } else {
                      onDropItem(contextMenu!.item.item_id, dropQuantity)
                    }
                    setContextMenu(null)
                    setShowDropQuantity(false)
                  }}>
                    {contextMenu?.mode === 'trade' ? `Add to Trade (${dropQuantity})` : `Confirm Drop ${contextMenu?.item.stackable && contextMenu?.item.quantity > 1 ? `(${dropQuantity})` : ''}`}
                  </button>
                </div>
              )}
              <button className="context-menu-item" onClick={() => setContextMenu(null)}>
                Cancel
              </button>
            </div>
          </>
        )
      }

      {
        tooltip && (
          <div
            className="item-tooltip"
            style={{
              left: Math.min(tooltip.x + 12, window.innerWidth - 220),
              top: Math.min(tooltip.y + 12, window.innerHeight - 150),
            }}
          >
            <p className="item-tooltip-name" style={{ color: getQualityColor(tooltip.item.quality) || 'var(--color-gold-bright)' }}>
              {tooltip.item.name}
            </p>
            {tooltip.item.quality && (
              <p className="item-tooltip-quality">{tooltip.item.quality.charAt(0).toUpperCase() + tooltip.item.quality.slice(1)}</p>
            )}
            <p className="item-tooltip-desc">{tooltip.item.description}</p>
            {tooltip.item.slot && (
              <p className="item-tooltip-hint">Left-click to equip · Right-click for options</p>
            )}
            {!tooltip.item.slot && (
              <p className="item-tooltip-hint">Right-click for options</p>
            )}
          </div>
        )
      }

      {
        tradeMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
            <span className="muted-text" style={{ fontSize: '12px' }}>Trade amount:</span>
            <input
              type="number"
              min={1}
              value={tradeAmount}
              onChange={e => setTradeAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className="context-menu-qty-input"
              style={{ width: '50px', fontSize: '12px', padding: '2px 4px' }}
            />
          </div>
        )
      }

    </aside >
  )
}