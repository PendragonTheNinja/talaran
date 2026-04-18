import './TopNav.css'

const NAV_ITEMS = [
  'Messages', 'Forum', 'Clan', 'Journal',
  'Quests', 'Events', 'Manual', 'Highscores',
  'Settings', 'Log Out'
]

export default function TopNav() {
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
      </div>
    </nav>
  )
}