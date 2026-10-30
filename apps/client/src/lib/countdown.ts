import { useEffect, useState } from 'react'
import { serverNow } from './serverClock'

// Countdowns in whole minutes, for things that finish at a known moment (a
// spell's cooldown, a kiln, a tanning vat). The server sends the moment, never
// a minutes figure to show: a figure is true only when it was sent, and stood
// still on screen until the panel was reopened.

/** Whole minutes until `at` on the server's clock, never below 0. */
export function minutesUntil(at: string | Date, now = serverNow()): number {
    return Math.max(0, Math.ceil((new Date(at).getTime() - now) / 60000))
}

/** "45 min", "3 h", "3 h 12 min". */
export function waitWords(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    const m = minutes % 60
    return m ? `${Math.floor(minutes / 60)} h ${m} min` : `${minutes / 60} h`
}

/**
 * The server's now, re-read every 15 seconds while `running`, so a countdown
 * drawn from it moves on its own. Idle (and no timer kept) when nothing is
 * counting down.
 */
export function useCountdownClock(running: boolean): number {
    const [now, setNow] = useState(() => serverNow())
    useEffect(() => {
        if (!running) return
        const t = setInterval(() => setNow(serverNow()), 15_000)
        return () => clearInterval(t)
    }, [running])
    return now
}
