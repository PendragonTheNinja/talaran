import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import './TallyBoard.css'

// The Tally Board (see apps/server/src/services/tally.ts for the design rule).
//
// Reports every passive job you have running, readable only while standing at the
// board. Traps are deliberately absent and the panel says so, because trapping's
// scavenger penalty is a designed mechanic rather than an oversight.

interface TallyEntry {
    kind: 'field' | 'vat' | 'kiln' | 'pen' | 'fire'
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
    /** First raised first; movesNext marks the one a new board would take. */
    boards: { locationId: number; locationName: string; island: string; here: boolean; movesNext: boolean }[]
    boardCap: number
    entries: TallyEntry[]
    readyCount: number
    licence?: {
        boardNumber: number
        cost: number
        totalLevelRequired: number
        totalLevel: number
        gold: number
        canBuy: boolean
        reason?: string
    }
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


/**
 * Buying room for another board.
 *
 * Shown only when the player is already at their limit, because that is the
 * only moment the offer answers a question they are asking. A price list
 * hanging over someone with spare room is noise.
 *
 * The refusal states the actual shortfall — the level they need against the
 * level they have, or the price against their purse — since "you cannot buy
 * this" without a number is the kind of message players write forum posts
 * about.
 */
function Licence({ report, busy, onBought }: {
    report: TallyReport
    busy: boolean
    onBought: () => void
}) {
    const [buying, setBuying] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const licence = report.licence
    if (!licence) return null
    // Room to spare: nothing to sell them yet.
    if (report.boards.length < report.boardCap) return null

    const buy = async () => {
        setBuying(true)
        setError(null)
        try {
            await apiFetch('/api/tally/licence', { method: 'POST' })
            onBought()
        } catch (err: any) {
            setError(err.message || 'Could not buy that licence.')
        } finally {
            setBuying(false)
        }
    }

    return (
        <div className="tally-licence">
            <p className="tally-licence-line">
                Room for {licence.boardNumber === 2 ? 'a second' : `a ${ordinal(licence.boardNumber)}`} board
                costs <span className="gold-text">{licence.cost.toLocaleString()} gold</span>
                {' '}and a total level of {licence.totalLevelRequired} outside combat.
            </p>
            {licence.canBuy ? (
                <button className="btn btn-gold" onClick={buy} disabled={buying || busy}>
                    {buying ? 'Buying…' : `Buy licence (${licence.cost.toLocaleString()}g)`}
                </button>
            ) : (
                <p className="muted-text tally-licence-why">{licence.reason}</p>
            )}
            {error && <p className="tally-licence-error">{error}</p>}
        </div>
    )
}
const KIND_MARK: Record<TallyEntry['kind'], string> = {
    field: '❧',
    vat: '◍',
    kiln: '▲',
    pen: '⌂',
    fire: '✺',
}

/** "2nd", "3rd", "11th". */
function ordinal(n: number): string {
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th'
        : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
    return `${n}${suffix}`
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
                        <p>{report.boards.length === 1 ? 'Your tally board stands at:' : 'Your boards stand at, first raised first:'}</p>
                        <ol className="tally-board-list">
                            {report.boards.map(b => (
                                <li key={b.locationId}>
                                    <span className="gold-text">{b.locationName}</span>
                                    {b.movesNext && <span className="muted-text"> (moves if you raise one here)</span>}
                                </li>
                            ))}
                        </ol>
                        <p className="muted-text">
                            A board is a board. You will have to go and look at one.
                        </p>
                        <p className="muted-text tally-cap">
                            {report.boards.length} of {report.boardCap} raised
                            {report.build && !report.build.atCapacity
                                ? ' — you have room for another.'
                                : ' — raising one here would move your oldest.'}
                        </p>
                        <Licence report={report} busy={busy} onBought={load} />
                        <Raise
                            report={report}
                            busy={busy}
                            onRaise={raise}
                            relocating={!!report.build?.wouldRelocate}
                        />
                    </div>
                ) : (
                    <>
                        <Report report={report} />
                        <TearDown busy={busy} setBusy={setBusy} setError={setError} onDone={onClose} />
                    </>
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

/** Take down the board where you stand: the materials come back, no XP. */
function TearDown({ busy, setBusy, setError, onDone }: {
    busy: boolean
    setBusy: (b: boolean) => void
    setError: (e: string | null) => void
    onDone: () => void
}) {
    const [asking, setAsking] = useState(false)
    const [note, setNote] = useState<string | null>(null)
    const go = async () => {
        setBusy(true)
        setError(null)
        try {
            const res = await apiFetch<{ message: string }>('/api/tally/teardown', { method: 'POST' })
            setNote(res.message)
            window.dispatchEvent(new CustomEvent('talaran:notice', { detail: { message: res.message, type: 'success' } }))
            onDone()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The board would not come down.')
        } finally {
            setBusy(false)
            setAsking(false)
        }
    }
    if (note) return <p className="muted-text">{note}</p>
    return (
        <div className="tally-teardown">
            {asking ? (
                <>
                    <span className="muted-text">Take this board down? Its planks and nails come back to you.</span>
                    <button className="btn btn-gold" disabled={busy} onClick={go}>Take it down</button>
                    <button className="btn" disabled={busy} onClick={() => setAsking(false)}>Leave it</button>
                </>
            ) : (
                <button className="btn" disabled={busy} onClick={() => setAsking(true)}>Take this board down</button>
            )}
        </div>
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
                    You have as many boards as your licences allow, so this one moves your
                    oldest{report.boards[0] ? `, at ${report.boards[0].locationName},` : ''} rather than adding to it.
                    The materials are owed either way.
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
