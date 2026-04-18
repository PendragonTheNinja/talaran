import './RightPanel.css'

const SKILLS = [
  { name: 'Attack',      type: 'combat',   level: 1 },
  { name: 'Strength',    type: 'combat',   level: 1 },
  { name: 'Defense',     type: 'combat',   level: 1 },
  { name: 'Constitution',type: 'combat',   level: 1 },
  { name: 'Talar',       type: 'combat',   level: 1 },
  { name: 'Mining',      type: 'gathering',level: 1 },
  { name: 'Fishing',     type: 'gathering',level: 1 },
  { name: 'Woodcutting', type: 'gathering',level: 1 },
  { name: 'Foraging',    type: 'gathering',level: 1 },
  { name: 'Farming',     type: 'gathering',level: 1 },
  { name: 'Hunting',     type: 'gathering',level: 1 },
  { name: 'Smithing',    type: 'crafting', level: 1 },
  { name: 'Cooking',     type: 'crafting', level: 1 },
  { name: 'Crafting',    type: 'crafting', level: 1 },
  { name: 'Carpentry',   type: 'crafting', level: 1 },
  { name: 'Agility',     type: 'utility',  level: 1 },
  { name: 'Equitation',  type: 'utility',  level: 1 },
  { name: 'Sailing',     type: 'utility',  level: 1 },
  { name: 'Husbandry',   type: 'utility',  level: 1 },
  { name: 'Thieving',    type: 'utility',  level: 1 },
  { name: 'Exploration', type: 'utility',  level: 1 },
]

export default function RightPanel() {
  return (
    <aside className="right-panel">

      {/* Minimap */}
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

      {/* Player stats */}
      <div className="player-stats panel">
        <div className="panel-title">Pendragon</div>
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

      {/* Skills */}
      <div className="skills-panel panel">
        <div className="panel-title">Skills</div>
        <div className="skills-grid">
          {SKILLS.map(skill => (
            <div key={skill.name} className={`skill-item skill-${skill.type}`} title={skill.name}>
              <span className="skill-name">{skill.name}</span>
              <span className="skill-level">{skill.level}</span>
            </div>
          ))}
        </div>
      </div>

    </aside>
  )
}