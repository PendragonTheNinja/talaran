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
    /** From the server; never worked out here. */
    combatLevel?: number
    gold?: number
    /** Worn from the Feats panel. Both optional: most players wear neither. */
    wornTitle?: string | null
    wornBadge?: string | null
    wornBadgeGlyph?: string | null
}

const fmt = (n: number) => n.toLocaleString('en-US')

// The progress hairline runs along the icon's own edge: the path IS the tile's
// outline (the whole 100×100 box, corners at the tile's 12%), so the line can
// never sit inside the art. Its thickness is not set here: the stroke is drawn
// wide and .skill-ring shows only its outermost edge (SkillsPanel.css).
const RR = 12                     // the tile's corner radius, in viewBox units
const RING_P = 4 * (100 - 2 * RR) + 2 * Math.PI * RR

export default function SkillsPanel({ skills, playerName, totalLevel, totalXp, combatLevel, gold, wornTitle, wornBadge, wornBadgeGlyph }: SkillsPanelProps) {
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
                        {combatLevel !== undefined && <span>Combat <b>{fmt(combatLevel)}</b></span>}
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
                            <span className="skill-ring">
                                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                                    <rect
                                        className="skill-ring-fill"
                                        x="0" y="0" width="100" height="100" rx={RR} ry={RR}
                                        style={{
                                            strokeDasharray: RING_P,
                                            strokeDashoffset: RING_P * (1 - skill.progress / 100),
                                        }}
                                    />
                                </svg>
                            </span>
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
