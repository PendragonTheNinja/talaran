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

interface GameLayoutProps {
  player: Player
  playerData: PlayerData | null
  onLogout: () => void
}

export default function GameLayout({ player, playerData, onLogout }: GameLayoutProps) {
  return (
    <div className="game-root">
      <TopNav player={player} onLogout={onLogout} />
      <div className="game-body">
        <LeftPanel />
        <div className="game-center">
          <GameView />
          <ChatPanel />
        </div>
        <RightPanel player={player} playerData={playerData} />
      </div>
    </div>
  )
}