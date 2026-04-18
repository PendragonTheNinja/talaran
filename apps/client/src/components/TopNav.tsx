import { Player } from '../types'
import './TopNav.css'

interface TopNavProps {
  player: Player
  onLogout: () => void
}

const NAV_ITEMS = [
  'Messages', 'Forum', 'Clan', 'Journal',
  'Quests', 'Events', 'Manual', 'Highscores', 'Settings'
]

export default function TopNav({ onLogout }: TopNavProps) {
  return (
    <nav className="top-nav">
      <div className="top-nav-brand">
        <span className="top-nav-title">Talaran</span>
      </div>
      <div className="top-nav-links">
        {NAV_ITEMS.map(item => (
          <button key={item} className="top-nav-btn btn">
            {item}
          </button>
        ))}
        <button className="top-nav-btn btn btn-red" onClick={onLogout}>
          Log Out
        </button>
      </div>
    </nav>
  )
}