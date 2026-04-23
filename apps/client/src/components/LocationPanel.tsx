import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './LocationPanel.css'

interface GroundItem {
  id: number
  item_name: string
  quantity: number
  dropped_by: string
  dropped_at: string
}

interface PlayerAtLocation {
  id: number
  username: string
  combat_level: number
}

interface LocationPanelProps {
  locationData: any
  currentAction: string | null
  onStartAction: (type: string, id: number) => void
  veins: any[]
}

export default function LocationPanel({ locationData, currentAction, onStartAction, veins }: LocationPanelProps) {
  const [groundItems, setGroundItems] = useState<GroundItem[]>([])
  const [playersHere, setPlayersHere] = useState<PlayerAtLocation[]>([])

  const location = locationData?.location
  const nodes = locationData?.nodes || []
  const connections = locationData?.connections || []

  // For now players at location and ground items are placeholders
  // We'll wire these up with real API calls next
  useEffect(() => {
    setPlayersHere([{ id: 1, username: 'Pendragon', combat_level: 1 }])
    setGroundItems([])
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
    className={`location-action-btn ${currentAction === 'mining_vein' ? 'active' : ''}`}
    onClick={() => onStartAction('mining_vein', vein.id)}
  >
    ⛏ {vein.ore_name} Vein ({vein.remaining_quantity})
  </button>
))}

        {nodes.length === 0 && connections.length === 0 && (
          <p className="location-panel-empty">Nothing to do here yet.</p>
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