import './SkillsModal.css'

interface Skill {
    id: number
    name: string
    type: string
    xp: number
    level: number
    xpToNext: number
    progress: number
}

interface SkillsModalProps {
    skills: Skill[]
    onClose: () => void
}

export default function SkillsModal({ skills, onClose }: SkillsModalProps) {
    const totalLevel = skills.reduce((s, k) => s + k.level, 0)
    const totalXp = skills.reduce((s, k) => s + k.xp, 0)

    return (
        <div className="skills-modal-overlay" onClick={onClose}>
            <div className="skills-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onClose}>✕</button>
                <h3 className="gold-text">Skills</h3>
                <div className="skills-modal-totals muted-text">
                    Total Level <span className="gold-text">{totalLevel}</span> · Total XP <span className="gold-text">{totalXp.toLocaleString()}</span>
                </div>

                <div className="skills-table">
                    <div className="skills-table-head">
                        <span>Skill</span><span>Lvl</span><span>Progress</span><span>To next</span>
                    </div>
                    {skills.slice().sort((a, b) => b.level - a.level).map(s => (
                        <div key={s.id} className="skills-table-row">
                            <span className="skills-table-name">
                                <img
                                    src={`/images/skills/${s.name.replace(/ /g, '_')}Skill.png`}
                                    alt="" className="skills-table-icon"
                                    onError={e => { e.currentTarget.style.display = 'none' }}
                                />
                                {s.name}
                            </span>
                            <span className="gold-text">{s.level}</span>
                            <span className="skills-table-bar">
                                <span className="skills-table-bar-fill" style={{ width: `${s.progress}%` }} />
                                <span className="skills-table-bar-pct">{s.progress}%</span>
                            </span>
                            <span className="muted-text">{s.xpToNext.toLocaleString()} xp</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}