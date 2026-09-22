import { useState } from 'react'
import Badge from './Badge'
import SkillsModal from './SkillsModal'
import './SkillsPanel.css'
import { useSkillTooltip } from './SkillTooltip'

interface Skill {
    id: number
    name: string
    type: string
    level: number
    xp: number
    progress: number
    description: string
    /** Into the current level, and how long that level is. Both from the server. */
    xpIntoLevel?: number
    xpLevelSpan?: number
    xpToNext?: number
}

interface SkillsPanelProps {
    skills: Skill[]
    playerName?: string
    totalLevel?: number
    totalXp?: number
    gold?: number
    /** Worn from the Feats panel. Both optional: most players wear neither. */
    wornTitle?: string | null
    wornBadge?: string | null
    wornBadgeGlyph?: string | null
}

const fmt = (n: number) => n.toLocaleString('en-US')

// Rounded-rect perimeter for the progress outline (viewBox is 100×100).
const RW = 94, RH = 94, RR = 12   // rect size + corner radius (in viewBox units)
const RING_P = 2 * (RW - 2 * RR) + 2 * (RH - 2 * RR) + 2 * Math.PI * RR

export default function SkillsPanel({ skills, playerName, totalLevel, totalXp, gold, wornTitle, wornBadge, wornBadgeGlyph }: SkillsPanelProps) {
    const [showModal, setShowModal] = useState(false)
    // The tooltip is shared with player profiles; see SkillTooltip.
    const { hoverProps, tooltipEl } = useSkillTooltip()

    return (
        <div className="skills-panel">
            {playerName && (
                <div className="skills-identity">
                    <div className="skills-identity-row">
                        <span className="skills-identity-name">
                            {playerName}
                            <Badge badgeKey={wornBadge} glyph={wornBadgeGlyph} size={16} />
                        </span>
                        <span className="skills-identity-gold">{fmt(gold ?? 0)}<span className="skills-identity-unit">g</span></span>
                    </div>
                    {/* The title lives here rather than in chat: this header has
                        room for a phrase and chat does not. */}
                    {wornTitle && (
                        <div className="skills-identity-row">
                            <span className="skills-identity-title">{wornTitle}</span>
                        </div>
                    )}
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
                            {...hoverProps(skill)}
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

            {tooltipEl}
        </div>
    )
}
