import TopNav from './TopNav'
import LeftPanel from './LeftPanel'
import GameView from './GameView'
import RightPanel from './RightPanel'
import ChatPanel from './ChatPanel'
import { Player } from '../types'
import './GameLayout.css'

interface GameLayoutProps {
  player: Player
  onLogout: () => void
}

export default function GameLayout({ player, onLogout }: GameLayoutProps) {
  return (
    <div className="game-root">
      <TopNav player={player} onLogout={onLogout} />
      <div className="game-body">
        <LeftPanel />
        <div className="game-center">
          <GameView />
          <ChatPanel />
        </div>
        <RightPanel player={player} />
      </div>
    </div>
  )
}