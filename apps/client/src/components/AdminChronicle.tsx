import { useState, useEffect, useCallback } from 'react'
import { apiFetch, apiUrl } from '../lib/api'
import './AdminChronicle.css'

/**
 * The Chronicle tab (docs/chronicle-spec.md §14, step 1): the raw deed journal,
 * one game day at a time, and an export of a range of days for tuning; and
 * Wenna's page for the chosen day (step 2). Nothing here is player-facing.
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

interface PageLine { section: string; text: string; struck?: boolean }
interface PreviewLine { section: string; text: string; deedKind: string | null }
interface ScoredDeed { id: number; kind: string; section: string; player: string | null; guild: string | null; subject: string | null; score: number; told: boolean }
interface PageData {
    day: string
    today: string
    yesterday: string
    enabled: boolean
    written: { title: string; composedAt: string | null; lines: PageLine[] } | null
    preview: { title: string; lines: PreviewLine[]; thin: string[]; scored: ScoredDeed[]; quiet: boolean }
    verses: { kind: string; verses: number; target: number }[]
    todaySoFar: string[]
}

const SECTION_LABEL: Record<string, string> = {
    heading: '', headline: 'Headline', island: 'Around the island', guilds: 'From the guilds',
    fallen: 'Of the fallen', maker: 'Word from the Maker', quiet: '', roll: 'The long roll', rumour: 'A rumor', signoff: '',
}

/** A page's lines under their section names, each name once. */
function PageText({ lines }: { lines: { section: string; text: string; struck?: boolean }[] }) {
    return (
        <div className="chron-page">
            {lines.map((l, i) => {
                const head = SECTION_LABEL[l.section] && l.section !== lines[i - 1]?.section ? SECTION_LABEL[l.section] : null
                return (
                    <div key={i}>
                        {head && <p className="chron-page-section">{head}</p>}
                        <p className={`chron-page-line chron-line-${l.section}${l.struck ? ' struck' : ''}`}>{l.text}</p>
                    </div>
                )
            })}
        </div>
    )
}

/**
 * Wenna's page for the chosen day (step 2): as written, and the dry run of
 * what she would write from its deeds now, with every deed's score. Writing
 * each midnight stays off until it is switched on here.
 */
function PageCard({ day }: { day: string }) {
    const [data, setData] = useState<PageData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [showScores, setShowScores] = useState(false)

    const load = useCallback(() => {
        apiFetch<PageData>(`/api/admin/chronicle/page?day=${day}`)
            .then(d => { setData(d); setError(null) })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load the page.'))
    }, [day])
    useEffect(() => { load() }, [load])

    const post = async (path: string, body: object) => {
        setBusy(true)
        try {
            await apiFetch(`/api/admin/chronicle/${path}`, { method: 'POST', body: JSON.stringify(body) })
            load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    if (!data) return <div className="admin-action-card"><p className="chron-admin-note">{error ?? 'Reading the page…'}</p></div>
    const over = data.day < data.today

    return (
        <div className="admin-action-card">
            <p className="admin-section-title">🍺 Wenna's Page: {data.day}</p>
            {error && <p className="guild-error">{error}</p>}
            <label className="chron-admin-check">
                <input type="checkbox" checked={data.enabled} disabled={busy} onChange={e => post('settings', { enabled: e.target.checked })} />
                Write a page every midnight (and catch up on missed days)
            </label>
            {!data.enabled && (
                <p className="chron-admin-note">Off: no page is written, so nothing is frozen while the weights and verses are tuned. The dry run below works either way.</p>
            )}

            {data.day === data.today && data.todaySoFar.length > 0 && (
                <>
                    <p className="chron-page-section">Today so far, as Wenna tells it in the tavern (no names)</p>
                    {data.todaySoFar.map((t, i) => <p key={i} className="chron-page-line">{t}</p>)}
                </>
            )}

            <div className="chron-page-cols">
                <div>
                    <p className="chron-page-section">{data.written ? 'As written' : 'Not written yet'}</p>
                    {data.written
                        ? <PageText lines={data.written.lines} />
                        : <p className="chron-admin-note">{over ? 'This day is over and has no page.' : 'A page is written once the day is over.'}</p>}
                    {over && (
                        <button className="btn btn-gold" disabled={busy} onClick={() => post('write', { day: data.day, again: !!data.written })}>
                            {data.written ? 'Write it again' : 'Write this page now'}
                        </button>
                    )}
                    {data.written && <p className="chron-admin-note">Writing again replaces the page. Do that only before players can read the book.</p>}
                </div>
                <div>
                    <p className="chron-page-section">Dry run (saved nowhere)</p>
                    <PageText lines={data.preview.lines} />
                    {data.preview.thin.length > 0 && (
                        <p className="chron-admin-note">More verses wanted for: {data.preview.thin.join(', ')}</p>
                    )}
                </div>
            </div>

            <button className="btn" onClick={() => setShowScores(!showScores)}>
                {showScores ? 'Hide' : 'Show'} the scores ({data.preview.scored.length} deeds)
            </button>
            {showScores && (
                <div className="chron-admin-table-wrap">
                    <table className="chron-admin-table">
                        <thead><tr><th>Score</th><th>Told</th><th>Kind</th><th>Who</th><th>About</th></tr></thead>
                        <tbody>
                            {data.preview.scored.map(d => (
                                <tr key={d.id}>
                                    <td className="tabular-num">{d.score}</td>
                                    <td>{d.told ? '✓' : ''}</td>
                                    <td>{d.kind}</td>
                                    <td>{d.player ?? (d.guild ? `[${d.guild}]` : '')}</td>
                                    <td>{d.subject ?? ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="chron-page-section">Verses by kind (edit them in the content browser: Chronicle Verses)</p>
            <div className="chron-admin-kinds">
                {data.verses.map(v => (
                    <span key={v.kind} className={`chron-admin-kind ${v.verses < v.target ? 'thin' : ''}`} title={`${v.verses} of the ${v.target} wanted`}>
                        {v.kind} <span className="tabular-num">{v.verses}/{v.target}</span>
                    </span>
                ))}
            </div>
        </div>
    )
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

            <PageCard day={data.dayKey} />

            <div className="admin-action-card">
                <p className="admin-section-title">📜 The Deed Journal</p>
                <p className="chron-admin-note">
                    Everything the game has noted for Wenna, by game day. Pick a day to see its page above.
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
