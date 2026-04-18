import { Player } from '../types'
import './RightPanel.css'

interface RightPanelProps {
  player: Player
}

const SKILLS = [
  { name: 'Attack',       type: 'combat' },
  { name: 'Strength',     type: 'combat' },
  { name: 'Defense',      type: 'combat' },
  { name: 'Constitution', type: 'combat' },
  { name: 'Talar',        type: 'combat' },
  { name: 'Mining',       type: 'gathering' },
  { name: 'Fishing',      type: 'gathering' },
  { name: 'Woodcutting',  type: 'gathering' },
  { name: 'Foraging',     type: 'gathering' },
  { name: 'Farming',      type: 'gathering' },
  { name: 'Hunting',      type: 'gathering' },
  { name: 'Smithing',     type: 'crafting' },
  { name: 'Cooking',      type: 'crafting' },
  { name: 'Crafting',     type: 'crafting' },
  { name: 'Carpentry',    type: 'crafting' },
  { name: 'Agility',      type: 'utility' },
  { name: 'Equitation',   type: 'utility' },
  { name: 'Sailing',      type: 'utility' },
  { name: 'Husbandry',    type: 'utility' },
  { name: 'Thieving',     type: 'utility' },
  { name: 'Exploration',  type: 'utility' },
]

export default function RightPanel({ player }: RightPanelProps) {
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
          <span className="gold-text">21</span>
        </div>
        <div className="stat-row">
          <span>Total XP</span>
          <span className="gold-text">0</span>
        </div>
        <div className="stat-row">
          <span>Combat Level</span>
          <span className="gold-text">1</span>
        </div>
      </div>

      <div className="skills-panel panel">
        <div className="panel-title">Skills</div>
        <div className="skills-grid">
          {SKILLS.map(skill => (
            <div
              key={skill.name}
              className={`skill-item skill-${skill.type}`}
              title={skill.name}
            >
              <span className="skill-name">{skill.name}</span>
              <span className="skill-level">1</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}