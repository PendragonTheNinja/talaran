import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import './TallyBoard.css'

// The Tally Board (see apps/server/src/services/tally.ts for the design rule).
//
// Reports every passive job you have running, readable only while standing at the
// board. Traps are deliberately absent and the panel says so, because trapping's
// scavenger penalty is a designed mechanic rather than an oversight.

interface TallyEntry {
    kind: 'field' | 'vat' | 'kiln' | 'pen'
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
    boards: { locationId: number; locationName: string; island: string; here: boolean }[]
    boardCap: number
    entries: TallyEntry[]
    readyCount: number
    build?: {
        carpentryRequired: number
        seconds: number
        cost: { itemName: string; qty: number }[]
        missing: { itemName: string; qty: number; have: number }[]
        canBuild: boolean
        wouldRelocate: boolean
        atCapacity: boolean
    }
}

const KIND_MARK: Record<TallyEntry['kind'], string> = {
    field: '❧',
    vat: '◍',
    kiln: '▲',
    pen: '⌂',
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
                            {report.boards.length === 1 ? 'Your tally board stands at ' : 'Your boards stand at '}
                            {report.boards.map((b, i) => (
                                <span key={b.locationId}>
                                    {i > 0 && (i === report.boards.length - 1 ? ' and ' : ', ')}
                                    <span className="gold-text">{b.locationName}</span>
                                </span>
                            ))}
                            .
                        </p>
                        <p className="muted-text">
                            A board is a board. You will have to go and look at one.
                        </p>
                        <p className="muted-text tally-cap">
                            {report.boards.length} of {report.boardCap} raised
                            {report.build && !report.build.atCapacity
                                ? ' — you have room for another.'
                                : ' — raising one here would move your oldest.'}
                        </p>
                        <Raise
                            report={report}
                            busy={busy}
                            onRaise={raise}
                            relocating={!!report.build?.wouldRelocate}
                        />
                    </div>
                ) : (
                    <Report report={report} />
                )}
            </div>
        </div>
    )
}

/** Groups entries by town, preserving the ready-first order within each. */
function byPlace(entries: TallyEntry[]): { where: string; island: string; rows: TallyEntry[] }[] {
    const groups: { where: string; island: string; rows: TallyEntry[] }[] = []
    for (const e of entries) {
        const found = groups.find(g => g.where === e.where)
        if (found) found.rows.push(e)
        else groups.push({ where: e.where, island: e.island, rows: [e] })
    }
    return groups
}

/**
 * Chalk strokes: four uprights and a slash through them for each five, the way
 * anyone actually keeps a tally. Deliberately built from ❙ and / rather than the
 * Unicode counting-rod glyphs (U+1D377..), which almost no font ships and which
 * render as empty boxes.
 */
function tallyStrokes(n: number): string {
    if (n <= 0) return ''
    const capped = Math.min(n, 25)                 // past a point it is just noise
    const gates = Math.floor(capped / 5)
    const rest = capped % 5
    const parts: string[] = []
    for (let i = 0; i < gates; i++) parts.push('❙❙❙❙/')
    if (rest > 0) parts.push('❙'.repeat(rest))
    return parts.join(' ')
}

function Report({ report }: { report: TallyReport }) {
    const working = report.entries.filter(e => e.status !== 'idle')
    const idle = report.entries.filter(e => e.status === 'idle')

    return (
        <>
            <div className={`tally-summary ${report.readyCount > 0 ? 'has-ready' : ''}`}>
                {report.readyCount > 0 && (
                    <span className="tally-strokes" aria-hidden="true">{tallyStrokes(report.readyCount)}</span>
                )}
                <span className="tally-summary-text">
                    {report.entries.length === 0
                        ? 'Nothing of yours is working. A clean slate, or a wasted one.'
                        : report.readyCount > 0
                            ? `${report.readyCount} ${report.readyCount === 1 ? 'thing is' : 'things are'} ready.`
                            : 'Everything is still working.'}
                </span>
            </div>

            {byPlace(working).map(group => (
                <div key={`g${group.where}`} className="tally-group">
                    <div className="tally-place">
                        <span className="tally-place-name">{group.where}</span>
                        {group.island && <span className="tally-place-island">{group.island}</span>}
                    </div>

                    {group.rows.map((e, i) => (
                        <div key={`w${i}`} className={`tally-row ${e.status} kind-${e.kind}`}>
                            <span className="tally-mark">{KIND_MARK[e.kind]}</span>

                            <span className="tally-main">
                                <span className="tally-what">{e.what}</span>
                                <span className="tally-detail muted-text">{e.detail}</span>
                            </span>

                            <span className={`tally-when ${e.status}`}>
                                {e.status === 'ready' ? 'Ready' : untilText(e.readyAt)}
                            </span>
                        </div>
                    ))}
                </div>
            ))}

            {idle.length > 0 && (
                <>
                    <p className="tally-subhead">Standing idle</p>
                    {idle.map((e, i) => (
                        <div key={`i${i}`} className={`tally-row idle kind-${e.kind}`}>
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
                    You have as many boards as your Carpentry allows, so this one moves your
                    oldest rather than adding to it. The materials are owed either way.
                </p>
            )}
            {!relocating && report.hasBoard && (
                <p className="muted-text tally-relocate-note">
                    This will be an additional board. The ones you have already raised stay
                    where they are.
                </p>
            )}
        </div>
    )
}
