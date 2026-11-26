import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import ErrorLine from './ErrorLine'
import './IsletActions.css'

// What a player standing on an islet can do (server services/voyages.ts):
// sail on to another, while the voyage has landings left, or sail home; and,
// on an unnamed islet, put a name to the Harbor Council (services/isletNames.ts).
// The server decides; this only draws what it is sent.

export interface IsletNaming {
    islet: string
    givenName: string | null
    namedBy: string | null
    status: 'named' | 'pending' | 'yours' | 'held'
    yourPending: string | null
    nameMin: number
    nameMax: number
    noteMax: number
}

export interface NameNews { id: number; islet: string; name: string; status: 'approved' | 'rejected'; reason: string | null }

export interface VoyageState {
    naming: IsletNaming | null
    nameNews: NameNews[]
    onIslet: boolean
    atPort: boolean
    voyage: { boat: string; home: string; landings: number; landingsLeft: number } | null
    islets: { found: boolean; name: string | null; standingName: string | null; kind: string | null; landings: number }[]
}

/** Word from the council on names this player put to them, until it is read. */
export function NameNewsLines({ news, onSeen }: { news: NameNews[]; onSeen: () => void }) {
    if (!news.length) return null
    return (
        <div className="muted-text">
            {news.map(n => (
                <p key={n.id}>
                    {n.status === 'approved'
                        ? `The Harbor Council chose your name: ${n.islet} is now ${n.name} on the charts.`
                        : `The Harbor Council turned down "${n.name}" for ${n.islet}.${n.reason ? ` Their word: ${n.reason}` : ''} The next to land there may put a name.`}
                </p>
            ))}
            <button className="btn" onClick={() => { void apiFetch('/api/voyages/name-news/seen', { method: 'POST' }).then(onSeen).catch(() => {}) }}>
                Noted
            </button>
        </div>
    )
}

function NamingBox({ naming, onDone }: { naming: IsletNaming; onDone: () => void }) {
    const [name, setName] = useState('')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [said, setSaid] = useState<string | null>(null)

    if (naming.status === 'named') return null
    if (naming.status === 'pending') {
        return <p className="muted-text">{naming.yourPending
            ? `Your name, ${naming.yourPending}, is before the Harbor Council.`
            : 'Someone has put a name for this islet to the Harbor Council.'}</p>
    }
    if (naming.status === 'held') {
        return <p className="muted-text">This islet has no name yet. Someone who landed before you may put one to the Harbor Council while they are here.</p>
    }
    const put = async () => {
        setBusy(true); setErr(null)
        try {
            const r = await apiFetch<{ message: string }>('/api/voyages/name', { method: 'POST', body: JSON.stringify({ name, note }) })
            setSaid(r.message)
            onDone()
        } catch (e) {
            setErr((e as Error).message || 'The council could not take that.')
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="islet-naming">
            <p className="muted-text">This islet has no name. You landed first, so you may put one to the Harbor Council, but only while you are here.</p>
            <input className="chat-input" placeholder={`A name, ${naming.nameMin} to ${naming.nameMax} letters`} maxLength={naming.nameMax}
                value={name} onChange={e => setName(e.target.value)} />
            <input className="chat-input" placeholder="Why this name? (for the council, optional)" maxLength={naming.noteMax}
                value={note} onChange={e => setNote(e.target.value)} />
            <button className="btn btn-gold" disabled={busy || name.trim().length < naming.nameMin} onClick={put}>
                Put It to the Council
            </button>
            <ErrorLine message={err} className="guild-error" />
            {said && <p className="muted-text">{said}</p>}
        </div>
    )
}

export default function IsletActions({ locationId, busy, onVoyage }: {
    /** Re-read when the player lands somewhere else. */
    locationId: number | undefined
    busy: boolean
    /** 'on' or 'home' (GameLayout's handleVoyage). */
    onVoyage: (what: string) => void
}) {
    const [state, setState] = useState<VoyageState | null>(null)

    const load = useCallback(() => {
        void apiFetch<VoyageState>('/api/voyages').then(setState).catch(() => setState(null))
    }, [])
    useEffect(() => { load() }, [locationId, load])

    const v = state?.voyage
    const found = state?.islets.filter(i => i.found).length ?? 0
    return (
        <>
            {state && <NameNewsLines news={state.nameNews} onSeen={load} />}
            {state?.naming && <NamingBox naming={state.naming} onDone={load} />}
            {v && (
                <p className="muted-text">
                    {v.landingsLeft > 0
                        ? `Your ${v.boat} can make ${v.landingsLeft} more landing${v.landingsLeft === 1 ? '' : 's'} before she must make port at ${v.home}.`
                        : `The casks are low. Your ${v.boat} must make port at ${v.home}.`}
                    {state && ` Islets found: ${found} of ${state.islets.length}.`}
                </p>
            )}
            <button className="location-action-btn" disabled={busy || !v || v.landingsLeft < 1} onClick={() => onVoyage('on')}>
                Sail On
            </button>
            <button className="location-action-btn" disabled={busy || !v} onClick={() => onVoyage('home')}>
                Sail Home
            </button>
        </>
    )
}
