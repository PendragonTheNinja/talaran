import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getSocket } from '../lib/socket'

// Doorways open where the player stands (Portal; server: services/spells.ts).
// Anyone here may step through while one holds. Stepping through leaves the
// way travel does; the server's 'stepped' push moves the game view.

interface Door { id: number; destination: string; caster: string; closesAt: string; mine: boolean }

export default function PortalDoors({ locationId }: { locationId: number | undefined }) {
    const [doors, setDoors] = useState<Door[]>([])
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [now, setNow] = useState(() => Date.now())

    const load = useCallback(() => {
        apiFetch<{ portals: Door[] }>('/api/talar/portals/here')
            .then(d => setDoors(d.portals))
            .catch(() => setDoors([]))
    }, [])

    // Remounted per place (keyed by the location panel), so an old error never carries over.
    useEffect(() => { load() }, [locationId, load])

    // A doorway opened here by anyone, pushed to everyone at the place.
    useEffect(() => {
        const socket = getSocket()
        if (!socket) return
        const onChanged = () => load()
        socket.on('portals_changed', onChanged)
        return () => { socket.off('portals_changed', onChanged) }
    }, [load])

    // Doorways close on their own; the clock drops them from the list.
    useEffect(() => {
        if (!doors.length) return
        const t = setInterval(() => setNow(Date.now()), 15_000)
        return () => clearInterval(t)
    }, [doors.length])

    const open = doors.filter(d => new Date(d.closesAt).getTime() > now)
    if (!open.length) return null

    const step = async (door: Door) => {
        setBusy(true)
        setError(null)
        try {
            await apiFetch(`/api/talar/portals/${door.id}/step`, { method: 'POST' })
        } catch (err) {
            setError((err as { message?: string }).message || 'The doorway will not let you through.')
            load()
        } finally { setBusy(false) }
    }

    return (
        <>
            {open.map(d => {
                const mins = Math.max(1, Math.ceil((new Date(d.closesAt).getTime() - now) / 60000))
                return (
                    <button key={d.id} className="location-action-btn portal-door" disabled={busy} onClick={() => step(d)}
                        title={`Opened by ${d.mine ? 'you' : d.caster}. Closes in about ${mins} minute${mins === 1 ? '' : 's'}.`}>
                        Doorway to {d.destination} →
                        <span className="portal-door-meta">{d.mine ? 'yours' : d.caster} · {mins} min</span>
                    </button>
                )
            })}
            {error && <p className="farm-error">{error}</p>}
        </>
    )
}
