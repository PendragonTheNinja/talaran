import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './LocationPanel.css'
import { getItemIcon } from '../lib/items'

interface GroundItem {
  id: number
  item_name: string
  quantity: number
  dropped_by: string
}

interface PlayerAtLocation {
  id: number
  username: string
  combat_level?: number
}

interface LocationPanelProps {
  locationData: any
  currentAction: string | null
  onStartAction: (type: string, id: number | string) => void
  veins: any[]
  onKilnMaxLogs?: (max: number) => void
  onActionLimitChange?: (limit: number | null) => void
  onInventoryUpdate?: () => void
  onDropModeChange?: (active: boolean, amount?: number) => void
  groundItemsKey?: number
}

export default function LocationPanel({ locationData, currentAction, onStartAction, veins, onKilnMaxLogs, onActionLimitChange, onInventoryUpdate, onDropModeChange, groundItemsKey }: LocationPanelProps) {
  const [groundItems, setGroundItems] = useState<any[]>([])
  const [playersHere, setPlayersHere] = useState<PlayerAtLocation[]>([])
  const [forgeOpen, setForgeOpen] = useState(false)
  const [smithingStatus, setSmithingStatus] = useState<any>(null)

  const location = locationData?.location
  const nodes = locationData?.nodes || []
  const connections = locationData?.connections || []
  const isEmberra = location?.name === 'Emberra'

  const [dropMode, setDropMode] = useState(false)
  const [dropAmount, setDropAmount] = useState(1)

  const loadGroundItems = async () => {
    try {
      const data = await apiFetch<{ items: any[] }>('/api/ground-items')
      setGroundItems(data.items)
    } catch (err) { }
  }

  useEffect(() => {
    loadGroundItems()
  }, [locationData, groundItemsKey])

  useEffect(() => {
    setPlayersHere([])
    apiFetch<{ players: PlayerAtLocation[] }>('/api/location/players-here')
      .then(data => setPlayersHere(data.players))
      .catch(() => setPlayersHere([]))

    if (isEmberra) {
      apiFetch<any>('/api/smithing/status').then(data => {
        setSmithingStatus(data)
        if (data.maxLogs && onKilnMaxLogs) onKilnMaxLogs(data.maxLogs)
      }).catch(() => { })
    }
  }, [locationData])

  const woodcuttingNodes = nodes.filter((n: any) => n.skill === 'woodcutting')
  const miningNodes = nodes.filter((n: any) => n.skill === 'mining')

  const handlePickup = async (groundItemId: number) => {
    try {
      const data = await apiFetch<{ itemName: string; quantity: number }>('/api/ground-items/pickup', {
        method: 'POST',
        body: JSON.stringify({ groundItemId }),
      })
      loadGroundItems()
      onInventoryUpdate?.()
    } catch (err: any) {
      console.error('Pickup failed:', err.message)
    }
  }

  return (
    <aside className="location-panel panel">

      {/* Location actions */}
      <div className="location-panel-section">
        <div className="panel-title">Location Menu</div>

        {woodcuttingNodes.map((node: any) => (
          <button
            key={node.id}
            className={`location-action-btn ${currentAction === 'woodcutting' ? 'active' : ''}`}
            onClick={() => onStartAction('woodcutting', node.id)}
          >
            Chop {node.name}
          </button>
        ))}

        {miningNodes.map((node: any) => (
          <button
            key={node.id}
            className={`location-action-btn ${currentAction === 'mining_rock' ? 'active' : ''}`}
            onClick={() => onStartAction('mining_rock', node.id)}
          >
            Mine {node.name}
          </button>
        ))}

        {veins.map((vein: any) => (
          <button
            key={vein.id}
            className={`location-action-btn vein ${currentAction === 'mining_vein' ? 'active' : ''}`}
            onClick={() => onStartAction('mining_vein', vein.id)}
          >
            ⛏ {vein.ore_name} Vein ({vein.remaining_quantity})
          </button>
        ))}

        {/* Smithing — Emberra only */}
        {isEmberra && (
          <div className="location-submenu">
            <button
              className={`location-action-btn submenu-toggle ${forgeOpen ? 'open' : ''}`}
              onClick={() => setForgeOpen(!forgeOpen)}
            >
              {forgeOpen ? '▼' : '▶'} Forge
            </button>

            {forgeOpen && (
              <div className="submenu-items">
                {/* Workstation setup */}
                {smithingStatus && !smithingStatus.workstation && (
                  <button
                    className="location-action-btn sub"
                    onClick={() => onStartAction('smithing_setup', 0)}
                  >
                    Set Up Workstation
                  </button>
                )}

                {/* Kiln */}
                {smithingStatus?.kilnStatus ? (
                  smithingStatus.kilnStatus.isReady ? (
                    <button
                      className="location-action-btn sub gold"
                      onClick={() => onStartAction('kiln_collect', 0)}
                    >
                      Collect Charc ({smithingStatus.kilnStatus.charcYield})
                    </button>
                  ) : (
                    <div className="location-action-info">
                      Kiln burning... {smithingStatus.kilnStatus.minutesRemaining}m
                    </div>
                  )
                ) : (
                  <button
                    className="location-action-btn sub"
                    onClick={() => onStartAction('kiln_load', 0)}
                  >
                    Load Kiln
                  </button>
                )}

                {/* Smelt */}
                {smithingStatus?.workstation?.is_active && (
                  <button
                    className={`location-action-btn sub ${currentAction === 'smelting' ? 'active' : ''}`}
                    onClick={() => {
                      console.log('Smelt button clicked')
                      onStartAction('smelting', 'ambren')
                    }}
                  >
                    Smelt Ambren Ingots
                  </button>
                )}

                {/* Smith items */}
                {smithingStatus?.workstation?.is_active && (
                  <button
                    className={`location-action-btn sub ${currentAction === 'smithing' ? 'active' : ''}`}
                    onClick={() => onStartAction('smithing_menu', 0)}
                  >
                    Smith Ambren Items →
                  </button>
                )}

              </div>
            )}
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Players at location */}
      <div className="location-panel-section">
        <div className="panel-title">Players Here</div>
        {playersHere.length === 0 ? (
          <p className="location-panel-empty">No other players here.</p>
        ) : (
          playersHere.map(p => (
            <div key={p.id} className="location-player">
              <span className="location-player-name gold-text">{p.username}</span>
              {p.combat_level && (
                <span className="location-player-level muted-text">Lv {p.combat_level}</span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="divider" />

      {/* Ground items */}
      <div className="location-panel-section">
        <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>On the Ground</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {dropMode && (
              <input
                type="number"
                min={1}
                value={dropAmount}
                onChange={e => {
                  const amt = Math.max(1, parseInt(e.target.value) || 1)
                  setDropAmount(amt)
                  if (dropMode) onDropModeChange?.(true, amt)
                }}
                style={{ width: '45px', fontSize: '12px', padding: '2px 4px' }}
                className="context-menu-qty-input"
              />
            )}
            <button
              className={`drop-mode-btn ${dropMode ? 'active' : ''}`}
              onClick={() => {
                const next = !dropMode
                setDropMode(next)
                onDropModeChange?.(next, dropAmount)
              }}
              title={dropMode ? 'Drop Mode ON' : 'Toggle Drop Mode'}
            >
              {dropMode ? '🗑 ON' : '🗑 Drop'}
            </button>
          </div>
        </div>
        {groundItems.length === 0 ? (
          <p className="location-panel-empty">Nothing on the ground.</p>
        ) : (
          <div className="ground-items-grid">
            {groundItems.map(item => (
              <div
                key={item.id}
                className="ground-item-slot"
                title={`${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}\nClick to pick up`}
                onClick={() => handlePickup(item.id)}
              >
                <img
                  src={getItemIcon(item.name)}
                  alt={item.name}
                  className="inventory-item-icon"
                  onError={e => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.removeAttribute('style')
                  }}
                />
                <span className="inventory-item-text" style={{ display: 'none' }}>{item.name.split(' ')[0]}</span>
                {item.quantity > 1 && (
                  <span className="inventory-item-qty">{item.quantity}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </aside>
  )
}