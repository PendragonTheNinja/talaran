import { useState, useEffect, useCallback } from 'react'
import { apiFetch, apiUrl } from '../lib/api'
import './AdminChronicle.css'

/**
 * The Chronicle tab (docs/chronicle-spec.md §14, step 1): the raw deed journal,
 * one game day at a time, and an export of a range of days for tuning. Nothing
 * here is player-facing; the pages Wenna writes come in step 2.
 */

interface Deed {
    id: number
    dayKey: string
    kind: string
    player: string | null
    playerId: number | null
    guild: string | null
    subject: string | null
    data: Record<string, unknown>
    at: string
}

interface DayData {
    dayKey: string
    total: number
    byKind: { kind: string; label: string; n: number }[]
    deeds: Deed[]
    days: { dayKey: string; n: number }[]
}

/** The deed's numbers and names as one short line: "place: Lanaivale · quantity: 1". */
function detailLine(data: Record<string, unknown>): string {
    return Object.entries(data)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' · ')
}

function timeOf(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function AdminChronicle() {
    const [day, setDay] = useState<string | null>(null)
    const [data, setData] = useState<DayData | null>(null)
    const [kind, setKind] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')
    const [exporting, setExporting] = useState(false)

    const load = useCallback((which: string | null) => {
        apiFetch<DayData>(`/api/admin/chronicle/deeds${which ? `?day=${which}` : ''}`)
            .then(d => {
                setData(d)
                setError(null)
                if (!which) { setFrom(d.dayKey); setTo(d.dayKey) }
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load the journal.'))
    }, [])

    useEffect(() => { load(day) }, [day, load])

    // A CSV is a download, not JSON, so it is fetched with the token by hand and
    // handed to the browser as a file.
    const exportCsv = async () => {
        setExporting(true)
        try {
            const token = localStorage.getItem('talaran_token')
            const res = await fetch(apiUrl(`/api/admin/chronicle/export?from=${from}&to=${to}`), {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error || `Export failed (${res.status}).`)
            }
            const blob = await res.blob()
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `chronicle-deeds-${from}-to-${to}.csv`
            link.click()
            URL.revokeObjectURL(link.href)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed.')
        } finally {
            setExporting(false)
        }
    }

    if (!data) return <div className="admin-chronicle"><p className="chron-admin-note">{error ?? 'Loading the journal…'}</p></div>

    const shown = kind ? data.deeds.filter(d => d.kind === kind) : data.deeds

    return (
        <div className="admin-chronicle">
            {error && <p className="guild-error">{error}</p>}

            <div className="admin-action-card">
                <p className="admin-section-title">📜 The Deed Journal</p>
                <p className="chron-admin-note">
                    Everything the game has noted for Wenna, by game day. Nothing is sung yet: the pages
                    come in the next step, built from what collects here.
                </p>
                <div className="chron-admin-days">
                    {data.days.length === 0 && <span className="chron-admin-note">No deeds yet.</span>}
                    {data.days.map(d => (
                        <button
                            key={d.dayKey}
                            className={`chron-admin-day ${d.dayKey === data.dayKey ? 'active' : ''}`}
                            onClick={() => { setKind(null); setDay(d.dayKey) }}
                        >
                            {d.dayKey} <span className="tabular-num">({d.n})</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="admin-action-card">
                <p className="admin-section-title">📊 {data.dayKey}: {data.total.toLocaleString()} deeds</p>
                <div className="chron-admin-kinds">
                    <button className={`chron-admin-kind ${kind === null ? 'active' : ''}`} onClick={() => setKind(null)}>
                        All <span className="tabular-num">{data.total}</span>
                    </button>
                    {data.byKind.map(k => (
                        <button
                            key={k.kind}
                            className={`chron-admin-kind ${kind === k.kind ? 'active' : ''}`}
                            onClick={() => setKind(kind === k.kind ? null : k.kind)}
                            title={k.kind}
                        >
                            {k.label} <span className="tabular-num">{k.n}</span>
                        </button>
                    ))}
                </div>
                {shown.length === 0
                    ? <p className="chron-admin-note">Nothing noted on this day.</p>
                    : (
                        <div className="chron-admin-table-wrap">
                            <table className="chron-admin-table">
                                <thead>
                                    <tr><th>Time</th><th>Kind</th><th>Who</th><th>About</th><th>Details</th></tr>
                                </thead>
                                <tbody>
                                    {shown.map(d => (
                                        <tr key={d.id}>
                                            <td className="tabular-num">{timeOf(d.at)}</td>
                                            <td>{d.kind}</td>
                                            <td>{d.player ?? (d.guild ? `[${d.guild}]` : '')}</td>
                                            <td>{d.subject ?? ''}</td>
                                            <td className="chron-admin-detail">{detailLine(d.data)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>

            <div className="admin-action-card">
                <p className="admin-section-title">⬇️ Export</p>
                <p className="chron-admin-note">The journal between two game days, as a CSV file, for tuning the weights.</p>
                <div className="chron-admin-export">
                    <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
                    <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
                    <button className="btn btn-gold" onClick={exportCsv} disabled={exporting || !from || !to}>
                        {exporting ? 'Exporting…' : 'Export deeds'}
                    </button>
                </div>
            </div>
        </div>
    )
}
