import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
import { getItemIcon, getQualityColor } from '../lib/items'
import { apiFetch } from '../lib/api'
import './LeftPanel.css'
import EquipmentPanel from './EquipmentPanel'
import ConfirmModal from './ConfirmModal'
import BuffPanel from './BuffPanel'

interface InventoryItem {
  id: number
  item_id: number
  name: string
  type: string
  subtype: string | null
  quality: string | null
  tier: number
  description: string
  buff_effect?: string | null
  buff_skill?: string | null
  buff_magnitude?: number | null
  buff_seconds?: number | null
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
  // Set when eating would replace a running buff, so the player is warned first.
  const [confirmEat, setConfirmEat] = useState<{ item: string; running: string } | null>(null)
  // Set when a log is clicked with a tinderbox in hand.
  const [confirmFire, setConfirmFire] = useState<{ item: string; cost: number } | null>(null)
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
  //
  // An existing filter is SELECTED rather than just focused. The filter sticks
  // around after the popover closes, so reopening it almost always means
  // replacing the old term, not adding to it. Selecting makes the first
  // keystroke overwrite instead of forcing a backspace for every character.
  useEffect(() => {
    if (!sortOpen) return
    const t = window.setTimeout(() => {
      const input = filterInputRef.current
      if (!input) return
      input.focus()
      if (input.value) input.select()
    }, 40)
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
      // Awaited, and in order. These were fired without awaiting, so a slow
      // equipment read could land after a fast inventory read and leave the
      // panel describing the slot as it was before the swap. That is what makes
      // an item look as though it has vanished: the pack says gone, the slot
      // says something else is there, and both are stale in different ways.
      await apiFetch('/api/equipment/equip', {
        method: 'POST',
        body: JSON.stringify({ itemId: item.item_id }),
      })
      await onEquipmentUpdate()
      await onInventoryUpdate()
    } catch (err: any) {
      setError(err.message || 'Could not equip item')
      setTimeout(() => setError(null), 3000)
    }
  }

  /**
   * Eat a provision, warning first if one is already running.
   *
   * The warning fires even when it is the same dish: a second Miner's Pasty
   * restarts the four hours rather than adding to them, and a player topping up
   * would otherwise assume the timer stacked.
   */
  const eatProvision = async (itemName: string) => {
    try {
      const { buff } = await apiFetch<{ buff: { sourceItem: string } | null }>('/api/buffs')
      if (buff) {
        setConfirmEat({ item: itemName, running: buff.sourceItem })
        return
      }
    } catch {
      // If the check fails, fall through and let the server decide.
    }
    await doEat(itemName)
  }

  /**
   * Set a campfire down where you stand.
   *
   * Instant, like eating: building a bench is a timed job because it is a
   * building, but setting light to a bundle of kindling is not.
   */
  /**
   * Anything with a wood quality is firewood. Checking the quality rather than
   * the name means a new tree species burns without a code change.
   */
  const isFirewood = (item: InventoryItem) =>
    !!item.quality && ['poor', 'fine', 'excellent'].includes(item.quality) && item.name.endsWith('Log')

  /**
   * Ask the server what it costs before offering the choice, rather than the
   * client keeping its own copy of the quality table and drifting from it.
   */
  const askLightCampfire = async (itemName: string) => {
    try {
      const { cost } = await apiFetch<{ cost: number | null }>(
        `/api/workstations/campfire/cost?itemName=${encodeURIComponent(itemName)}`,
      )
      if (!cost) {
        window.dispatchEvent(new CustomEvent('talaran:notice', {
          detail: { message: 'That will not burn.', type: 'error' },
        }))
        return
      }
      setConfirmFire({ item: itemName, cost })
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('talaran:notice', {
        detail: { message: err.message || 'It will not light.', type: 'error' },
      }))
    }
  }

  const lightCampfire = async (itemName: string) => {
    try {
      const res = await apiFetch<{ message: string }>('/api/workstations/campfire', {
        method: 'POST',
        body: JSON.stringify({ itemName }),
      })
      window.dispatchEvent(new CustomEvent('talaran:notice', { detail: { message: res.message } }))
      // The location menu shows the fire while it burns, and it is a different
      // component in a different column, so tell it directly rather than
      // waiting for whatever refresh happens to come next.
      window.dispatchEvent(new CustomEvent('talaran:campfire-lit'))
      onInventoryUpdate()
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('talaran:notice', {
        detail: { message: err.message || 'It will not light.', type: 'error' },
      }))
    }
  }

  const doEat = async (itemName: string) => {
    try {
      const res = await apiFetch<{ message: string }>('/api/buffs/eat', {
        method: 'POST',
        body: JSON.stringify({ itemName }),
      })
      window.dispatchEvent(new CustomEvent('talaran:notice', { detail: { message: res.message } }))
      onInventoryUpdate()
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('talaran:notice', {
        detail: { message: err.message || 'You cannot eat that.', type: 'error' },
      }))
    }
  }

  /**
   * The effect in words. The stored magnitude means something different per
   * effect, so a bare number would say nothing: seconds are a percentage off a
   * timer, rare is a percentage better chance, double is a percentage of
   * actions, travel is a percentage off the road.
   */
  const describeBuff = (item: InventoryItem): string => {
    const where = item.buff_skill || 'every skill'
    const n = item.buff_magnitude ?? 0
    switch (item.buff_effect) {
      case 'timer': return `${n}% faster at ${where}`
      case 'rare': return `${n}% better rare finds at ${where}`
      case 'double': return `${n}% chance of a double yield at ${where}`
      case 'travel': return `${n}% faster travel`
      default: return `A boon to ${where}`
    }
  }

  const fmtBuffTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.round((seconds % 3600) / 60)
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return h === 1 ? 'an hour' : `${h} hours`
    return m === 1 ? 'a minute' : `${m} minutes`
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
              } else if (isFirewood(item)) {
                askLightCampfire(item.name)
              } else if (item.subtype === 'provision') {
                // Provisions are eaten, not worn. Falling through to handleEquip
                // told the player a pasty "cannot be equipped", which is true and
                // useless.
                eatProvision(item.name)
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

      <BuffPanel onInventoryUpdate={onInventoryUpdate} />

      <div className="divider" />

      {confirmFire && (
        <ConfirmModal
          message={`Light a campfire here? It will take ${confirmFire.cost} ${confirmFire.item.toLowerCase()}${confirmFire.cost === 1 ? '' : 's'} and burn for about half an hour. Only plain roasting can be done on it.`}
          confirmLabel="Light It"
          onConfirm={() => {
            const it = confirmFire.item
            setConfirmFire(null)
            lightCampfire(it)
          }}
          onCancel={() => setConfirmFire(null)}
        />
      )}

      {confirmEat && (
        <ConfirmModal
          message={confirmEat.item === confirmEat.running
            ? `You already have a ${confirmEat.running.toLowerCase()} working. Eating another restarts it rather than adding to the time. Go ahead?`
            : `You already have a ${confirmEat.running.toLowerCase()} working. Eating a ${confirmEat.item.toLowerCase()} will replace it, and the old one is lost. Go ahead?`}
          confirmLabel="Eat It"
          onConfirm={() => {
            const item = confirmEat.item
            setConfirmEat(null)
            doEat(item)
          }}
          onCancel={() => setConfirmEat(null)}
        />
      )}

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
              {/* Provisions are the only edible thing for now. Cooked food
                  carries a heal_amount but there is no health to restore until
                  combat exists, so offering Eat on a fish would do nothing. */}
              {isFirewood(contextMenu.item) && (
                <button className="context-menu-item" onClick={() => {
                  const name = contextMenu.item.name
                  setContextMenu(null)
                  askLightCampfire(name)
                }}>
                  Light a Campfire
                </button>
              )}
              {contextMenu.item.subtype === 'provision' && (
                <button className="context-menu-item" onClick={() => {
                  const name = contextMenu.item.name
                  setContextMenu(null)
                  eatProvision(name)
                }}>
                  Eat
                </button>
              )}
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
            {/* What a provision actually does. The flavour text says "steadies
                the hands", which is the right voice and tells nobody what they
                are eating. */}
            {tooltip.item.buff_effect && (
              <p className="item-tooltip-buff">
                {describeBuff(tooltip.item)} for {fmtBuffTime(tooltip.item.buff_seconds ?? 0)}
              </p>
            )}
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