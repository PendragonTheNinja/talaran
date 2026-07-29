import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import './TallyBoard.css'

// The Tally Board (see apps/server/src/services/tally.ts for the design rule).
//
// Reports every passive job you have running, readable only while standing at the
// board. Traps are deliberately absent and the panel says so, because trapping's
// scavenger penalty is a designed mechanic rather than an oversight.

interface TallyEntry {
    kind: 'field' | 'vat' | 'kiln'
    what: string
    where: string
    island: string
    status: 'ready' | 'working' | 'idle'
    readyAt: string | null
    detail: string
}

interface TallyReport {
    hasBoard: boolean
    boardLocationName: string | null
    atBoard: boolean
    entries: TallyEntry[]
    readyCount: number
    build?: {
        carpentryRequired: number
        seconds: number
        cost: { itemName: string; qty: number }[]
        missing: { itemName: string; qty: number; have: number }[]
        canBuild: boolean
        wouldRelocate: boolean
    }
}

const KIND_MARK: Record<TallyEntry['kind'], string> = {
    field: '❧',
    vat: '◍',
    kiln: '▲',
}

function untilText(readyAt: string | null): string {
    if (!readyAt) return ''
    const ms = new Date(readyAt).getTime() - Date.now()
    if (ms <= 0) return 'ready'

    const mins = Math.ceil(ms / 60000)
    if (mins < 60) return `${mins}m`

    const hours = Math.floor(mins / 60)
    const rem = mins % 60
    return rem ? `${hours}h ${rem}m` : `${hours}h`
}

export default function TallyBoardPanel({ onClose }: { onClose: () => void }) {
    const [report, setReport] = useState<TallyReport | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [, setTick] = useState(0)

    const load = useCallback(async () => {
        try {
            setReport(await apiFetch<TallyReport>('/api/tally'))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The board could not be read.')
        }
    }, [])

    useEffect(() => { load() }, [load])

    // Re-render each minute so the countdowns stay honest without refetching.
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60000)
        return () => clearInterval(id)
    }, [])

    const raise = async () => {
        setBusy(true)
        setError(null)
        try {
            await apiFetch('/api/tally/build', { method: 'POST' })
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The board could not be raised.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="tally-overlay" onClick={onClose}>
            <div className="tally-modal" onClick={e => e.stopPropagation()}>
                <div className="tally-header">
                    <h2 className="gold-text">Tally Board</h2>
                    <button className="tally-close" onClick={onClose}>✕</button>
                </div>

                {error && <p className="guild-error">{error}</p>}

                {!report ? (
                    <p className="muted-text">Reading the board…</p>
                ) : !report.hasBoard ? (
                    <Raise report={report} busy={busy} onRaise={raise} />
                ) : !report.atBoard ? (
                    <div className="tally-elsewhere">
                        <p>
                            Your tally board stands at{' '}
                            <span className="gold-text">{report.boardLocationName}</span>.
                        </p>
                        <p className="muted-text">
                            A board is a board. You will have to go and look at it.
                        </p>
                        <Raise report={report} busy={busy} onRaise={raise} relocating />
                    </div>
                ) : (
                    <Report report={report} />
                )}
            </div>
        </div>
    )
}

function Report({ report }: { report: TallyReport }) {
    const working = report.entries.filter(e => e.status !== 'idle')
    const idle = report.entries.filter(e => e.status === 'idle')

    return (
        <>
            <p className="tally-summary">
                {report.entries.length === 0
                    ? 'Nothing of yours is working. A clean slate, or a wasted one.'
                    : report.readyCount > 0
                        ? `${report.readyCount} ${report.readyCount === 1 ? 'thing is' : 'things are'} ready.`
                        : 'Everything is still working.'}
            </p>

            {working.map((e, i) => (
                <div key={`w${i}`} className={`tally-row ${e.status}`}>
                    <span className="tally-mark">{KIND_MARK[e.kind]}</span>

                    <span className="tally-main">
                        <span className="tally-what">{e.what}</span>
                        <span className="tally-detail muted-text">{e.detail}</span>
                    </span>

                    <span className="tally-where muted-text">{e.where}</span>

                    <span className={`tally-when ${e.status}`}>
                        {e.status === 'ready' ? 'Ready' : untilText(e.readyAt)}
                    </span>
                </div>
            ))}

            {idle.length > 0 && (
                <>
                    <p className="tally-subhead">Standing idle</p>
                    {idle.map((e, i) => (
                        <div key={`i${i}`} className="tally-row idle">
                            <span className="tally-mark">{KIND_MARK[e.kind]}</span>
                            <span className="tally-main">
                                <span className="tally-what">{e.what}</span>
                                <span className="tally-detail muted-text">{e.detail}</span>
                            </span>
                            <span className="tally-where muted-text">{e.where}</span>
                            <span className="tally-when idle">—</span>
                        </div>
                    ))}
                </>
            )}

            <p className="tally-footnote muted-text">
                Traps are not listed. Nobody is out there watching them, and whatever has
                blundered in will not announce itself. You will have to walk the line.
            </p>
        </>
    )
}

function Raise({
    report, busy, onRaise, relocating,
}: {
    report: TallyReport
    busy: boolean
    onRaise: () => void
    relocating?: boolean
}) {
    const build = report.build
    if (!build) return null

    return (
        <div className="tally-raise">
            {!relocating && (
                <p className="muted-text">
                    A board of your own, and everything you have working written up in one
                    place. You will have to stand here to read it.
                </p>
            )}

            <div className="tally-cost">
                <span className="tally-cost-label">Needs</span>
                <span>Carpentry {build.carpentryRequired}</span>
                {build.cost.map(c => {
                    const short = build.missing.find(m => m.itemName === c.itemName)
                    return (
                        <span key={c.itemName} className={short ? 'tally-short' : undefined}>
                            {c.qty}× {c.itemName}
                            {short ? ` (have ${short.have})` : ''}
                        </span>
                    )
                })}
            </div>

            <button className="btn btn-gold" onClick={onRaise} disabled={busy || !build.canBuild}>
                {busy
                    ? 'Raising…'
                    : relocating
                        ? 'Move it here'
                        : 'Raise a tally board'}
            </button>

            {relocating && (
                <p className="muted-text tally-relocate-note">
                    Moving it costs the materials again. Choose somewhere you actually pass through.
                </p>
            )}
        </div>
    )
}
