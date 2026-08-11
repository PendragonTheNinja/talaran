import { useState } from 'react'
import SkillsModal from './SkillsModal'
import './SkillsPanel.css'

interface Skill {
    id: number
    name: string
    type: string
    level: number
    xp: number
    progress: number
    description: string
}

interface SkillsPanelProps {
    skills: Skill[]
    playerName?: string
    totalLevel?: number
    totalXp?: number
    gold?: number
}

const fmt = (n: number) => n.toLocaleString('en-US')

// Rounded-rect perimeter for the progress outline (viewBox is 100×100).
const RW = 94, RH = 94, RR = 12   // rect size + corner radius (in viewBox units)
const RING_P = 2 * (RW - 2 * RR) + 2 * (RH - 2 * RR) + 2 * Math.PI * RR

export default function SkillsPanel({ skills, playerName, totalLevel, totalXp, gold }: SkillsPanelProps) {
    const [showModal, setShowModal] = useState(false)
    const [hoveredSkill, setHoveredSkill] = useState<Skill | null>(null)
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

    return (
        <div className="skills-panel">
            {playerName && (
                <div className="skills-identity">
                    <div className="skills-identity-row">
                        <span className="skills-identity-name">{playerName}</span>
                        <span className="skills-identity-gold">{fmt(gold ?? 0)}<span className="skills-identity-unit">g</span></span>
                    </div>
                    <div className="skills-identity-row skills-identity-sub">
                        <span>Total Level <b>{fmt(totalLevel ?? 0)}</b></span>
                        <span>{fmt(totalXp ?? 0)} XP</span>
                    </div>
                </div>
            )}
            <div className="skills-grid">
                {skills.length === 0 ? (
                    <p className="muted-text" style={{ padding: '8px', gridColumn: '1/-1' }}>Loading skills...</p>
                ) : (
                    skills.map(skill => (
                        <button
                            key={skill.id}
                            className="skill-tile"
                            onClick={() => setShowModal(true)}
                            onMouseEnter={() => setHoveredSkill(skill)}
                            onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setHoveredSkill(null)}
                        >
                            <img
                                src={`/images/skills/${skill.name.replace(/ /g, '_')}Skill.png`}
                                alt={skill.name}
                                className="skill-icon"
                                onError={e => { e.currentTarget.style.display = 'none' }}
                            />
                            <svg className="skill-ring" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <rect className="skill-ring-track" x="3" y="3" width={RW} height={RH} rx={RR} ry={RR} />
                                <rect
                                    className="skill-ring-fill"
                                    x="3" y="3" width={RW} height={RH} rx={RR} ry={RR}
                                    style={{
                                        strokeDasharray: RING_P,
                                        strokeDashoffset: RING_P * (1 - skill.progress / 100),
                                    }}
                                />
                            </svg>
                            <span className="skill-level">{skill.level}</span>
                        </button>
                    ))
                )}
            </div>

            {showModal && <SkillsModal skills={skills} onClose={() => setShowModal(false)} />}

            {hoveredSkill && (() => {
                const TW = 240, TH = 120, PAD = 14
                const flipX = tooltipPos.x + PAD + TW > window.innerWidth
                const flipY = tooltipPos.y + PAD + TH > window.innerHeight
                const left = flipX ? tooltipPos.x - TW - PAD : tooltipPos.x + PAD
                const top = flipY ? tooltipPos.y - TH - PAD : tooltipPos.y + PAD
                return (
                    <div
                        className="skill-tooltip"
                        style={{ left: Math.max(4, left), top: Math.max(4, top) }}
                    >
                        <div className="skill-tooltip-head">
                            <span className="skill-tooltip-name">{hoveredSkill.name}</span>
                            <span className="skill-tooltip-level">Level {hoveredSkill.level}</span>
                        </div>
                        <p className="skill-tooltip-desc">{hoveredSkill.description}</p>
                        <div className="skill-tooltip-progress">{hoveredSkill.progress}% to next level</div>
                    </div>
                )
            })()}
        </div>
    )
}