import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './HuntingMenu.css'

interface HuntableAnimal {
    id: number
    name: string
    required_level: number
}

interface PlayerTrap {
    id: number
    trapName: string
    sprung: boolean
    placedAt: string
}

interface TrapType {
    id: number
    name: string
    itemName: string
    requiredLevel: number
    inInventory: number
}

interface TraplineData {
    traps: PlayerTrap[]
    huntingLevel: number
    slots: { used: number; max: number }
    trapTypes: TrapType[]
}

interface CollectResult {
    species?: string
    flavorText?: string | null
    xpAwarded?: number
    drops?: { itemName: string; quantity: number; notable: boolean }[]
    broke?: boolean
    scavenged?: boolean
}

interface HuntingMenuProps {
    onClose: () => void
    onStartHunt: (animalId: number) => void
    playerHuntingLevel: number
    /** Fires when traps change, so the location sidebar's "caught!" count refreshes */
    onTrapsChanged?: () => void
}

function timeSince(iso: string): string {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m ago`
}

export default function HuntingMenu({ onClose, onStartHunt, playerHuntingLevel, onTrapsChanged }: HuntingMenuProps) {
    const [tab, setTab] = useState<'hunting' | 'trapping'>('hunting')
    const [animals, setAnimals] = useState<HuntableAnimal[]>([])
    const [trapline, setTrapline] = useState<TraplineData | null>(null)
    const [reveal, setReveal] = useState<CollectResult | null>(null)
    const [trapError, setTrapError] = useState('')
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        apiFetch<{ animals: HuntableAnimal[] }>('/api/hunting/animals')
            .then(data => setAnimals(data.animals || []))
            .catch(() => setAnimals([]))
    }, [])

    const loadTrapline = () => {
        apiFetch<TraplineData>('/api/trapping/traps')
            .then(data => { setTrapline(data); onTrapsChanged?.() })
            .catch(() => setTrapline(null))
    }

    useEffect(() => {
        if (tab === 'trapping') loadTrapline()
    }, [tab])

    const doPlace = async (trapTypeId: number) => {
        if (busy) return
        setBusy(true); setTrapError('')
        try {
            await apiFetch('/api/trapping/place', { method: 'POST', body: JSON.stringify({ trapTypeId }) })
            loadTrapline()
        } catch (err: any) {
            setTrapError(err.message || 'Could not place the trap.')
        } finally { setBusy(false) }
    }

    const doCollect = async (trapId: number) => {
        if (busy) return
        setBusy(true); setTrapError('')
        try {
            const result = await apiFetch<CollectResult>('/api/trapping/collect', { method: 'POST', body: JSON.stringify({ trapId }) })
            setReveal(result)
            loadTrapline()
        } catch (err: any) {
            setTrapError(err.message || 'Could not check the trap.')
        } finally { setBusy(false) }
    }

    const doDismantle = async (trapId: number) => {
        if (busy) return
        setBusy(true); setTrapError('')
        try {
            await apiFetch('/api/trapping/dismantle', { method: 'POST', body: JSON.stringify({ trapId }) })
            loadTrapline()
        } catch (err: any) {
            setTrapError(err.message || 'Could not dismantle the trap.')
        } finally { setBusy(false) }
    }

    const renderTrapping = () => {
        if (reveal) {
            return (
                <div className="trapline-reveal">
                    {reveal.species && (
                        <img
                            className="trapline-reveal-img"
                            src={`/images/bestiary/${reveal.species.replace(/ /g, '_')}.png`}
                            alt={reveal.species}
                            onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                    )}
                    <p className="trapline-reveal-title gold-text">Your snare caught a {reveal.species}!</p>
                    {reveal.flavorText && (
                        <p className="trapline-reveal-flavor">{reveal.flavorText}</p>
                    )}
                    {reveal.scavenged && (
                        <p className="trapline-reveal-scavenged">Scavengers got here first — the meat is gone.</p>
                    )}
                    {reveal.drops && reveal.drops.map((d, i) => (
                        d.notable ? (
                            <p key={i} className="last-result-drop">
                                <span className="drop-sparkle">✦</span> You found {d.quantity > 1 ? `${d.quantity}× ` : ''}<span className="drop-name">{d.itemName}</span>!
                            </p>
                        ) : (
                            <p key={i} className="trapline-reveal-drop">
                                You gained {d.quantity > 1 ? `${d.quantity}× ` : ''}{d.itemName}.
                            </p>
                        )
                    ))}
                    <p className="trapline-reveal-xp">+{reveal.xpAwarded} Hunting experience</p>
                    {reveal.broke && (
                        <p className="trapline-reveal-broke">Your snare broke.</p>
                    )}
                    <button className="trap-btn" onClick={() => setReveal(null)}>Back to trapline</button>
                </div>
            )
        }

        if (!trapline) return <p className="hunting-empty">Checking your trapline…</p>
        if (trapline.trapTypes.length === 0) return <p className="hunting-empty">There is nothing to trap here.</p>

        const minLevel = Math.min(...trapline.trapTypes.map(t => t.requiredLevel))
        if (trapline.huntingLevel < minLevel) {
            return <p className="hunting-empty">Trapping requires Hunting level {minLevel}.</p>
        }

        const slotsFull = trapline.slots.used >= trapline.slots.max

        return (
            <div className="trapline">
                <div className="trapline-header">
                    <span>Traps set: {trapline.slots.used}/{trapline.slots.max}</span>
                </div>

                {trapline.traps.length === 0 && (
                    <p className="hunting-empty">No traps set here. Quiet woods, for now.</p>
                )}

                {trapline.traps.map(trap => (
                    <div key={trap.id} className={`trap-card ${trap.sprung ? 'sprung' : ''}`}>
                        <div className="trap-card-info">
                            <span className="trap-card-name">{trap.trapName}</span>
                            <span className="trap-card-state">
                                {trap.sprung ? "Something's caught!" : `Set · ${timeSince(trap.placedAt)}`}
                            </span>
                        </div>
                        {trap.sprung ? (
                            <button className="trap-btn trap-btn-check" disabled={busy} onClick={() => doCollect(trap.id)}>
                                Check trap
                            </button>
                        ) : (
                            <button className="trap-btn" disabled={busy} onClick={() => doDismantle(trap.id)}>
                                Dismantle
                            </button>
                        )}
                    </div>
                ))}

                <div className="trapline-place">
                    {trapline.trapTypes.map(t => {
                        const locked = trapline.huntingLevel < t.requiredLevel
                        const canPlace = !locked && !slotsFull && t.inInventory > 0
                        return (
                            <div key={t.id} className="trapline-place-row">
                                <span>{t.name} <span className="muted-text">(you have {t.inInventory})</span></span>
                                <button className="trap-btn trap-btn-place" disabled={!canPlace || busy} onClick={() => doPlace(t.id)}>
                                    {locked ? `Level ${t.requiredLevel}` : slotsFull ? 'Slots full' : t.inInventory === 0 ? `No ${t.itemName}` : 'Set trap'}
                                </button>
                            </div>
                        )
                    })}
                </div>

                {trapError && <p className="trapline-error">{trapError}</p>}
            </div>
        )
    }

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

                {tab === 'trapping' && renderTrapping()}
            </div>
        </div>
    )
}
