import { Player } from '../types'
import './TopNav.css'
import { useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  'Messages', 'Forum', 'Guild', 'Journal',
  'Events', 'Highscores', 'Manual', 'News', 'Support', 'Settings'
]

interface TopNavProps {
  player: Player
  onLogout: () => void
  onGuildClick: () => void
  onMessagesClick: () => void
  onJournalClick?: () => void
  onForumClick: () => void
  onNewsClick: () => void
  onHighscoresClick: () => void
  onEventsClick: () => void
  unreadMessages: number
  /** New replies on threads this player started (routes/forum.ts). */
  unreadForum?: number
  isAdmin?: boolean
  isMod?: boolean
  onAdminClick?: () => void
  onSettingsClick: () => void
  onSupportClick: () => void
  onManualClick: () => void
}

export default function TopNav({ onLogout, onGuildClick, onMessagesClick, onJournalClick, onForumClick, onNewsClick, onHighscoresClick, onEventsClick, unreadMessages, unreadForum = 0, isAdmin, isMod, onAdminClick, onSettingsClick, onSupportClick, onManualClick }: TopNavProps) {
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
                item === 'Journal' ? onJournalClick :
                  item === 'Forum' ? onForumClick :
                    item === 'News' ? onNewsClick :
                      item === 'Highscores' ? onHighscoresClick :
                      item === 'Events' ? onEventsClick :
                        item === 'Settings' ? onSettingsClick :
                          item === 'Support' ? onSupportClick :
                            item === 'Manual' ? onManualClick :
                            undefined
            }
            style={{ position: 'relative' }}
            title={item === 'Settings' ? 'Settings' : undefined}
          >
            {item === 'Settings' ? '⚙️' : item}
            {item === 'Messages' && unreadMessages > 0 && (
              <span className="nav-unread-badge">{unreadMessages}</span>
            )}
            {item === 'Forum' && unreadForum > 0 && (
              <span className="nav-unread-badge" title="New replies to your threads">{unreadForum > 99 ? '99+' : unreadForum}</span>
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
      </div>
    </nav>
  )
}