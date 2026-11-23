import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import ErrorLine from './ErrorLine'

// The admin panel's Islet Names tab: names players have put to the Harbor
// Council, to choose or turn down (server services/isletNames.ts,
// routes/adminIsletNames.ts). Choosing one names the islet and tells everyone;
// turning one down opens the islet to the next player to land. These are alpha
// names: 1.0 clears them.

interface Proposal {
    id: number; name: string; note: string | null; status: 'pending' | 'approved' | 'rejected'; reason: string | null
    created_at: string; decided_at: string | null; islet: string; island: string; player: string; decided_by: string | null
}
interface Named { islet: string; island: string; name: string; named_by: string | null; named_at: string }

const when = (t: string | null) => (t ? new Date(t).toLocaleString() : '')

function Waiting({ p, onDone }: { p: Proposal; onDone: () => void }) {
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const decide = async (approve: boolean) => {
        setBusy(true); setErr(null)
        try {
            await apiFetch(`/api/admin/islet-names/${p.id}/decide`, { method: 'POST', body: JSON.stringify({ approve, reason }) })
            onDone()
        } catch (e) {
            setErr((e as Error).message || 'Could not decide.')
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="aq-stage">
            <p><strong>{p.name}</strong> for {p.islet} ({p.island}), from {p.player}, {when(p.created_at)}</p>
            {p.note && <p className="aq-note">"{p.note}"</p>}
            <input className="aq-input" placeholder="A word to the player (optional; shown if turned down)" value={reason} onChange={e => setReason(e.target.value)} />
            <div className="aq-field-row">
                <button className="btn btn-gold" disabled={busy} onClick={() => decide(true)}>Choose it</button>
                <button className="btn" disabled={busy} onClick={() => decide(false)}>Turn it down</button>
            </div>
            <ErrorLine message={err} className="aq-error" />
        </div>
    )
}

export default function AdminIsletNames() {
    const [data, setData] = useState<{ proposals: Proposal[]; named: Named[] } | null>(null)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(() => {
        apiFetch<{ proposals: Proposal[]; named: Named[] }>('/api/admin/islet-names')
            .then(setData)
            .catch(e => setError((e as Error).message || 'Could not load.'))
    }, [])
    useEffect(() => { load() }, [load])

    if (error) return <ErrorLine message={error} className="aq-error" />
    if (!data) return <p className="aq-note">Loading…</p>
    const waiting = data.proposals.filter(p => p.status === 'pending')
    const decided = data.proposals.filter(p => p.status !== 'pending')

    return (
        <div className="aq-editor">
            <div className="admin-action-card">
                <p className="admin-section-title">🏝️ Waiting for the council ({waiting.length})</p>
                {waiting.length === 0 && <p className="aq-note">No names are waiting.</p>}
                {waiting.map(p => <Waiting key={p.id} p={p} onDone={load} />)}
            </div>
            <div className="admin-action-card">
                <p className="admin-section-title">🗺️ Named islets ({data.named.length})</p>
                {data.named.length === 0 && <p className="aq-note">None yet.</p>}
                {data.named.map(n => (
                    <p key={`${n.island}-${n.islet}`}>{n.name} <span className="aq-note">(charted as {n.islet}, {n.island}; put by {n.named_by ?? 'someone gone'}, {when(n.named_at)})</span></p>
                ))}
                <p className="aq-note">These are alpha names. 1.0 clears them and gives each islet its final name.</p>
            </div>
            <div className="admin-action-card">
                <p className="admin-section-title">📜 Decided</p>
                {decided.length === 0 && <p className="aq-note">Nothing yet.</p>}
                {decided.map(p => (
                    <p key={p.id}>
                        {p.status === 'approved' ? '✅' : '❌'} {p.name} for {p.islet}, from {p.player}
                        <span className="aq-note"> · {p.decided_by ?? 'staff'}, {when(p.decided_at)}{p.reason ? ` · "${p.reason}"` : ''}</span>
                    </p>
                ))}
            </div>
        </div>
    )
}
