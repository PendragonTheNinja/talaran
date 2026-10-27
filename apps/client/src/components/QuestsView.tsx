import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './QuestsPanel.css'

interface QuestObjective {
    id: number
    description: string
    required_amount: number
    current_amount: number
    is_complete: boolean
}

interface Quest {
    id: number
    name: string
    description: string
    skill: string | null
    npc_name: string
    status: string
    /** A tutor's quest: shown in its own folding group, apart from the rest. */
    is_tutorial?: boolean
    objectives: QuestObjective[]
}

/** The tutorial group's last open/closed state, per browser. */
const TUTORIALS_KEY = 'talaran-quests-tutorials-open'

export default function QuestsView() {
    const [quests, setQuests] = useState<Quest[]>([])
    const [loading, setLoading] = useState(true)

    const [expanded, setExpanded] = useState<Set<number>>(new Set())

    const toggle = (id: number) =>
        setExpanded(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })

    useEffect(() => {
        apiFetch<{ quests: Quest[] }>('/api/quests')
            .then(d => setQuests(d.quests || []))
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [])

    // Tutorials fold away on their own, so the many quests to come are not
    // buried under ten lessons a player finished in their first week.
    const tutorials = quests
        .filter(q => q.is_tutorial && (q.status === 'active' || q.status === 'completed'))
        .sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1))
    const tutorialsActive = tutorials.filter(q => q.status === 'active').length
    const active = quests.filter(q => !q.is_tutorial && q.status === 'active')
    const completed = quests.filter(q => !q.is_tutorial && q.status === 'completed')

    // Open by default while a lesson is under way, folded once they are all
    // done; after that, whatever the player last chose.
    const [tutorialsChoice, setTutorialsChoice] = useState<boolean | null>(() => {
        try {
            const v = localStorage.getItem(TUTORIALS_KEY)
            return v === null ? null : v === 'true'
        } catch { return null }
    })
    const tutorialsOpen = tutorialsChoice ?? tutorialsActive > 0
    const toggleTutorials = () => {
        const next = !tutorialsOpen
        setTutorialsChoice(next)
        try { localStorage.setItem(TUTORIALS_KEY, String(next)) } catch { /* private mode */ }
    }

    const renderQuest = (q: Quest) => {
        const open = expanded.has(q.id)
        return (
            <div key={q.id} className={`quest-card ${open ? 'open' : ''}`}>
                <div className="quest-card-head" onClick={() => toggle(q.id)} style={{ cursor: 'pointer' }}>
                    <span className="quest-name gold-text">{open ? '▾ ' : '▸ '}{q.name}</span>
                    {/* Null for quests that belong to no trade, like the tutorial. */}
                    <span className="quest-skill muted-text">{q.skill ?? ''}</span>
                </div>
                {open && (
                    <>
                        {q.npc_name && <div className="quest-npc muted-text">{q.npc_name}</div>}
                        <p className="quest-desc">{q.description}</p>
                        <div className="quest-objectives">
                            {q.objectives.map(o => (
                                <div key={o.id} className={`quest-objective ${o.is_complete ? 'complete' : ''}`}>
                                    <span>{o.is_complete ? '✔' : '○'} {o.description}</span>
                                    <span className="quest-objective-progress muted-text">
                                        {Math.min(o.current_amount, o.required_amount)}/{o.required_amount}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        )
    }

    return (
        <div className="quests-view">
            {loading ? (
                <p className="muted-text">Loading...</p>
            ) : (
                <>
                    {tutorials.length > 0 && (
                        <div className="quests-group">
                            <h4
                                className="quests-section-title quests-group-head gold-text"
                                onClick={toggleTutorials}
                            >
                                {tutorialsOpen ? '▾ ' : '▸ '}Tutorials
                                <span className="quests-group-count muted-text">
                                    {tutorialsActive > 0
                                        ? `${tutorialsActive} under way, ${tutorials.length - tutorialsActive} done`
                                        : `${tutorials.length} done`}
                                </span>
                            </h4>
                            {tutorialsOpen && tutorials.map(renderQuest)}
                        </div>
                    )}

                    <h4 className="quests-section-title gold-text">Active</h4>
                    {active.length === 0
                        ? <p className="quests-empty muted-text">No active quests.</p>
                        : active.map(renderQuest)}

                    <h4 className="quests-section-title gold-text">Completed</h4>
                    {completed.length === 0
                        ? <p className="quests-empty muted-text">No completed quests yet.</p>
                        : completed.map(renderQuest)}
                </>
            )}
        </div>
    )
}