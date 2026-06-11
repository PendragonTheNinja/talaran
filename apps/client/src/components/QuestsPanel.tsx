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
    skill: string
    npc_name: string
    status: string
    objectives: QuestObjective[]
}

interface QuestsPanelProps {
    onClose: () => void
    closing?: boolean
}

export default function QuestsPanel({ onClose, closing }: QuestsPanelProps) {
    const [quests, setQuests] = useState<Quest[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        apiFetch<{ quests: Quest[] }>('/api/quests')
            .then(d => setQuests(d.quests || []))
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [])

    const active = quests.filter(q => q.status === 'active')
    const completed = quests.filter(q => q.status === 'completed')

    const renderQuest = (q: Quest) => (
        <div key={q.id} className="quest-card">
            <div className="quest-card-head">
                <span className="quest-name gold-text">{q.name}</span>
                <span className="quest-skill muted-text">{q.skill}</span>
            </div>
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
        </div>
    )

    return (
        <div className={`quests-panel ${closing ? 'closing' : ''}`}>
            <div className="quests-panel-header">
                <h3 className="gold-text">Quests</h3>
                <button className="modal-close-btn" onClick={onClose}>✕</button>
            </div>
            <div className="quests-panel-body">
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
        </div>
    )
}