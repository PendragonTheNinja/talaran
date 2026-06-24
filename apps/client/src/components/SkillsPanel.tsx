import { useState } from 'react'
import SkillsModal from './SkillsModal'
import './SkillsPanel.css'

interface Skill {
    id: number
    name: string
    type: string
    xp: number
    level: number
    xpToNext: number
    progress: number
}

interface SkillsPanelProps {
    skills: Skill[]
}

// Rounded-rect perimeter for the progress outline (viewBox is 100×100).
const RW = 94, RH = 94, RR = 12   // rect size + corner radius (in viewBox units)
const RING_P = 2 * (RW - 2 * RR) + 2 * (RH - 2 * RR) + 2 * Math.PI * RR

export default function SkillsPanel({ skills }: SkillsPanelProps) {
    const [showModal, setShowModal] = useState(false)

    return (
        <div className="skills-panel">
            <div className="skills-grid">
                {skills.length === 0 ? (
                    <p className="muted-text" style={{ padding: '8px', gridColumn: '1/-1' }}>Loading skills...</p>
                ) : (
                    skills.map(skill => (
                        <button
                            key={skill.id}
                            className="skill-tile"
                            title={`${skill.name} — Level ${skill.level} (${skill.progress}%)`}
                            onClick={() => setShowModal(true)}
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
        </div>
    )
}