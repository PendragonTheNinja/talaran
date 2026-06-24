import { Player } from '../types'
import './RightPanel.css'
import MiniMap from './MiniMap'
import { useState } from 'react'
import PlayerStats from './PlayerStats'
import SkillsPanel from './SkillsPanel'
import TabbedPanel from './TabbedPanel'

interface Location {
  id: number
  name: string
  map_x: number
  map_y: number
  type: string
}

interface RightPanelProps {
  player: Player
  playerData: PlayerData | null
  currentLocationId: number | null
  locationName: string
  allLocations: Location[]
  connections: any[]
  onTravel: (toLocationId: number, toLocationName: string, travelTime: number) => void
  locationData?: any
  equipmentData: any
  onEquipmentUpdate: () => void
  onInventoryUpdate: () => void
}

interface Skill {
  id: number
  name: string
  type: string
  xp: number
  level: number
  xpToNext: number
}

interface PlayerData {
  player: Player
  skills: Skill[]
  totalLevel: number
  totalXp: number
  currentAction: any
}

export default function RightPanel({ player, playerData, currentLocationId, locationName, allLocations, connections, onTravel, locationData, equipmentData, onEquipmentUpdate, onInventoryUpdate }: RightPanelProps) {
  const skills = playerData?.skills || []
  const totalLevel = playerData?.totalLevel || 0
  const totalXp = playerData?.totalXp || 0

  const [showMap, setShowMap] = useState(false)
  const [mapCollapsed, setMapCollapsed] = useState(false)

  return (
    <aside className="right-panel">
      <div className="minimap panel">
        <div className="minimap-header">
          <div className="panel-title">Taiar Island</div>
          <button
            className="minimap-collapse-btn"
            onClick={() => setMapCollapsed(c => !c)}
          >
            {mapCollapsed ? '▼' : '▲'}
          </button>
        </div>
        {!mapCollapsed && (
          <>
            <div className="minimap-frame">
              <div className="minimap-canvas panel-inset">
                <MiniMap
                  currentLocationId={currentLocationId}
                  locationName={locationName}
                  locations={allLocations}
                  connections={connections}
                  onTravel={onTravel}
                />
              </div>
            </div>
            <div className="minimap-btns">
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowMap(true)}>Island Map</button>
              <button className="btn" style={{ flex: 1 }}>World Map</button>
            </div>
          </>
        )}
        {mapCollapsed && (
          <div className="minimap-collapsed-name muted-text">{locationName}</div>
        )}
      </div>

      <TabbedPanel
        playerId={player.id}
        skills={skills}
        equipmentData={equipmentData}
        onEquipmentUpdate={onEquipmentUpdate}
        onInventoryUpdate={onInventoryUpdate}
      />

      {showMap && (
        <div className="map-overlay" onClick={() => setShowMap(false)}>
          <div className="map-popup" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn map-close" onClick={() => setShowMap(false)}>✕</button>
            <img
              src={`/images/maps/${locationData?.location?.region?.replace(/ /g, '_')}.jpg`}
              alt="Island Map"
              className="map-image"
            />
          </div>
        </div>
      )}
    </aside>
  )
}