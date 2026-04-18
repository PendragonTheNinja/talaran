import TopNav from './TopNav'
import LeftPanel from './LeftPanel'
import GameView from './GameView'
import RightPanel from './RightPanel'
import ChatPanel from './ChatPanel'
import { Player } from '../types'
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
  connections: {
    id: number
    to_location_id: number
    to_location_name: string
    base_travel_time: number
    travel_type: string
  }[]
}

interface GameLayoutProps {
  player: Player
  playerData: PlayerData | null
  locationData: LocationData | null
  onLogout: () => void
  onPlayerDataUpdate: () => void
}

export default function GameLayout({
  player,
  playerData,
  locationData,
  onLogout,
  onPlayerDataUpdate
}: GameLayoutProps) {
  return (
    <div className="game-root">
      <TopNav player={player} onLogout={onLogout} />
      <div className="game-body">
        <LeftPanel />
        <div className="game-center">
          <GameView
            locationData={locationData}
            playerData={playerData}
            onPlayerDataUpdate={onPlayerDataUpdate}
          />
          <ChatPanel />
        </div>
        <RightPanel player={player} playerData={playerData} />
      </div>
    </div>
  )
}