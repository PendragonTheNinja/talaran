import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api'

// Travel log ENTRIES only. The launcher button, panel frame and close button
// moved to LogPanel.tsx when the loot log joined it as a second tab; this file
// kept its name and its rendering so the journey markup stayed where anyone
// looking for it would expect, rather than being copied into the shell and
// leaving a dead component behind.

export interface TravelLogEvent {
    message: string
    itemName: string
    quantity: number
}
export interface TravelLogEntry {
    id: number
    from: string
    to: string
    skill: string
    events: TravelLogEvent[]
    timestamp: string
}

interface TravelLogProps {
    refreshKey: number   // bump to re-fetch (e.g. after a new walk)
}

export default function TravelLog({ refreshKey }: TravelLogProps) {
    const [log, setLog] = useState<TravelLogEntry[]>([])

    const loadLog = useCallback(async () => {
        try {
            const data = await apiFetch<{ log: TravelLogEntry[] }>('/api/travel/log')
            setLog(data.log || [])
        } catch {
            setLog([])
        }
    }, [])

    useEffect(() => { loadLog() }, [loadLog, refreshKey])

    const fmt = (ts: string) => {
        const d = new Date(ts)
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
            d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    }

    const bodyRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight
        }
    }, [log])

    return (
        <div className="travel-log-body" ref={bodyRef}>
            {log.length === 0 ? (
                <p className="travel-log-empty">No journeys recorded yet. Set out and see what you find.</p>
            ) : (
                [...log].reverse().map((entry, idx, arr) => (
                    <div key={entry.id} className={`travel-log-entry ${idx === arr.length - 1 ? 'most-recent' : ''}`}>
                        <div className="travel-log-entry-head">
                            <span className="travel-log-route">{entry.from} → {entry.to}</span>
                            <span className="travel-log-time">{fmt(entry.timestamp)}</span>
                        </div>
                        {entry.events.map((ev, i) => (
                            <p key={i} className="travel-log-event">
                                {ev.message}
                                {ev.itemName && (
                                    <span className="travel-log-item"> ({ev.quantity > 1 ? `${ev.quantity}× ` : ''}{ev.itemName})</span>
                                )}
                            </p>
                        ))}
                    </div>
                ))
            )}
        </div>
    )
}
