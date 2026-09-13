import { useState, useEffect } from 'react'
import SkillsPanel from './SkillsPanel'
import PlayerStats from './PlayerStats'
import QuestsView from './QuestsView'
import FeatsPanel from './FeatsPanel'
import { apiFetch } from '../lib/api'
import './TabbedPanel.css'

type TabKey = 'skills' | 'stats' | 'quests' | 'feats'

interface EquipmentData {
    head: any | null; neck: any | null; back: any | null; chest: any | null
    mainhand: any | null; offhand: any | null; legs: any | null; hands: any | null
    feet: any | null; finger: any | null; mount: any | null; trophy: any | null
}

interface Skill {
    id: number; name: string; type: string; xp: number; level: number; xpToNext: number
}

interface TabbedPanelProps {
    playerId: number
    skills: Skill[]
    equipmentData: EquipmentData | null
    onEquipmentUpdate: () => void
    onInventoryUpdate: () => void
    /* Identity line above the skills grid. This is the DESKTOP mount of
       SkillsPanel; GameLayout's skillsPanelEl is the mobile one. Both need
       these or the header only shows on one of them. */
    playerName?: string
    totalLevel?: number
    totalXp?: number
    gold?: number
}

const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'skills', label: 'Skills', icon: '📜' },
    { key: 'stats', label: 'Stats', icon: '📊' },
    { key: 'quests', label: 'Quests', icon: '❗' },
    { key: 'feats', label: 'Feats', icon: '✦' },
]

export default function TabbedPanel({ playerId, skills, equipmentData, onEquipmentUpdate, onInventoryUpdate, playerName, totalLevel, totalXp, gold }: TabbedPanelProps) {
    const [active, setActive] = useState<TabKey>('skills')

    /**
     * What the player is wearing, for the Skills header.
     *
     * Fetched here rather than threaded down from the app, because the Feats
     * panel that changes it is a sibling: one shared parent is the shortest
     * path between the two, and the feat-earned event already exists to say
     * when it might have changed.
     */
    const [worn, setWorn] = useState<{ title: string | null; badge: string | null; glyph: string | null }>(
        { title: null, badge: null, glyph: null },
    )

    useEffect(() => {
        const load = () => {
            apiFetch<{
                wornTitle: string | null
                wornBadge: string | null
                badges: { key: string; glyph: string | null }[]
            }>('/api/feats')
                .then(d => setWorn({
                    title: d.wornTitle,
                    badge: d.wornBadge,
                    // The glyph for the worn key, for the image fallback.
                    glyph: d.badges.find(b => b.key === d.wornBadge)?.glyph ?? null,
                }))
                .catch(() => { /* a missing title is not worth a message */ })
        }
        load()
        window.addEventListener('talaran:feat-earned', load)
        window.addEventListener('talaran:worn-changed', load)
        return () => {
            window.removeEventListener('talaran:feat-earned', load)
            window.removeEventListener('talaran:worn-changed', load)
        }
    }, [])

    // F1–F3 routing (guarded so it doesn't fight typing in inputs)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA') return
            const map: Record<string, TabKey> = { F1: 'skills', F2: 'stats', F3: 'quests', F4: 'feats' }
            if (map[e.key]) {
                e.preventDefault()
                setActive(map[e.key])
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    return (
        <div className="tabbed-panel panel">
            <div className="tab-bar">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        className={`tab-btn ${active === t.key ? 'active' : ''}`}
                        onClick={() => setActive(t.key)}
                    >
                        <span className="tab-icon">{t.icon}</span>
                        <span className="tab-label">{t.label}</span>
                    </button>
                ))}
            </div>
            <div className="tab-content">
                {active === 'skills' && (
                    <SkillsPanel
                        skills={skills}
                        playerName={playerName}
                        totalLevel={totalLevel}
                        totalXp={totalXp}
                        gold={gold}
                        wornTitle={worn.title}
                        wornBadge={worn.badge}
                        wornBadgeGlyph={worn.glyph}
                    />
                )}
                {active === 'stats' && <PlayerStats playerId={playerId} />}
                {active === 'quests' && <QuestsView />}
                {active === 'feats' && <FeatsPanel />}
            </div>
        </div>
    )
}