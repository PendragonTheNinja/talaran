import { useState, useEffect } from 'react'
import EquipmentPanel from './EquipmentPanel'
import SkillsPanel from './SkillsPanel'
import PlayerStats from './PlayerStats'
import QuestsView from './QuestsView'
import './TabbedPanel.css'

type TabKey = 'equipment' | 'skills' | 'stats' | 'quests'

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
}

const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'equipment', label: 'Equip', icon: '🛡️' },
    { key: 'skills', label: 'Skills', icon: '📜' },
    { key: 'stats', label: 'Stats', icon: '📊' },
    { key: 'quests', label: 'Quests', icon: '❗' },
]

export default function TabbedPanel({ playerId, skills, equipmentData, onEquipmentUpdate, onInventoryUpdate }: TabbedPanelProps) {
    const [active, setActive] = useState<TabKey>('skills')

    // F1–F4 routing (guarded so it doesn't fight typing in inputs)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA') return
            const map: Record<string, TabKey> = { F1: 'equipment', F2: 'skills', F3: 'stats', F4: 'quests' }
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
                {active === 'equipment' && (
                    <EquipmentPanel
                        equipmentData={equipmentData}
                        onEquipmentUpdate={onEquipmentUpdate}
                        onInventoryUpdate={onInventoryUpdate}
                    />
                )}
                {active === 'skills' && <SkillsPanel skills={skills} />}
                {active === 'stats' && <PlayerStats playerId={playerId} />}
                {active === 'quests' && <QuestsView />}
            </div>
        </div>
    )
}