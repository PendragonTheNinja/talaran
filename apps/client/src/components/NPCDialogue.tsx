import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './NPCDialogue.css'

interface DialogueOption {
    label: string
    next_stage: string | null
    action: string | null
}

interface QuestObjective {
    id: number
    description: string
    type: string
    required_amount: number
    current_amount: number
    is_complete: boolean
    order: number
}

interface DialogueData {
    npc: {
        id: number
        name: string
        title: string
        avatar: string
    }
    stage: string
    dialogue: {
        text_lines: string[]
        options: DialogueOption[]
    }
    questProgress: QuestObjective[] | null
    /** On the closing stage: what this conversation is about to hand over. */
    pendingRewards: QuestRewards | null
}

interface QuestRewards {
    questName: string
    items: Array<{ itemName: string; quantity: number }>
    xp: number
    skill: string | null
    gold: number
}

interface NPCDialogueProps {
    npcId: number
    onClose: () => void
    onInteraction?: () => void
}

export default function NPCDialogue({ npcId, onClose, onInteraction }: NPCDialogueProps) {
    const [data, setData] = useState<DialogueData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [transitioning, setTransitioning] = useState(false)

    const loadDialogue = async () => {
        try {
            const result = await apiFetch<DialogueData>(`/api/npcs/${npcId}/dialogue`)
            setData(result)
            setError(null)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadDialogue()
    }, [npcId])

    const handleOption = async (option: DialogueOption) => {

        if (option.action === 'close') {
            onClose()
            return
        }

        setTransitioning(true)

        try {
            if (option.action) {
                // Server action — interact then reload
                const result = await apiFetch<{ rewards?: QuestRewards | null }>(
                    `/api/npcs/${npcId}/interact`,
                    { method: 'POST', body: JSON.stringify({ action: option.action }) },
                )
                onInteraction?.()

                // Finishing a quest ends the conversation. The rewards were
                // already shown alongside the farewell, so there is nothing
                // left to say: close rather than reload into whatever the NPC
                // says to a stranger afterwards.
                if (result?.rewards) {
                    onClose()
                    return
                }

                // An option can carry BOTH an action and a next_stage, and the
                // next_stage has to win. Reloading instead re-runs resolveStage,
                // which answers "where is this player in the quest" rather than
                // "what did they just click" — so accepting a quest whose next
                // stage is more conversation jumped straight past all of it to
                // the mid-quest nag, and showed the objective list at the same
                // time.
                if (option.next_stage) {
                    const staged = await apiFetch<DialogueData>(
                        `/api/npcs/${npcId}/dialogue?stage=${option.next_stage}`,
                    )
                    setData(staged)
                } else {
                    await loadDialogue()
                }
            } else if (option.next_stage) {
                // Client-side stage navigation — fetch that specific stage
                const result = await apiFetch<DialogueData>(`/api/npcs/${npcId}/dialogue?stage=${option.next_stage}`)
                setData(result)
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setTransitioning(false)
        }
    }

    return (
        <div className="npc-overlay" onClick={onClose}>
            <div className="npc-dialogue" onClick={e => e.stopPropagation()}>

                {loading ? (
                    <div className="npc-body">
                        <p className="muted-text" style={{ fontStyle: 'italic' }}>...</p>
                    </div>
                ) : !data ? (
                    <div className="npc-body">
                        <p style={{ color: 'var(--color-red-glow)' }}>{error || 'Could not load dialogue.'}</p>
                        <button className="btn" onClick={onClose}>Close</button>
                    </div>
                ) : (
                    <>
                        <div className="npc-header">
                            <div className="npc-identity">
                                <span className="npc-avatar">{data.npc.avatar}</span>
                                <div>
                                    <p className="npc-name gold-text">{data.npc.name}</p>
                                    {data.npc.title && <p className="npc-title muted-text">{data.npc.title}</p>}
                                </div>
                            </div>
                            <button className="modal-close-btn" onClick={onClose}>✕</button>
                        </div>

                        <div className="npc-body">
                            {error && (
                                <p style={{ color: 'var(--color-red-glow)', fontSize: '13px', marginBottom: '8px' }}>
                                    {error}
                                </p>
                            )}

                            {/* Dialogue text */}
                            <div className="npc-text-block">
                                {data.dialogue.text_lines.map((line, i) => (
                                    <p key={i} className="npc-text">{line}</p>
                                ))}
                            </div>

                            {/* Quest progress if in progress stage */}
                            {data.questProgress && data.questProgress.length > 0 && (
                                <div className="npc-quest-progress">
                                    <p className="muted-text" style={{ fontSize: '12px', marginBottom: '8px' }}>
                                        Quest Progress:
                                    </p>
                                    {data.questProgress.map(obj => (
                                        <div key={obj.id} className="npc-objective">
                                            <div className="npc-objective-row">
                                                <span style={{ fontSize: '14px' }}>{obj.description}</span>
                                                <span className="gold-text" style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>
                                                    {obj.current_amount}/{obj.required_amount}
                                                </span>
                                            </div>
                                            <div className="npc-progress-bar">
                                                <div
                                                    className="npc-progress-fill"
                                                    style={{
                                                        width: `${Math.min(100, (obj.current_amount / obj.required_amount) * 100)}%`
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {data.pendingRewards && (
                                <div className="npc-rewards">
                                    <p className="npc-rewards-head">{data.pendingRewards.questName}</p>
                                    <ul className="npc-rewards-list">
                                        {data.pendingRewards.items.map((it, i) => (
                                            <li key={`i${i}`}>
                                                <span>{it.itemName}</span>
                                                <span className="npc-rewards-amt">×{it.quantity.toLocaleString()}</span>
                                            </li>
                                        ))}
                                        {data.pendingRewards.gold > 0 && (
                                            <li>
                                                <span>Gold</span>
                                                <span className="npc-rewards-amt">{data.pendingRewards.gold.toLocaleString()}g</span>
                                            </li>
                                        )}
                                        {data.pendingRewards.xp > 0 && (
                                            <li>
                                                <span>{data.pendingRewards.skill} experience</span>
                                                <span className="npc-rewards-amt">{data.pendingRewards.xp.toLocaleString()}</span>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}

                            {/* Options */}
                            <div className="npc-options">
                                {data.dialogue.options.map((option, i) => (
                                    <button
                                        key={i}
                                        className={`npc-option-btn ${option.action === 'close' ? '' : 'btn-gold'} btn`}
                                        onClick={() => handleOption(option)}
                                        disabled={transitioning}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}