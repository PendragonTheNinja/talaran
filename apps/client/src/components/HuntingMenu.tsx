import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './HuntingMenu.css'

interface HuntableAnimal {
    id: number
    name: string
    required_level: number
}

interface HuntingMenuProps {
    onClose: () => void
    onStartHunt: (animalId: number) => void
    playerHuntingLevel: number
}

export default function HuntingMenu({ onClose, onStartHunt, playerHuntingLevel }: HuntingMenuProps) {
    const [tab, setTab] = useState<'hunting' | 'trapping'>('hunting')
    const [animals, setAnimals] = useState<HuntableAnimal[]>([])

    useEffect(() => {
        apiFetch<{ animals: HuntableAnimal[] }>('/api/hunting/animals')
            .then(data => setAnimals(data.animals || []))
            .catch(() => setAnimals([]))
    }, [])

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="hunting-menu-modal" onClick={e => e.stopPropagation()}>
                <div className="hunting-menu-header">
                    <h3 className="gold-text">Hunting Grounds</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Tabs */}
                <div className="hunting-tabs">
                    <button
                        className={`hunting-tab-btn ${tab === 'hunting' ? 'active' : ''}`}
                        onClick={() => setTab('hunting')}
                    >
                        Hunting
                    </button>
                    <button
                        className={`hunting-tab-btn ${tab === 'trapping' ? 'active' : ''}`}
                        onClick={() => setTab('trapping')}
                    >
                        Trapping
                    </button>
                </div>

                {tab === 'hunting' && (
                    animals.length === 0 ? (
                        <p className="hunting-empty">There is nothing to hunt here.</p>
                    ) : (
                        <div className="hunting-animal-grid">
                            {animals.map(animal => {
                                const locked = playerHuntingLevel < animal.required_level
                                return (
                                    <div
                                        key={animal.id}
                                        className={`hunting-animal-card ${locked ? 'locked' : ''}`}
                                        onClick={() => {
                                            if (!locked) { onStartHunt(animal.id); onClose() }
                                        }}
                                    >
                                        <div className="hunting-animal-image">
                                            <img
                                                src={`/images/bestiary/${animal.name.replace(/ /g, '_')}.png`}
                                                alt={animal.name}
                                                onError={(e) => { e.currentTarget.style.display = 'none' }}
                                            />
                                        </div>
                                        <span className="hunting-animal-name">{animal.name}</span>
                                        {locked && (
                                            <div className="hunting-locked-label">Level {animal.required_level}</div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )
                )}

                {tab === 'trapping' && (
                    <p className="hunting-empty">Trapping is coming soon — set snares for small game.</p>
                )}
            </div>
        </div>
    )
}