import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

// What a player standing on an islet can do (server services/voyages.ts):
// sail on to another, while the voyage has landings left, or sail home.
// The server decides; this only draws what it is sent.

export interface VoyageState {
    onIslet: boolean
    atPort: boolean
    voyage: { boat: string; home: string; landings: number; landingsLeft: number } | null
    islets: { found: boolean; name: string | null; kind: string | null; landings: number }[]
}

export default function IsletActions({ locationId, busy, onVoyage }: {
    /** Re-read when the player lands somewhere else. */
    locationId: number | undefined
    busy: boolean
    /** 'on' or 'home' (GameLayout's handleVoyage). */
    onVoyage: (what: string) => void
}) {
    const [state, setState] = useState<VoyageState | null>(null)

    useEffect(() => {
        void apiFetch<VoyageState>('/api/voyages').then(setState).catch(() => setState(null))
    }, [locationId])

    const v = state?.voyage
    const found = state?.islets.filter(i => i.found).length ?? 0
    return (
        <>
            {v && (
                <p className="muted-text">
                    {v.landingsLeft > 0
                        ? `Your ${v.boat} can make ${v.landingsLeft} more landing${v.landingsLeft === 1 ? '' : 's'} before she must make port at ${v.home}.`
                        : `The casks are low. Your ${v.boat} must make port at ${v.home}.`}
                    {state && ` Islets found: ${found} of ${state.islets.length}.`}
                </p>
            )}
            <button className="location-action-btn" disabled={busy || !v || v.landingsLeft < 1} onClick={() => onVoyage('on')}>
                Sail On →
            </button>
            <button className="location-action-btn" disabled={busy || !v} onClick={() => onVoyage('home')}>
                Sail Home →
            </button>
        </>
    )
}
