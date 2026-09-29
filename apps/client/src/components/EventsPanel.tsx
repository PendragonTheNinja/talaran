import { useEffect, useState } from 'react'
import './EventsPanel.css'
import { useIsMobile } from '../lib/useIsMobile'
import { useDockableWindow } from '../lib/useDockableWindow'
import DockableWindow from './DockableWindow'
import { useWorldEvents, timeLeft, type WorldEvent } from '../lib/worldEvents'

interface EventsPanelProps {
    onClose: () => void
    closing?: boolean
}

const ENDED: Record<string, string> = {
    time: 'ran its course',
    pool: 'was used up',
    admin: 'was called off',
}

/** What is happening around the island now, and what ended in the last day. */
export default function EventsPanel({ onClose, closing }: EventsPanelProps) {
    const { live, recent } = useWorldEvents()
    const isMobile = useIsMobile()
    const dock = useDockableWindow('events')

    // The countdowns tick once a second.
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(t)
    }, [])

    return (
        <DockableWindow
            dock={dock}
            enabled={!isMobile}
            onClose={onClose}
            className={`ev-panel ${closing ? 'closing' : ''}`}
            dragHandleClassName="ev-panel-header"
        >
            <div className="ev-panel-header">
                <h3 className="gold-text">Events</h3>
                <div className="ev-header-actions">
                    {!isMobile && (
                        <>
                            <button className="dock-btn" onClick={dock.togglePop} title={dock.isPopped ? 'Dock panel' : 'Pop out'}>
                                {dock.isPopped ? '⤡' : '⤢'}
                            </button>
                            {dock.isPopped && (
                                <button className={`dock-btn ${dock.isPinned ? 'active' : ''}`} onClick={dock.togglePin} title={dock.isPinned ? 'Unpin (click-away closes)' : 'Pin on top'}>📌</button>
                            )}
                        </>
                    )}
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>
            </div>

            <div className="ev-panel-body">
                <h4 className="ev-section-title">Happening now</h4>
                {live.length === 0 ? (
                    <p className="ev-empty">
                        Nothing is happening just now. Events turn up at random around the island,
                        and the server channel says when one begins.
                    </p>
                ) : (
                    live.map(e => <LiveEvent key={e.id} event={e} now={now} />)
                )}

                {recent.length > 0 && (
                    <>
                        <h4 className="ev-section-title">Earlier today</h4>
                        {recent.map(e => (
                            <div key={e.id} className="ev-recent">
                                <span className="ev-recent-name">{e.name}</span>
                                {e.location && <span className="ev-recent-where"> at {e.location}</span>}
                                <span className="ev-recent-end"> {ENDED[e.endReason ?? 'time'] ?? 'ended'}.</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </DockableWindow>
    )
}

function LiveEvent({ event: e, now }: { event: WorldEvent; now: number }) {
    const left = Math.max(0, Math.min(100, (e.poolLeft / Math.max(1, e.poolTotal)) * 100))
    return (
        <div className="ev-card">
            <div className="ev-card-head">
                <span className="ev-card-name gold-text">{e.name}</span>
                <span className="ev-card-time">{timeLeft(e.endsAt, now)}</span>
            </div>
            <div className="ev-card-where">
                {e.location}
                {e.skill && <> · <strong>+{e.bonusPercent}% {e.skill} XP</strong></>}
            </div>
            <div className="ev-pool" title={`${e.poolLeft} of ${e.poolTotal} left`}>
                <div className="ev-pool-fill" style={{ width: `${left}%` }} />
            </div>
            <div className="ev-pool-label">{e.poolLeft.toLocaleString()} of {e.poolTotal.toLocaleString()} actions left</div>
        </div>
    )
}
