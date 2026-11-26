import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'

// The ship's log (services/shipLog.ts on the server): the sailor's own record
// of every voyage, read in its own tab beside the travel log. A leg's watches
// are written when it starts and shown once each falls due, so while a leg is
// under way the tab looks again every little while to read the next one.

interface Watch { at: string; kind: string; text: string }
interface LandingLine { message: string; itemName: string | null; quantity: number }
interface Leg {
    leg: 'out' | 'on' | 'home'
    to: string
    startedAt: string
    arrived: boolean
    underWay: boolean
    watches: Watch[]
    landing: LandingLine[]
}
interface Voyage {
    id: number
    boat: string
    home: string
    weather: string
    startedAt: string
    endedAt: string | null
    legs: Leg[]
}

const WATCH_POLL_MS = 20_000

const LEG_HEAD: Record<Leg['leg'], string> = { out: 'Out to', on: 'On to', home: 'Home to' }

interface ShipLogProps {
    refreshKey: number
}

export default function ShipLog({ refreshKey }: ShipLogProps) {
    const [voyages, setVoyages] = useState<Voyage[]>([])
    const [loaded, setLoaded] = useState(false)
    // Bumped while a leg is under way, to read the watches that have fallen due since.
    const [poll, setPoll] = useState(0)

    useEffect(() => {
        let live = true
        apiFetch<{ voyages: Voyage[] }>('/api/voyages/log')
            .then(data => { if (live) setVoyages(data.voyages || []) })
            .catch(() => { /* keep what is showing */ })
            .finally(() => { if (live) setLoaded(true) })
        return () => { live = false }
    }, [refreshKey, poll])

    // While a leg is under way, its next watch is due within a minute or so.
    const underWay = voyages.some(v => v.legs.some(l => l.underWay))
    useEffect(() => {
        if (!underWay) return
        const t = setInterval(() => setPoll(n => n + 1), WATCH_POLL_MS)
        return () => clearInterval(t)
    }, [underWay])


    const time = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const day = (ts: string) => {
        const d = new Date(ts)
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time(ts)
    }

    if (!loaded) return <div className="travel-log-body" />

    return (
        <div className="travel-log-body">
            {voyages.length === 0 ? (
                <p className="travel-log-empty">No voyages yet. Put to sea from a port, and the log will keep the watches.</p>
            ) : (
                // Newest voyage at the top (Nathan, 2026-11-26); within a voyage the
                // legs and watches still read in order, as a logbook does.
                voyages.map((v, idx) => (
                    <div key={v.id} className={`travel-log-entry ship-log-voyage ${idx === 0 ? 'most-recent' : ''}`}>
                        <div className="travel-log-entry-head">
                            <span className="travel-log-route">The {v.boat}, from {v.home}</span>
                            <span className="travel-log-time">{day(v.startedAt)}</span>
                        </div>
                        {v.legs.map((l, i) => (
                            <div key={i} className="ship-log-leg">
                                <div className="ship-log-leg-head">
                                    {LEG_HEAD[l.leg]} {l.to}
                                    {l.underWay && <span className="ship-log-underway"> · under way</span>}
                                </div>
                                {l.watches.map((w, j) => (
                                    <p key={j} className={`ship-log-watch ship-log-${w.kind}`}>
                                        <span className="ship-log-bell">{time(w.at)}</span>
                                        <span>{w.text}</span>
                                    </p>
                                ))}
                                {l.landing.map((e, j) => (
                                    <p key={`l${j}`} className="travel-log-event ship-log-landing">
                                        {e.message}
                                        {e.itemName && (
                                            <span className="travel-log-item"> ({e.quantity > 1 ? `${e.quantity}× ` : ''}{e.itemName})</span>
                                        )}
                                    </p>
                                ))}
                            </div>
                        ))}
                    </div>
                ))
            )}
        </div>
    )
}
