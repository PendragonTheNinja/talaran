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
    objectives: QuestObjective[]
}

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

    const active = quests.filter(q => q.status === 'active')
    const completed = quests.filter(q => q.status === 'completed')

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