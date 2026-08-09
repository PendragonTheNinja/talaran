import { useState } from 'react'
import TravelLog from './TravelLog'
import LootLog from './LootLog'
import './LogPanel.css'

// The shell for both logs. Previously TravelLog owned its own launcher button
// and panel chrome; that moved here so the two logs can share one button and
// one frame, and TravelLog was reduced to just its entries. It is still mounted
// and still live, rather than left behind as a second unused component.

type Tab = 'loot' | 'travel'

interface LogPanelProps {
    open: boolean
    onOpen: () => void
    onClose: () => void
    travelRefreshKey: number
    lootRefreshKey: number
    /** Set when a journey turns something up, so the travel tab opens itself. */
    forceTravelTab?: number
}

export default function LogPanel({
    open, onOpen, onClose, travelRefreshKey, lootRefreshKey, forceTravelTab,
}: LogPanelProps) {
    const [tab, setTab] = useState<Tab>('loot')
    const [lastForced, setLastForced] = useState(forceTravelTab)

    // A travel find auto-opens the panel. When it does, it should land on the
    // travel tab rather than dropping the player on loot with no idea why the
    // panel appeared. Done during render rather than in an effect so the correct
    // tab is showing on the very first paint.
    if (forceTravelTab !== lastForced) {
        setLastForced(forceTravelTab)
        if (tab !== 'travel') setTab('travel')
    }

    if (!open) {
        return (
            <button className="log-panel-icon" onClick={onOpen} title="Logs" aria-label="Open logs">
                📜
            </button>
        )
    }

    return (
        <div className="log-panel">
            <div className="log-panel-header">
                <div className="log-panel-tabs">
                    <button
                        className={`log-panel-tab ${tab === 'loot' ? 'active' : ''}`}
                        onClick={() => setTab('loot')}
                    >
                        Loot
                    </button>
                    <button
                        className={`log-panel-tab ${tab === 'travel' ? 'active' : ''}`}
                        onClick={() => setTab('travel')}
                    >
                        Travel
                    </button>
                </div>
                <button className="log-panel-close" onClick={onClose} aria-label="Close logs">✕</button>
            </div>

            <div className="log-panel-body">
                {tab === 'loot'
                    ? <LootLog refreshKey={lootRefreshKey} />
                    : <TravelLog refreshKey={travelRefreshKey} />}
            </div>
        </div>
    )
}
