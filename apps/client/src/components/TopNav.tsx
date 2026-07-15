import { Player } from '../types'
import './TopNav.css'
import { useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  'Messages', 'Forum', 'Guild', 'Journal',
  'Events', 'Highscores', 'Manual', 'News', 'Settings'
]

interface TopNavProps {
  player: Player
  onLogout: () => void
  onGuildClick: () => void
  onMessagesClick: () => void
  onForumClick: () => void
  onNewsClick: () => void
  onHighscoresClick: () => void
  unreadMessages: number
  isAdmin?: boolean
  isMod?: boolean
  onAdminClick?: () => void
  onSettingsClick: () => void
  onForceBotCheck: () => void
}

export default function TopNav({ onLogout, onGuildClick, onMessagesClick, onForumClick, onNewsClick, onHighscoresClick, unreadMessages, isAdmin, isMod, onAdminClick, onSettingsClick, onForceBotCheck }: TopNavProps) {
  const navigate = useNavigate()
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
                      item === 'Highscores' ? onHighscoresClick :
                        item === 'Settings' ? onSettingsClick :
                          undefined
            }
            style={{ position: 'relative' }}
            title={item === 'Settings' ? 'Settings' : undefined}
          >
            {item === 'Settings' ? '⚙️' : item}
            {item === 'Messages' && unreadMessages > 0 && (
              <span className="nav-unread-badge">{unreadMessages}</span>
            )}
          </button>
        ))}
        {(isAdmin || isMod) && (
          <button className="top-nav-btn btn" style={{ color: 'var(--color-red-glow)', borderColor: 'var(--color-red-glow)' }} onClick={onAdminClick}>
            ADMIN
          </button>
        )}
        <button className="top-nav-btn btn btn-red" onClick={onLogout}>
          Log Out
        </button>
        <button
          className="top-nav-btn btn top-nav-robot"
          onClick={onForceBotCheck}
          title="Reset your AFK timer: do a bot check now to start a fresh 30-minute window before stepping away."
        >
          🤖
        </button>
      </div>
    </nav>
  )
}