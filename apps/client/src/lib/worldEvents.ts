import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './api'
import { getSocket } from './socket'

// World events, for the Events panel and the location marker
// (docs/WORLD-EVENTS-AND-MUSEUMS.md). One hook, so both show the same thing.

export interface WorldEvent {
    id: number
    name: string
    kind: string
    skill: string | null
    bonusPercent: number
    poolTotal: number
    poolLeft: number
    startsAt: string
    endsAt: string
    endedAt: string | null
    endReason: 'time' | 'pool' | 'admin' | null
    location: string | null
    locationId: number | null
    announcement: string | null
}

export interface WorldEvents { live: WorldEvent[]; recent: WorldEvent[] }

const EMPTY: WorldEvents = { live: [], recent: [] }
/** A pool's count changes with every boosted action; it is re-read this often rather than pushed each time. */
const REFRESH_MS = 30_000

/**
 * The current events: loaded at once, again the moment the server says one
 * started or ended (world_events_changed), and every 30 seconds for the pools.
 */
export function useWorldEvents(): WorldEvents {
    const [events, setEvents] = useState<WorldEvents>(EMPTY)

    const load = useCallback(() => {
        apiFetch<WorldEvents>('/api/events').then(setEvents).catch(() => { /* keep what we had */ })
    }, [])

    useEffect(() => {
        load()
        const timer = setInterval(load, REFRESH_MS)
        let subscribed: ReturnType<typeof getSocket> = null
        const waitForSocket = setInterval(() => {
            const socket = getSocket()
            if (!socket) return
            clearInterval(waitForSocket)
            socket.on('world_events_changed', load)
            subscribed = socket
        }, 200)
        return () => {
            clearInterval(timer)
            clearInterval(waitForSocket)
            subscribed?.off('world_events_changed', load)
        }
    }, [load])

    return events
}

/** "1 h 12 min", "8 min", "under a minute". */
export function timeLeft(endsAt: string, now: number): string {
    const minutes = Math.floor((new Date(endsAt).getTime() - now) / 60_000)
    if (minutes < 1) return 'under a minute'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h ? `${h} h ${m} min` : `${m} min`
}
