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

export interface WorldEvents {
    live: WorldEvent[]
    recent: WorldEvent[]
    /** When the travelling merchant is next due; null while he is out, or off. */
    merchantNextAt?: string | null
}

const EMPTY: WorldEvents = { live: [], recent: [] }

/** A visit from the travelling merchant, rather than a skill event. His pool is his goods. */
export const isMerchant = (e: { kind: string }) => e.kind === 'merchant'

/** How each kind of event ended, in words. */
export function endedWords(e: { kind: string; endReason: string | null }): string {
    if (isMerchant(e)) return e.endReason === 'pool' ? 'sold out' : e.endReason === 'admin' ? 'packed up early' : 'moved on'
    return e.endReason === 'pool' ? 'was used up' : e.endReason === 'admin' ? 'was called off' : 'ran its course'
}

/** "in about 3 days", "in about 5 hours", "within the hour": deliberately loose. */
export function dueIn(at: string, now: number): string {
    const hours = (new Date(at).getTime() - now) / 3_600_000
    if (hours < 1) return 'within the hour'
    if (hours < 36) return `in about ${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`
    return `in about ${Math.round(hours / 24)} days`
}
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
        const unsubscribe = onWorldEventsChanged(load)
        return () => {
            clearInterval(timer)
            unsubscribe()
        }
    }, [load])

    return events
}

/**
 * Call `fn` whenever the server says an event started, changed or ended
 * (world_events_changed). Waits for the socket if it is not up yet. Returns
 * the unsubscribe, for an effect's cleanup.
 */
export function onWorldEventsChanged(fn: () => void): () => void {
    let subscribed: ReturnType<typeof getSocket> = null
    const waitForSocket = setInterval(() => {
        const socket = getSocket()
        if (!socket) return
        clearInterval(waitForSocket)
        socket.on('world_events_changed', fn)
        subscribed = socket
    }, 200)
    return () => {
        clearInterval(waitForSocket)
        subscribed?.off('world_events_changed', fn)
    }
}

/** "1 h 12 min", "8 min", "under a minute". */
export function timeLeft(endsAt: string, now: number): string {
    const minutes = Math.floor((new Date(endsAt).getTime() - now) / 60_000)
    if (minutes < 1) return 'under a minute'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h ? `${h} h ${m} min` : `${m} min`
}
