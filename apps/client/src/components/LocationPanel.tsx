import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './LocationPanel.css'

interface GroundItem {
  id: number
  item_name: string
  quantity: number
  dropped_by: string
}

interface PlayerAtLocation {
  id: number
  username: string
  combat_level: number
}

interface LocationPanelProps {
  locationData: any
  currentAction: string | null
  onStartAction: (type: string, id: number | string) => void
  veins: any[]
  onKilnMaxLogs?: (max: number) => void
  onActionLimitChange?: (limit: number | null) => void
}

export default function LocationPanel({ locationData, currentAction, onStartAction, veins, onKilnMaxLogs, onActionLimitChange }: LocationPanelProps) {
  const [groundItems, setGroundItems] = useState<GroundItem[]>([])
  const [playersHere, setPlayersHere] = useState<PlayerAtLocation[]>([])
  const [forgeOpen, setForgeOpen] = useState(false)
  const [smithingStatus, setSmithingStatus] = useState<any>(null)

  const location = locationData?.location
  const nodes = locationData?.nodes || []
  const connections = locationData?.connections || []
  const isEmberra = location?.name === 'Emberra'

  useEffect(() => {
    setPlayersHere([])
    setGroundItems([])
    if (isEmberra) {
      apiFetch<any>('/api/smithing/status').then(data => {
  setSmithingStatus(data)
  if (data.maxLogs) onKilnMaxLogs?.(data.maxLogs)
}).catch(() => {})
    }
  }, [locationData])

  const woodcuttingNodes = nodes.filter((n: any) => n.skill === 'woodcutting')
  const miningNodes = nodes.filter((n: any) => n.skill === 'mining')

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
              <span className="location-player-level muted-text">Lv {p.combat_level}</span>
            </div>
          ))
        )}
      </div>

      <div className="divider" />

      {/* Ground items */}
      <div className="location-panel-section">
        <div className="panel-title">On the Ground</div>
        {groundItems.length === 0 ? (
          <p className="location-panel-empty">Nothing on the ground.</p>
        ) : (
          groundItems.map(item => (
            <div key={item.id} className="ground-item">
              <span className="ground-item-name">{item.item_name}</span>
              {item.quantity > 1 && (
                <span className="ground-item-qty muted-text">×{item.quantity}</span>
              )}
              <button className="btn ground-item-pick">Pick Up</button>
            </div>
          ))
        )}
      </div>

    </aside>
  )
}