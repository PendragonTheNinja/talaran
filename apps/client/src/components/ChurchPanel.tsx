import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './FarmPanel.css'

// A church (server: services/church.ts), on the museum's pattern: one modal,
// a tab per writing. A lore building for now; spells are learned at churches
// (docs/talar-spec.md §1), and they will come in as a tab of their own.

interface Writing {
    id: number
    title: string
    body: string
}

interface Church {
    id: number
    name: string
    faith: string | null
    description: string | null
    writings: Writing[]
}

export default function ChurchPanel({ churchId, onClose }: { churchId: number; onClose: () => void }) {
    const [church, setChurch] = useState<Church | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [tab, setTab] = useState<number | null>(null)

    useEffect(() => {
        apiFetch<Church>(`/api/church/${churchId}`)
            .then(c => { setChurch(c); setTab(c.writings[0]?.id ?? null) })
            .catch(() => setError('The door will not open just now.'))
    }, [churchId])

    const writing = church?.writings.find(w => w.id === tab) ?? null

    return (
        <div className="farm-overlay" onClick={onClose}>
            <div className="farm-modal" onClick={e => e.stopPropagation()}>
                <div className="farm-header">
                    <h2>{church?.name ?? 'Chapel'}</h2>
                    <button className="farm-close" onClick={onClose}>✕</button>
                </div>

                {!church && !error && <p className="farm-empty">Lifting the latch…</p>}
                {error && <p className="farm-error">{error}</p>}
                {church?.description && <p className="farm-build-lead">{church.description}</p>}

                {church && church.writings.length > 0 && (
                    <div className="farm-tabs">
                        {church.writings.map(w => (
                            <button key={w.id} className={`farm-tab ${tab === w.id ? 'active' : ''}`} onClick={() => setTab(w.id)}>
                                {w.title}
                            </button>
                        ))}
                    </div>
                )}

                {writing && (
                    <div className="church-writing">
                        {writing.body.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
                    </div>
                )}
            </div>
        </div>
    )
}
