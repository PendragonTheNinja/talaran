import { Player } from '../types'
import './RightPanel.css'

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

interface RightPanelProps {
  player: Player
  playerData: PlayerData | null
}

export default function RightPanel({ player, playerData }: RightPanelProps) {
  const skills = playerData?.skills || []
  const totalLevel = playerData?.totalLevel || 0
  const totalXp = playerData?.totalXp || 0

  return (
    <aside className="right-panel">
      <div className="minimap panel">
        <div className="panel-title">Map — Taiar Island</div>
        <div className="minimap-canvas panel-inset">
          <span className="minimap-placeholder">Map</span>
        </div>
        <div className="minimap-btns">
          <button className="btn" style={{ flex: 1 }}>Island Map</button>
          <button className="btn" style={{ flex: 1 }}>World Map</button>
        </div>
      </div>

      <div className="player-stats panel">
        <div className="panel-title">{player.username}</div>
        <div className="stat-row">
          <span>Gold</span>
          <span className="gold-text">0</span>
        </div>
        <div className="stat-row">
          <span>Total Level</span>
          <span className="gold-text">{totalLevel}</span>
        </div>
        <div className="stat-row">
          <span>Total XP</span>
          <span className="gold-text">{totalXp.toLocaleString()}</span>
        </div>
        <div className="stat-row">
          <span>Combat Level</span>
          <span className="gold-text">1</span>
        </div>
      </div>

      <div className="skills-panel panel">
        <div className="panel-title">Skills</div>
        <div className="skills-grid">
          {skills.length === 0 ? (
            <p className="muted-text" style={{ padding: '8px', gridColumn: '1/-1' }}>
              Loading skills...
            </p>
          ) : (
            skills.map(skill => (
              <div
                key={skill.id}
                className={`skill-item skill-${skill.type}`}
                title={`${skill.name} — ${skill.xp.toLocaleString()} XP (${skill.xpToNext.toLocaleString()} to next level)`}
              >
                <span className="skill-name">{skill.name}</span>
                <span className="skill-level">{skill.level}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}