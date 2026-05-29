import { Player } from '../types'
import './RightPanel.css'
import MiniMap from './MiniMap'
import { useState } from 'react'

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
  locationData?: any
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

export default function RightPanel({ player, playerData, currentLocationId, locationName, allLocations, connections, onTravel, locationData }: RightPanelProps) {
  const skills = playerData?.skills || []
  const totalLevel = playerData?.totalLevel || 0
  const totalXp = playerData?.totalXp || 0

  const [skillTooltip, setSkillTooltip] = useState<{ x: number; y: number; skill: Skill } | null>(null)

  const [showMap, setShowMap] = useState(false)

  return (
    <aside className="right-panel">
      <div className="minimap panel">
        <div className="panel-title">Taiar Island</div>
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
          <button className="btn" style={{ flex: 1 }} onClick={() => setShowMap(true)}>Island Map</button>
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
                onMouseEnter={e => setSkillTooltip({ x: e.clientX, y: e.clientY, skill })}
                onMouseLeave={() => setSkillTooltip(null)}
                onMouseMove={e => setSkillTooltip({ x: e.clientX, y: e.clientY, skill })}
              >
                <div className="skill-icon-wrap">
                  <img
                    src={`/images/skills/${skill.name.replace(/ /g, '_')}Skill.png`}
                    alt={skill.name}
                    className="skill-icon"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                  <span className="skill-level">{skill.level}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {skillTooltip && (
        <div
          className="skill-tooltip"
          style={{
            left: Math.min(skillTooltip.x + 12, window.innerWidth - 220),
            top: Math.min(skillTooltip.y + 12, window.innerHeight - 150),
          }}
        >
          <p className="skill-tooltip-name">{skillTooltip.skill.name}</p>
          <p className="skill-tooltip-level">Level {skillTooltip.skill.level}</p>
          <p className="skill-tooltip-xp">{skillTooltip.skill.xp.toLocaleString()} XP</p>
          <p className="skill-tooltip-next">{skillTooltip.skill.xpToNext.toLocaleString()} XP to next level</p>
        </div>
      )}

      {showMap && (
        <div className="map-overlay" onClick={() => setShowMap(false)}>
          <div className="map-popup" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn map-close" onClick={() => setShowMap(false)}>✕</button>
            <img
              src={`/images/maps/${locationData?.location?.region?.replace(/ /g, '_')}.jpg`}
              alt="Island Map"
              className="map-image"
            />
          </div>
        </div>
      )}
    </aside>
  )
}