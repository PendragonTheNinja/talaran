import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
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
  quantity: number
  slot?: string
  /** Open liquid containers are not real inventory rows — see routes/inventory. */
  synthetic?: boolean
  capacity?: number
  iconName?: string
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
  storeMode?: boolean
  storeAmount?: number
  onStoreItem?: (itemId: number, quantity: number) => void
  tradeMode?: boolean
  tradeId?: number
  onToggleDropMode?: () => void
  onDropAmountChange?: (amount: number) => void
}

type SortMode = 'category' | 'name' | 'quantity' | 'recent'

type SortDir = 'asc' | 'desc'

export const SORT_OPTIONS: {
  mode: SortMode; label: string; asc: string; desc: string; defaultDir: SortDir
}[] = [
  { mode: 'category', label: 'Category', asc: 'Grouped by kind, A to Z', desc: 'Grouped by kind, Z to A', defaultDir: 'asc' },
  { mode: 'name', label: 'Name', asc: 'A to Z', desc: 'Z to A', defaultDir: 'asc' },
  { mode: 'quantity', label: 'Quantity', asc: 'Smallest stacks first', desc: 'Largest stacks first', defaultDir: 'desc' },
  { mode: 'recent', label: 'Recently gained', asc: 'Oldest first', desc: 'Newest first', defaultDir: 'desc' },
]

/**
 * Display-only ordering. Nothing is written back, and inventory rows keep their
 * real identity — this only decides what order the grid paints them in.
 *
 * `category` sorts by type, then subtype, then name. Type alone is too coarse:
 * `material` is roughly half the item table, so without the subtype pass a
 * "sorted" bag is still one enormous undifferentiated block.
 */
function sortInventory(items: InventoryItem[], mode: SortMode, dir: SortDir, filter: string): InventoryItem[] {
  const q = filter.trim().toLowerCase()
  const filtered = q
    ? items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.subtype || '').toLowerCase().includes(q) ||
        (i.type || '').toLowerCase().includes(q))
    : items

  const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name)

  // Comparators are written ascending; direction is applied once at the end, so
  // every mode reverses consistently and there is only one place to get wrong.
  let cmp: (a: InventoryItem, b: InventoryItem) => number
  switch (mode) {
    case 'name':
      cmp = byName
      break
    case 'quantity':
      cmp = (a, b) => (a.quantity - b.quantity) || byName(a, b)
      break
    case 'recent':
      // player_inventory.id ascends with acquisition, so it doubles as age.
      cmp = (a, b) => (a.id - b.id) || byName(a, b)
      break
    case 'category':
    default:
      cmp = (a, b) =>
        (a.type || '').localeCompare(b.type || '') ||
        (a.subtype || '').localeCompare(b.subtype || '') ||
        byName(a, b)
  }

  const sorted = [...filtered].sort(cmp)
  return dir === 'desc' ? sorted.reverse() : sorted
}

export default function LeftPanel({ inventoryData, equipmentData, onEquipmentUpdate, onInventoryUpdate, onDropItem, dropMode, onToggleDropMode, dropAmount, onDropAmountChange, tradeMode, tradeId, storeMode, storeAmount, onStoreItem }: LeftPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: InventoryItem; mode?: 'drop' | 'trade' } | null>(null)
  const [dropQuantity, setDropQuantity] = useState(1)
  const [tradeAmount, setTradeAmount] = useState(1)
  const [showDropQuantity, setShowDropQuantity] = useState(false)

  // Synthetic tiles (open liquid containers) are not inventory rows and are
  // pinned after the real items, so they must not be indexed by the slot loop.
  // They previously were, which meant with 16+ real items the tile sat past the
  // end of the grid and never rendered at all.
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLElement>(null)
  const [sortOpen, setSortOpen] = useState(false)
  // Kept mounted through the exit animation, the same way GameLayout's panels do
  // it. Unmounting on close meant the drawer only ever animated on the way in.
  const [sortClosing, setSortClosing] = useState(false)
  const [sortAnchor, setSortAnchor] = useState<{ top: number; left: number } | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    try { return (localStorage.getItem('inventorySort') as SortMode) || 'category' }
    catch { return 'category' }
  })
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try {
      const saved = localStorage.getItem('inventorySortDir')
      if (saved === 'asc' || saved === 'desc') return saved
    } catch { /* private mode */ }
    return 'asc'
  })
  const [filterText, setFilterText] = useState('')
  const filterInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem('inventorySort', sortMode)
      localStorage.setItem('inventorySortDir', sortDir)
    } catch { /* private mode */ }
  }, [sortMode, sortDir])

  const SORT_ANIM_MS = 180

  const closeSort = () => {
    if (sortClosing) return
    setSortClosing(true)
    window.setTimeout(() => {
      setSortOpen(false)
      setSortClosing(false)
    }, SORT_ANIM_MS)
  }

  /** Click a mode to select it; click the selected one again to reverse it. */
  const chooseSort = (mode: SortMode) => {
    if (mode === sortMode) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortMode(mode)
    setSortDir(SORT_OPTIONS.find(o => o.mode === mode)?.defaultDir ?? 'asc')
  }

  // Desktop: the drawer slides out from the right edge of the inventory column,
  // so it never covers the grid the player is looking at. `.left-panel` clips
  // overflow-x and scrolls, so an absolutely positioned child would be cut off —
  // hence a fixed element anchored to the column's measured edge.
  useEffect(() => {
    if (isMobile || !sortOpen) return
    const place = () => {
      const rect = panelRef.current?.getBoundingClientRect()
      if (rect) setSortAnchor({ top: rect.top + 8, left: rect.right })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [isMobile, sortOpen])

  // Cursor straight into the filter box, so the popover can be used by typing.
  useEffect(() => {
    if (!sortOpen) return
    const t = window.setTimeout(() => filterInputRef.current?.focus(), 40)
    return () => clearTimeout(t)
  }, [sortOpen])

  const realItems = sortInventory(
    inventoryData.filter(i => !i.synthetic),
    sortMode,
    sortDir,
    filterText,
  )
  // Pinned tiles ignore both sort and filter: they are not items.
  const pinnedItems = inventoryData.filter(i => i.synthetic)
  const INVENTORY_SLOTS = Math.max(16, realItems.length)

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
    <aside className="left-panel panel" ref={panelRef}>

      {/* Inventory */}
      <div className={`inventory-grid panel-inset ${dropMode ? 'drop-mode-active' : ''} ${tradeMode ? 'trade-mode-active' : ''} ${storeMode ? 'store-mode-active' : ''}`}>        {Array.from({ length: INVENTORY_SLOTS }).map((_, i) => {
        const item = realItems[i]
        const qualityColor = item ? getQualityColor(item.quality) : null

        return (
          <div
            key={i}
            className={`inventory-slot ${item ? 'occupied' : ''} ${item?.synthetic ? 'open-container' : ''}`}
            data-item-name={item ? item.name : undefined}
            title=""
            style={item && qualityColor ? { borderColor: qualityColor } : {}}
            onClick={() => {
              // An open container has no inventory row, so none of the modes
              // apply to it — that is the "partials don't travel" rule showing
              // up as the tile simply not responding.
              if (item?.synthetic) return
              if (tradeMode && tradeId) {
                const qty = Math.min(tradeAmount, item.quantity)
                apiFetch('/api/trades/offer/item', {
                  method: 'POST',
                  body: JSON.stringify({ tradeId, itemId: item.item_id, quantity: qty }),
                }).catch(err => console.error(err))
                return
              }
              if (storeMode && onStoreItem) {
                const qty = Math.min(storeAmount || 1, item.quantity)
                onStoreItem(item.item_id, qty)
                return
              }
              if (dropMode) {
                const qty = Math.min(dropAmount || 1, item.quantity)
                onDropItem(item.item_id, qty)
              } else {
                handleEquip(item)
              }
            }}
            onContextMenu={e => item && !item.synthetic && handleContextMenu(e, item)}
            onMouseEnter={e => { if (item) setTooltip({ x: e.clientX, y: e.clientY, item }) }}
            onMouseLeave={() => setTooltip(null)}
            onMouseMove={e => { if (item) setTooltip({ x: e.clientX, y: e.clientY, item }) }}
          >
            {item && (
              <>
                <img
                  src={getItemIcon(item.iconName || item.name)}
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
                {item.synthetic && item.capacity ? (
                  <span className="inventory-item-qty open-container-qty">{item.quantity}/{item.capacity}</span>
                ) : item.quantity > 1 ? (
                  <span className="inventory-item-qty">{item.quantity}</span>
                ) : null}
              </>
            )}
          </div>
        )
      })}

      {/* Pinned after the real slots: an open container is a bucket in use, not
          a bucket held, so it never occupies an inventory slot and never sorts
          in among the items. */}
      {pinnedItems.map(item => (
        <div
          key={item.id}
          className="inventory-slot occupied open-container"
          title={item.description || item.name}
        >
          <img
            src={getItemIcon(item.iconName || item.name)}
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
          <span className="inventory-item-qty open-container-qty">{item.quantity}/{item.capacity}</span>
        </div>
      ))}
      </div>

      <div className="drop-controls">
        <button
          className={`drop-mode-btn ${dropMode ? 'active' : ''}`}
          onClick={() => onToggleDropMode?.()}
          title={dropMode ? 'Drop Mode ON — tap items to drop' : 'Toggle Drop Mode'}
        >
          {dropMode ? '🗑 ON' : '🗑 Drop'}
        </button>
        <div className="sort-control">
          <button
            className={`drop-mode-btn ${sortOpen || filterText ? 'active' : ''}`}
            onClick={() => { if (sortOpen) closeSort(); else setSortOpen(true) }}
            title="Sort and filter your pack"
          >
            ⇅ Sort{filterText ? ` (${realItems.length})` : ''}
          </button>

          {sortOpen && (
            <>
              {/* Click-away layer, so the drawer closes like a context menu. */}
              <div className="sort-dismiss" onClick={closeSort} />
              <div
                className={`sort-popover ${isMobile ? 'mobile' : 'drawer'} ${sortClosing ? 'closing' : ''}`}
                style={!isMobile && sortAnchor
                  ? { top: sortAnchor.top, left: sortAnchor.left }
                  : undefined}
              >
                <input
                  ref={filterInputRef}
                  className="sort-filter-input"
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setFilterText(''); closeSort() } }}
                  placeholder="Filter by name…"
                />
                {SORT_OPTIONS.map(opt => {
                  const active = sortMode === opt.mode
                  const dir = active ? sortDir : opt.defaultDir
                  return (
                    <button
                      key={opt.mode}
                      className={`sort-option ${active ? 'active' : ''}`}
                      onClick={() => chooseSort(opt.mode)}
                      title={active ? 'Tap again to reverse' : opt.mode}
                    >
                      <span className="sort-option-label">
                        {opt.label}
                        {active && <span className="sort-arrow">{dir === 'asc' ? '▲' : '▼'}</span>}
                      </span>
                      <span className="sort-option-hint">{dir === 'asc' ? opt.asc : opt.desc}</span>
                    </button>
                  )
                })}
                {filterText && (
                  <button className="sort-option clear" onClick={() => setFilterText('')}>
                    Clear filter
                  </button>
                )}
              </div>
            </>
          )}
        </div>

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

      {/* Equipment — lives under the inventory */}
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
                    {contextMenu?.mode === 'trade'
                      ? `Add to Trade (${dropQuantity})`
                      /* Show the count only when there is a choice to make. This
                         used to also consult items.stackable, which never meant
                         anything: everything stacks, so quantity is the whole test. */
                      : `Confirm Drop ${contextMenu && contextMenu.item.quantity > 1 ? `(${dropQuantity})` : ''}`}
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