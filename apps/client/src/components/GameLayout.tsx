import { useState, useCallback } from 'react'
import TopNav from './TopNav'
import LeftPanel from './LeftPanel'
import GameView from './GameView'
import RightPanel from './RightPanel'
import ChatPanel from './ChatPanel'
import LocationPanel from './LocationPanel'
import { Player } from '../types'
import { apiFetch } from '../lib/api'
import './GameLayout.css'

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

interface LocationData {
  location: {
    id: number
    name: string
    region: string
    type: string
    description: string
  } | null
  nodes: {
    id: number
    skill: string
    name: string
    required_level: number
    xp_reward: number
  }[]
  connections: any[]
  allLocations: any[]
}

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

interface GameLayoutProps {
  player: Player
  playerData: PlayerData | null
  locationData: LocationData | null
  inventoryData: InventoryItem[]
  equipmentData: EquipmentData | null
  onLogout: () => void
  onPlayerDataUpdate: () => void
  onEquipmentUpdate: () => void
  onInventoryUpdate: () => void
  veinsData: any[]
}

export default function GameLayout({
  player,
  playerData,
  locationData,
  inventoryData,
  equipmentData,
  onLogout,
  onPlayerDataUpdate,
  onEquipmentUpdate,
  onInventoryUpdate,
  veinsData,
}: GameLayoutProps) {
  const [travelStatus, setTravelStatus] = useState<{ message: string; seconds: number } | null>(null)
  const [gameViewAction, setGameViewAction] = useState<{ type: string; id: number } | null>(null)

  const handleTravel = async (toLocationId: number, toLocationName: string, _travelTime: number) => {
    try {
      const res = await apiFetch<{ travelTime: number; message: string }>('/api/travel/start', {
        method: 'POST',
        body: JSON.stringify({ toLocationId }),
      })
      setTravelStatus({ message: `Traveling to ${toLocationName}...`, seconds: res.travelTime })
    } catch (err: any) {
      setTravelStatus({ message: err.message || 'Could not travel there', seconds: 0 })
    }
  }

  const handleLocationAction = useCallback((type: string, id: number) => {
  if (type === 'travel') {
    const conn = locationData?.connections.find((c: any) => c.to_location_id === id)
    if (conn) handleTravel(id, conn.to_location_name, conn.base_travel_time)
  } else {
    setGameViewAction({ type, id })
  }
}, [locationData])

  return (
    <div className="game-root">
      <TopNav player={player} onLogout={onLogout} />
      <div className="game-body">
        <LeftPanel
          inventoryData={inventoryData}
          equipmentData={equipmentData}
          onEquipmentUpdate={onEquipmentUpdate}
          onInventoryUpdate={onInventoryUpdate}
        />
        <div className="game-center">
  <div className="game-scene-wrapper">
    <GameView
      locationData={locationData}
      playerData={playerData}
      onPlayerDataUpdate={onPlayerDataUpdate}
      travelStatus={travelStatus}
      onClearTravel={() => setTravelStatus(null)}
      onTravel={handleTravel}
      externalAction={gameViewAction}
      onExternalActionHandled={() => setGameViewAction(null)}
    />
    <LocationPanel
  locationData={locationData}
  currentAction={playerData?.currentAction?.action_type || null}
  onStartAction={handleLocationAction}
  veins={veinsData}
/>
  </div>
  <ChatPanel />
</div>
        <RightPanel
          player={player}
          playerData={playerData}
          currentLocationId={locationData?.location?.id || null}
          locationName={locationData?.location?.name || ''}
          allLocations={locationData?.allLocations || []}
          connections={locationData?.connections || []}
          onTravel={handleTravel}
        />
      </div>
    </div>
  )
}