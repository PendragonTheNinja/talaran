import { Player } from '../types'
import './TopNav.css'

const NAV_ITEMS = [
  'Messages', 'Forum', 'Guild', 'Journal',
  'Quests', 'Events', 'Manual', 'News', 'Highscores', 'Settings'
]

interface TopNavProps {
  player: Player
  onLogout: () => void
  onGuildClick: () => void
  onMessagesClick: () => void
  onForumClick: () => void
  onNewsClick: () => void
  unreadMessages: number
}

export default function TopNav({ onLogout, onGuildClick, onMessagesClick, onForumClick, onNewsClick, unreadMessages }: TopNavProps) {
  return (
    <nav className="top-nav">
      <div className="top-nav-brand">
        <span className="top-nav-title">Talaran</span>
      </div>
      <div className="top-nav-links">
        {NAV_ITEMS.map(item => (
          <button
            key={item}
            className="top-nav-btn btn"
            onClick={
              item === 'Guild' ? onGuildClick :
              item === 'Messages' ? onMessagesClick :
              item === 'Forum' ? onForumClick :
              item === 'News' ? onNewsClick :
              undefined
            }
            style={{ position: 'relative' }}
          >
            {item}
            {item === 'Messages' && unreadMessages > 0 && (
              <span className="nav-unread-badge">{unreadMessages}</span>
            )}
          </button>
        ))}
        <button className="top-nav-btn btn btn-red" onClick={onLogout}>
          Log Out
        </button>
      </div>
    </nav>
  )
}