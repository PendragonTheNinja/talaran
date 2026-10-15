/**
 * The server's clock, as seen from here.
 *
 * Action timers arrive as moments on the server's clock (completesAt), and a
 * countdown made by subtracting the player's own Date.now() is off by however
 * far the two clocks disagree: two seconds ahead and every action finished
 * with "2s" still showing. Every API response carries the server's time
 * (X-Server-Time, index.ts); apiFetch hands it here, and serverNow() is
 * Date.now() moved onto the server's clock.
 *
 * The sample with the shortest round trip is the most exact (the server's
 * stamp sits somewhere inside it, taken as the midpoint), so it is kept, and
 * replaced by any as good or better, or by any at all once it is five minutes
 * old, so a clock that is corrected or drifts is followed.
 */

const STALE_MS = 5 * 60 * 1000

let offset = 0
let bestRtt = Infinity
let bestAt = 0

export function noteServerTime(header: string | null, sentAt: number, receivedAt: number): void {
    const server = Number(header)
    if (!header || !Number.isFinite(server)) return
    const rtt = Math.max(0, receivedAt - sentAt)
    if (rtt > bestRtt && receivedAt - bestAt < STALE_MS) return
    offset = server - (sentAt + receivedAt) / 2
    bestRtt = rtt
    bestAt = receivedAt
}

/** Now, on the server's clock, in ms. */
export function serverNow(): number {
    return Date.now() + offset
}
