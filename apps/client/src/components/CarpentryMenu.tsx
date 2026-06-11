import { useState } from 'react'
import './SmithingMenu.css'

interface CarpentryMenuProps {
    onClose: () => void
    onStartSawing: (sawKey: string) => void
    onStartWoodworking: (recipeKey: string) => void
    playerCarpentryLevel: number
}

const WOODS = [
    { type: 'lanai', planks: 'Lanai Planks', level: 1 },
    { type: 'hatch', planks: 'Hatch Planks', level: 25 },
    { type: 'bearn', planks: 'Bearn Planks', level: 50 },
    { type: 'mirrith', planks: 'Mirrith Planks', level: 75 },
    { type: 'craxial', planks: 'Craxial Planks', level: 100 },
]

const QUALITIES = [
    { key: 'poor', label: 'Poor', yield: 1 },
    { key: 'fine', label: 'Fine', yield: 2 },
    { key: 'excellent', label: 'Excellent', yield: 3 },
]

const WOODWORK = [
    { key: 'lanai_tool_rod', name: 'Lanai Tool Rod', ingredients: [{ name: 'Lanai Planks', quantity: 1 }], level: 1 },
    { key: 'lanai_sawhorse', name: 'Lanai Sawhorse', ingredients: [{ name: 'Lanai Planks', quantity: 10 }], level: 1 },
]

export default function CarpentryMenu({ onClose, onStartSawing, onStartWoodworking, playerCarpentryLevel }: CarpentryMenuProps) {
    const [tab, setTab] = useState<'saw' | 'woodwork'>('saw')

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="smithing-menu-modal" onClick={e => e.stopPropagation()}>
                <div className="smithing-menu-header">
                    <h3 className="gold-text">Carpentry Workshop</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="smithing-categories">
                    <button className={`smithing-category-btn ${tab === 'saw' ? 'active' : ''}`} onClick={() => setTab('saw')}>Saw Planks</button>
                    <button className={`smithing-category-btn ${tab === 'woodwork' ? 'active' : ''}`} onClick={() => setTab('woodwork')}>Woodworking</button>
                </div>

                {tab === 'saw' && (
                    <div className="smithing-recipe-grid">
                        {WOODS.map(w => {
                            const locked = playerCarpentryLevel < w.level
                            return (
                                <div key={w.type} className={`smithing-recipe-card ${locked ? 'locked' : ''}`}>
                                    <div className="smithing-recipe-image">
                                        <img src={`/images/items/${w.planks.replace(/ /g, '_')}.png`} alt={w.planks}
                                            onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                        <span className="smithing-recipe-name">{w.planks}</span>
                                    </div>
                                    {locked ? (
                                        <div className="smithing-locked-label">Level {w.level}</div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
                                            {QUALITIES.map(q => (
                                                <button key={q.key} className="btn" style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                                                    onClick={() => { onStartSawing(`${w.type}_${q.key}`); onClose() }}>
                                                    {q.label} → {q.yield}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {tab === 'woodwork' && (
                    <div className="smithing-recipe-grid">
                        {WOODWORK.map(r => {
                            const locked = playerCarpentryLevel < r.level
                            return (
                                <div key={r.key} className={`smithing-recipe-card ${locked ? 'locked' : ''}`}
                                    onClick={() => { if (!locked) { onStartWoodworking(r.key); onClose() } }}>
                                    <div className="smithing-recipe-image">
                                        <img src={`/images/items/${r.name.replace(/ /g, '_')}.png`} alt={r.name}
                                            onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                        <span className="smithing-recipe-name">{r.name}</span>
                                    </div>
                                    <div className="smithing-recipe-ingredients">
                                        {r.ingredients.map((ing, i) => (
                                            <span key={i} className="smithing-ingredient">{ing.quantity}× {ing.name}</span>
                                        ))}
                                    </div>
                                    {locked && <div className="smithing-locked-label">Level {r.level}</div>}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}