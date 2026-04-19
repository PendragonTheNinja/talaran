import { useState, useCallback } from 'react'
import TopNav from './TopNav'
import LeftPanel from './LeftPanel'
import GameView from './GameView'
import RightPanel from './RightPanel'
import ChatPanel from './ChatPanel'
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
}

interface GameLayoutProps {
  player: Player
  playerData: PlayerData | null
  locationData: LocationData | null
  inventoryData: InventoryItem[]
  onLogout: () => void
  onPlayerDataUpdate: () => void
}

export default function GameLayout({
  player,
  playerData,
  locationData,
  inventoryData,
  onLogout,
  onPlayerDataUpdate,
}: GameLayoutProps) {
  const [travelStatus, setTravelStatus] = useState<{ message: string; seconds: number } | null>(null)

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

const clearAllActions = useCallback(() => {
  setTravelStatus(null)
}, [])

  return (
    <div className="game-root">
      <TopNav player={player} onLogout={onLogout} />
      <div className="game-body">
        <LeftPanel inventoryData={inventoryData} />
        <div className="game-center">
          <GameView
  locationData={locationData}
  playerData={playerData}
  onPlayerDataUpdate={onPlayerDataUpdate}
  travelStatus={travelStatus}
  onClearTravel={() => setTravelStatus(null)}
/>
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