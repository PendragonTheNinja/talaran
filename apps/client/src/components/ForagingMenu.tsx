import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './ForagingMenu.css'

interface HabitatItem {
    name: string | null      // null → not yet discovered → render "???"
    discovered: boolean
    requiresGloves: boolean
    notable: boolean
}

interface Habitat {
    id: number
    name: string
    description: string | null
    requiredLevel: number
    unlocked: boolean
    discoveredCount: number
    totalCount: number
    items: HabitatItem[]
}

interface HabitatsResponse {
    habitats: Habitat[]
    playerLevel: number
    tools: { knifeTier: number; hasGloves: boolean; hasBasket: boolean }
}

interface ForagingMenuProps {
    onClose: () => void
    onStartForage: (habitatId: number) => void
    playerForagingLevel: number
}

export default function ForagingMenu({ onClose, onStartForage, playerForagingLevel }: ForagingMenuProps) {
    const [data, setData] = useState<HabitatsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        apiFetch<HabitatsResponse>('/api/foraging/habitats')
            .then(setData)
            .catch(() => setError('Could not load foraging habitats.'))
            .finally(() => setLoading(false))
    }, [])

    const tools = data?.tools

    return (
        <div className="foraging-overlay" onClick={onClose}>
            <div className="foraging-modal" onClick={e => e.stopPropagation()}>
                <div className="foraging-header">
                    <h2>Foraging</h2>
                    <button className="foraging-close" onClick={onClose}>✕</button>
                </div>

                {tools && (
                    <div className="foraging-tools">
                        <span className={tools.knifeTier > 0 ? 'tool-on' : 'tool-off'} title="A knife shortens each gather.">
                            🔪 {tools.knifeTier > 0 ? `Knife T${tools.knifeTier}` : 'No knife'}
                        </span>
                        <span className={tools.hasGloves ? 'tool-on' : 'tool-off'} title="Gloves let you gather thorny, stinging plants.">
                            🧤 {tools.hasGloves ? 'Gloves' : 'No gloves'}
                        </span>
                        <span className={tools.hasBasket ? 'tool-on' : 'tool-off'} title="A basket lets you carry a little more from each patch.">
                            🧺 {tools.hasBasket ? 'Basket' : 'No basket'}
                        </span>
                    </div>
                )}

                {loading && <p className="foraging-empty">Reading the land…</p>}
                {error && <p className="foraging-error">{error}</p>}
                {!loading && !error && data && data.habitats.length === 0 && (
                    <p className="foraging-empty">There is nothing to forage here.</p>
                )}

                <div className="foraging-habitat-list">
                    {data?.habitats.map(h => {
                        const locked = playerForagingLevel < h.requiredLevel
                        return (
                            <div key={h.id} className={`foraging-habitat-card ${locked ? 'locked' : ''}`}>
                                <div className="foraging-habitat-top">
                                    <div>
                                        <span className="foraging-habitat-name">{h.name}</span>
                                        <span className="foraging-habitat-progress">
                                            {h.discoveredCount}/{h.totalCount} found
                                        </span>
                                    </div>
                                    {locked
                                        ? <span className="foraging-lock">Level {h.requiredLevel}</span>
                                        : <button className="foraging-go" onClick={() => { onStartForage(h.id); onClose() }}>Forage</button>}
                                </div>

                                {h.description && <p className="foraging-habitat-desc">{h.description}</p>}

                                <div className="foraging-item-grid">
                                    {h.items.map((it, i) => (
                                        <span
                                            key={i}
                                            className={`foraging-chip ${it.discovered ? 'found' : 'unknown'} ${it.notable ? 'notable' : ''}`}
                                            title={it.requiresGloves ? 'Requires gloves to gather' : undefined}
                                        >
                                            {it.notable && it.discovered && <span className="chip-spark">✦ </span>}
                                            {it.discovered ? it.name : '???'}
                                            {it.requiresGloves && <span className="chip-glove"> 🧤</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <p className="foraging-hint">
                    Items stay <span className="foraging-chip unknown inline">???</span> until you find them here yourself. ✦ marks a rare find.
                </p>
            </div>
        </div>
    )
}
