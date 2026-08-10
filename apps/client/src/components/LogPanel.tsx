import { useState, useRef, useEffect } from 'react'
import TravelLog from './TravelLog'
import LootLog from './LootLog'
import './LogPanel.css'

// The shell for both logs. Previously TravelLog owned its own launcher button
// and panel chrome; that moved here so the two logs can share one button and
// one frame, and TravelLog was reduced to just its entries. It is still mounted
// and still live, rather than left behind as a second unused component.

type Tab = 'loot' | 'travel'

// Must match the log-panel-out animation in LogPanel.css. The panel has to stay
// mounted for the length of its own exit, or there is nothing left on screen to
// animate; unmounting immediately is why closing used to just blink out.
const CLOSE_MS = 130

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
    const [closing, setClosing] = useState(false)
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Cancel a pending close on unmount, so a stale timer cannot call onClose
    // against a parent that has already moved on.
    useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

    // Play the exit, THEN tell the parent. Until that timer fires the panel is
    // still open as far as the parent is concerned, which is what keeps it on
    // screen long enough to animate away.
    const beginClose = () => {
        if (closing) return
        setClosing(true)
        closeTimer.current = setTimeout(() => {
            closeTimer.current = null
            setClosing(false)
            onClose()
        }, CLOSE_MS)
    }

    // A travel find auto-opens the panel. When it does, it should land on the
    // travel tab rather than dropping the player on loot with no idea why the
    // panel appeared. Done during render rather than in an effect so the correct
    // tab is showing on the very first paint.
    if (forceTravelTab !== lastForced) {
        setLastForced(forceTravelTab)
        if (tab !== 'travel') setTab('travel')
    }

    if (!open && !closing) {
        return (
            <button className="log-panel-icon" onClick={onOpen} title="Logs" aria-label="Open logs">
                📜
            </button>
        )
    }

    return (
        <div className={`log-panel ${closing ? 'closing' : ''}`}>
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
                <button className="log-panel-close" onClick={beginClose} aria-label="Close logs">✕</button>
            </div>

            <div className="log-panel-body">
                {tab === 'loot'
                    ? <LootLog refreshKey={lootRefreshKey} />
                    : <TravelLog refreshKey={travelRefreshKey} />}
            </div>
        </div>
    )
}
