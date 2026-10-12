import { useEffect, useState } from 'react'
import { fetchFightState, openBestiary, type FightFood, type FightingSpot, type Hp } from '../lib/combat'
import './FightMenu.css'

interface FightMenuProps {
    spot: FightingSpot
    onClose: () => void
    /** Start fighting here; `creatureId` is the pick at a chosen spot. */
    onStart: (creatureId: number | null) => void
}

/**
 * Where a fight starts (docs/combat-spec.md §8, §9).
 *
 * At a drawn spot you go in and take what comes; at a chosen spot you pick the
 * creature. Before either, the menu says how you stand: your health and what
 * you carry that mends, since food is the only heal there is.
 */
export default function FightMenu({ spot, onClose, onStart }: FightMenuProps) {
    const [hp, setHp] = useState<Hp | null>(null)
    const [food, setFood] = useState<FightFood[] | null>(null)

    useEffect(() => {
        fetchFightState()
            .then(d => { setHp(d.hp); setFood(d.food) })
            .catch(() => { setFood([]) })
    }, [])

    const meals = (food || []).reduce((n, f) => n + f.quantity, 0)
    const creatures = [...spot.creatures].sort((a, b) => a.level - b.level)

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="fight-menu-modal" onClick={e => e.stopPropagation()}>
                <div className="fight-menu-header">
                    <h3 className="gold-text">{spot.name}</h3>
                    <div className="fight-menu-header-actions">
                        <button className="btn fight-menu-bestiary" onClick={() => { onClose(); openBestiary() }}>Bestiary</button>
                        <button className="modal-close-btn" onClick={onClose}>✕</button>
                    </div>
                </div>

                {spot.description && <p className="fight-menu-desc">{spot.description}</p>}

                <div className="fight-menu-standing">
                    <span>{hp ? `Health ${hp.current} / ${hp.max}` : 'Health'}</span>
                    <span className={food && meals === 0 ? 'fight-menu-warn' : ''}>
                        {food === null
                            ? ''
                            : meals === 0
                                ? 'You carry nothing that mends.'
                                : `You carry ${meals} ${meals === 1 ? 'meal' : 'meals'} that mend.`}
                    </span>
                </div>

                {spot.kind === 'chosen' ? (
                    <>
                        <p className="fight-menu-hint muted-text">Choose what to fight.</p>
                        <div className="fight-menu-grid">
                            {creatures.map(c => (
                                <button key={c.id} className="fight-menu-card" onClick={() => onStart(c.id)}>
                                    <div className="fight-menu-image">
                                        <img
                                            src={`/images/bestiary/${c.name.replace(/ /g, '_')}.png`}
                                            alt={c.name}
                                            onError={e => { e.currentTarget.style.display = 'none' }}
                                        />
                                    </div>
                                    <span className="fight-menu-name">{c.name}</span>
                                    <span className="fight-menu-level muted-text">Level {c.level}</span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="fight-menu-grid">
                            {creatures.map(c => (
                                <div key={c.id} className="fight-menu-card static">
                                    <div className="fight-menu-image">
                                        <img
                                            src={`/images/bestiary/${c.name.replace(/ /g, '_')}.png`}
                                            alt={c.name}
                                            onError={e => { e.currentTarget.style.display = 'none' }}
                                        />
                                    </div>
                                    <span className="fight-menu-name">{c.name}</span>
                                    <span className="fight-menu-level muted-text">Level {c.level}</span>
                                </div>
                            ))}
                        </div>
                        <p className="fight-menu-hint muted-text">
                            {creatures.length > 1 ? 'You take whatever comes at you next.' : 'One after another, until you stop.'}
                        </p>
                        <button className="btn btn-gold fight-menu-go" onClick={() => onStart(null)}>Fight</button>
                    </>
                )}
            </div>
        </div>
    )
}
