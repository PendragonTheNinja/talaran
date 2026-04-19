import { Player } from '../types'
import './RightPanel.css'

import MiniMap from './MiniMap'

interface Location {
  id: number
  name: string
  map_x: number
  map_y: number
  type: string
}

interface RightPanelProps {
  player: Player
  playerData: PlayerData | null
  currentLocationId: number | null
  locationName: string
  allLocations: Location[]
  connections: any[]
  onTravel: (toLocationId: number, toLocationName: string, travelTime: number) => void
}

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

export default function RightPanel({ player, playerData, currentLocationId, locationName, allLocations, connections, onTravel }: RightPanelProps) {
  const skills = playerData?.skills || []
  const totalLevel = playerData?.totalLevel || 0
  const totalXp = playerData?.totalXp || 0

  return (
    <aside className="right-panel">
      <div className="minimap panel">
  <div className="panel-title">Map — Taiar Island</div>
  <div className="minimap-frame">
  <div className="minimap-canvas panel-inset">
    <MiniMap
  currentLocationId={currentLocationId}
  locationName={locationName}
  locations={allLocations}
  connections={connections}
  onTravel={onTravel}
/>
  </div>
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
  title={`${skill.name}\n${skill.xp.toLocaleString()} XP total\n${skill.xpToNext.toLocaleString()} XP to next level`}
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