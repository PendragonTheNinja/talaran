import { useCallback, useState } from 'react'
import BuffPanel from './BuffPanel'
import { CombatStatsBody, type CombatProfile } from './EquipmentPanel'

/**
 * Combat Stats and Provisions as two tabs of one box (Nathan, 2026-11-04).
 *
 * They used to stack at the foot of the left column, and with provisions in
 * the pack the second box pushed Combat Stats out of sight. One box, one page
 * at a time: the tab chosen last is remembered in this browser, and the caret
 * folds the box to its tabs as Combat Stats' header used to. Both pages stay
 * mounted, so Provisions keeps counting down and can light its tab's mark
 * while Combat is showing.
 */

type Tab = 'combat' | 'provisions'
const TAB_KEY = 'leftStatsTab'
const SHUT_KEY = 'combatStatsCollapsed'

function readTab(): Tab {
    try { return localStorage.getItem(TAB_KEY) === 'provisions' ? 'provisions' : 'combat' } catch { return 'combat' }
}

function readShut(): boolean {
    try { return localStorage.getItem(SHUT_KEY) === '1' } catch { return false }
}

interface StatsTabsProps {
    combat?: CombatProfile | null
    onInventoryUpdate: () => void
}

export default function StatsTabs({ combat, onInventoryUpdate }: StatsTabsProps) {
    const [tab, setTab] = useState<Tab>(readTab)
    const [shut, setShut] = useState(readShut)
    const [buffActive, setBuffActive] = useState(false)

    const choose = (next: Tab) => {
        setTab(next)
        try { localStorage.setItem(TAB_KEY, next) } catch { /* private window: just this visit */ }
        if (shut) toggleShut()
    }

    const toggleShut = () => setShut(was => {
        try { localStorage.setItem(SHUT_KEY, was ? '0' : '1') } catch { /* private window: just this visit */ }
        return !was
    })

    const onSummary = useCallback((s: { active: boolean }) => setBuffActive(s.active), [])

    return (
        <div className={`stat-tabs panel-inset${shut ? ' is-shut' : ''}`}>
            <div className="stat-tabs-bar" role="tablist">
                <button role="tab" aria-selected={tab === 'combat'}
                    className={`stat-tab${tab === 'combat' ? ' active' : ''}`}
                    onClick={() => choose('combat')}>
                    Combat
                </button>
                <button role="tab" aria-selected={tab === 'provisions'}
                    className={`stat-tab${tab === 'provisions' ? ' active' : ''}`}
                    onClick={() => choose('provisions')}
                    title={buffActive ? 'A provision is working' : undefined}>
                    Provisions{buffActive && <span className="stat-tab-mark" aria-label="(working)" />}
                </button>
                <button className="stat-tabs-caret" onClick={toggleShut} aria-expanded={!shut}
                    title={shut ? 'Open' : 'Fold away'}>
                    {shut ? '▼' : '▲'}
                </button>
            </div>
            <div className="stat-tabs-body" hidden={shut || tab !== 'combat'}>
                <CombatStatsBody combat={combat} />
            </div>
            <div className="stat-tabs-body" hidden={shut || tab !== 'provisions'}>
                <BuffPanel embedded onInventoryUpdate={onInventoryUpdate} onSummary={onSummary} />
            </div>
        </div>
    )
}
