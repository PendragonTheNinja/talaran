import TopNav from './TopNav'
import LeftPanel from './LeftPanel'
import GameView from './GameView'
import RightPanel from './RightPanel'
import ChatPanel from './ChatPanel'
import './GameLayout.css'

export default function GameLayout() {
  return (
    <div className="game-root">
      <TopNav />
      <div className="game-body">
        <LeftPanel />
        <div className="game-center">
          <GameView />
          <ChatPanel />
        </div>
        <RightPanel />
      </div>
    </div>
  )
}