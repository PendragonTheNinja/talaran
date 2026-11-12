import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { onSocket } from '../lib/socket'
import { getItemIcon } from '../lib/items'
import './CrierNotice.css'
import ErrorLine from './ErrorLine'

/**
 * The Town Crier's polls on the scene (server services/crierPolls.ts).
 *
 * A poll the player may answer comes to them: this notice, pinned to the top
 * of the scene, when it opens or when they next log in. "Not now" puts it away
 * on every device, and the Crier then stands in Players Here wherever they go
 * (LocationPanel); tapping him sends `talaran:open-crier` and the notice comes
 * back. Answering pays Crier's Chits and the notice and the Crier both go.
 * Once a poll closes, those who answered are shown its results here, once.
 */

type Kind = 'single' | 'multi' | 'scale' | 'rank' | 'points' | 'item' | 'number' | 'text'

interface Option { id: number; label: string; itemName: string | null }
interface Question {
    id: number
    kind: Kind
    prompt: string
    help: string | null
    required: boolean
    settings: {
        maxChoices?: number | null
        scale?: { min: number; max: number; minLabel: string | null; maxLabel: string | null }
        total?: number
        number?: { min: number | null; max: number | null; integer: boolean; unit: string | null }
        maxLength?: number
    }
    allowWriteIn: boolean
    writeInLabel: string | null
    allowComment: boolean
    options: Option[]
}
interface Poll {
    id: number
    title: string
    intro: string | null
    chits: number
    closesAt: string | null
    dismissed: boolean
    questions: Question[]
}
interface OptionResult { id: number; label: string; itemName: string | null; count: number; share: number; avgRank?: number; points?: number; avgPoints?: number }
interface QuestionResult {
    id: number
    kind: Kind
    prompt: string
    settings: Question['settings']
    answered: number
    options: OptionResult[]
    writeInLabel: string | null
    writeIns: number
    mean?: number | null
    median?: number | null
    distribution?: { value: number; count: number }[]
    texts?: number
}
interface Results { id: number; title: string; closedAt: string | null; respondents: number; questions: QuestionResult[] }
interface CrierState { polls: Poll[]; results: Results[]; chits: number }

/** What the player has given for one question so far. */
interface Draft {
    optionId?: number | null
    optionIds?: number[]
    writeIn?: string
    writeInOn?: boolean
    value?: string
    order?: number[]
    points?: Record<number, number>
    text?: string
    comment?: string
    commentOn?: boolean
}

const CHITS = (n: number) => `${n} Crier's Chit${n === 1 ? '' : 's'}`

function closesIn(iso: string | null): string | null {
    if (!iso) return null
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return null
    const h = Math.round(ms / 3_600_000)
    if (h < 1) return 'Closes within the hour'
    if (h < 36) return `Closes in ${h} hour${h === 1 ? '' : 's'}`
    const d = Math.round(h / 24)
    return `Closes in ${d} days`
}

/** The answer as the server reads it (lib/crierPollRules.ts readAnswers). */
function toAnswer(q: Question, d: Draft | undefined): Record<string, unknown> | null {
    if (!d) return null
    const out: Record<string, unknown> = {}
    const writeIn = d.writeInOn && d.writeIn?.trim() ? d.writeIn.trim() : undefined
    if (q.kind === 'single' || q.kind === 'item') {
        if (writeIn) out.writeIn = writeIn
        else if (d.optionId) out.optionId = d.optionId
    }
    if (q.kind === 'multi') {
        out.optionIds = d.optionIds ?? []
        if (writeIn) out.writeIn = writeIn
    }
    if (q.kind === 'scale' || q.kind === 'number') if (d.value !== undefined && d.value !== '') out.value = Number(d.value)
    if (q.kind === 'rank') out.order = d.order ?? q.options.map(o => o.id)
    if (q.kind === 'points' && d.points) out.points = d.points
    if (q.kind === 'text' && d.text?.trim()) out.text = d.text
    if (d.commentOn && d.comment?.trim()) out.comment = d.comment
    return out
}

/** Whether a page has what a required question needs, so Next can say so. */
function isAnswered(q: Question, d: Draft | undefined): boolean {
    if (!d) return q.kind === 'rank'
    const writeIn = !!(d.writeInOn && d.writeIn?.trim())
    switch (q.kind) {
        case 'single': case 'item': return !!d.optionId || writeIn
        case 'multi': return (d.optionIds?.length ?? 0) > 0 || writeIn
        case 'scale': case 'number': return d.value !== undefined && d.value !== ''
        case 'rank': return true
        case 'points': return Object.values(d.points ?? {}).reduce((s, v) => s + v, 0) === (q.settings.total ?? 10)
        case 'text': return !!d.text?.trim()
    }
}

export default function CrierNotice() {
    const [state, setState] = useState<CrierState | null>(null)
    const [forced, setForced] = useState<number | null>(null)
    // The page within the poll on show; a different poll starts at its first.
    const [paging, setPaging] = useState<{ pollId: number | null; page: number }>({ pollId: null, page: 0 })
    const [drafts, setDrafts] = useState<Record<number, Draft>>({})
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [thanks, setThanks] = useState<{ chits: number; total: number } | null>(null)
    const cardRef = useRef<HTMLDivElement>(null)

    // Pushes can come close together (an answer, then the poll closing): only
    // the newest request may set the state, or an older reply undoes a newer.
    const seq = useRef(0)
    const load = useCallback(() => {
        const n = ++seq.current
        apiFetch<CrierState>('/api/crier').then(st => { if (n === seq.current) setState(st) }).catch(() => { })
    }, [])

    useEffect(() => { load() }, [load])
    useEffect(() => onSocket('crier_polls_changed', () => load()), [load])

    // The Crier in Players Here brings the poll back.
    useEffect(() => {
        const onOpen = () => {
            setThanks(null)
            setForced(state?.polls[0]?.id ?? null)
        }
        window.addEventListener('talaran:open-crier', onOpen)
        return () => window.removeEventListener('talaran:open-crier', onOpen)
    }, [state])

    useEffect(() => {
        if (!thanks) return
        const t = setTimeout(() => setThanks(null), 7000)
        return () => clearTimeout(t)
    }, [thanks])

    const polls = state?.polls ?? []
    const poll = polls.find(p => p.id === forced) ?? polls.find(p => !p.dismissed) ?? null
    const results = !poll && !thanks ? state?.results[0] ?? null : null

    const pollId = poll?.id ?? null
    const page = paging.pollId === pollId ? paging.page : 0
    const setPage = (next: (p: number) => number) => {
        setPaging({ pollId, page: next(page) })
        cardRef.current?.scrollTo?.({ top: 0 })
    }

    const setDraft = (qid: number, patch: Partial<Draft>) =>
        setDrafts(d => ({ ...d, [qid]: { ...d[qid], ...patch } }))

    const notNow = async () => {
        if (!poll) return
        setForced(null)
        setState(s => s && { ...s, polls: s.polls.map(p => p.id === poll.id ? { ...p, dismissed: true } : p) })
        await apiFetch(`/api/crier/${poll.id}/dismiss`, { method: 'POST' }).catch(() => { })
    }

    const submit = async () => {
        if (!poll) return
        setBusy(true)
        setError(null)
        try {
            const answers: Record<number, unknown> = {}
            for (const q of poll.questions) {
                const a = toAnswer(q, drafts[q.id])
                if (a) answers[q.id] = a
            }
            const r = await apiFetch<{ chitsAwarded: number; chits: number }>(`/api/crier/${poll.id}/answer`, {
                method: 'POST', body: JSON.stringify({ answers }),
            })
            setThanks({ chits: r.chitsAwarded, total: r.chits })
            setForced(null)
            setState(s => s && { ...s, chits: r.chits, polls: s.polls.filter(p => p.id !== poll.id) })
            window.dispatchEvent(new CustomEvent('talaran:crier-changed'))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The Crier could not take that answer.')
        } finally {
            setBusy(false)
        }
    }

    const closeResults = async () => {
        if (!results) return
        setState(s => s && { ...s, results: s.results.filter(r => r.id !== results.id) })
        await apiFetch(`/api/crier/${results.id}/results-seen`, { method: 'POST' }).catch(() => { })
    }

    if (thanks) {
        return (
            <div className="crier-card crier-notice crier-thanks" role="status">
                <div className="crier-head">
                    <span className="crier-kicker">📯 The Crier thanks you</span>
                    <button className="crier-x" onClick={() => setThanks(null)} aria-label="Close">×</button>
                </div>
                <p className="crier-q">Your answer is in the Crier's book.</p>
                <p className="crier-sub">
                    {thanks.chits > 0 ? <>+{CHITS(thanks.chits)}. </> : null}You hold {CHITS(thanks.total)}.
                </p>
            </div>
        )
    }

    if (results) return <ResultsCard results={results} chits={state?.chits ?? 0} onClose={closeResults} />
    if (!poll) return null

    const q = poll.questions[Math.min(page, poll.questions.length - 1)]
    const last = page >= poll.questions.length - 1
    const d = drafts[q.id]
    const canGoOn = !q.required || isAnswered(q, d)
    const when = closesIn(poll.closesAt)

    return (
        <div className="crier-card crier-notice" role="dialog" aria-label="The Town Crier asks">
            <div className="crier-head">
                <span className="crier-kicker">📯 The Crier asks</span>
                {poll.chits > 0 && <span className="crier-reward" title="Paid when you answer">+{CHITS(poll.chits)}</span>}
                <button className="crier-x" onClick={notNow} title="Not now" aria-label="Not now">×</button>
            </div>
            <div className="crier-body" ref={cardRef}>
            {page === 0 && poll.intro && <p className="crier-intro">{poll.intro}</p>}
            <p className="crier-q">{q.prompt}{!q.required && <span className="crier-optional"> (optional)</span>}</p>
            {q.help && <p className="crier-sub">{q.help}</p>}

            <QuestionInput q={q} d={d} set={patch => setDraft(q.id, patch)} />

            {q.allowComment && (
                d?.commentOn
                    ? <textarea className="crier-text" rows={2} maxLength={500} placeholder="Your note"
                        aria-label="Your note" value={d.comment ?? ''} onChange={e => setDraft(q.id, { comment: e.target.value })} />
                    : <button className="crier-link" onClick={() => setDraft(q.id, { commentOn: true })}>Add a note</button>
            )}

            <ErrorLine message={error} className="crier-error" />
            </div>

            <div className="crier-foot">
                {page > 0
                    ? <button className="crier-link" onClick={() => { setError(null); setPage(p => p - 1) }}>Back</button>
                    : <button className="crier-link" onClick={notNow}>Not now</button>}
                <span className="crier-meta">
                    {poll.questions.length > 1 && <>{page + 1} of {poll.questions.length}</>}
                    {poll.questions.length > 1 && when && ' · '}
                    {when}
                </span>
                {last
                    ? <button className="btn btn-gold" onClick={submit} disabled={busy || !canGoOn}>{busy ? 'Sending…' : 'Answer'}</button>
                    : <button className="btn btn-gold" onClick={() => { setError(null); setPage(p => p + 1) }} disabled={!canGoOn}>Next</button>}
            </div>
        </div>
    )
}

function QuestionInput({ q, d, set }: { q: Question; d: Draft | undefined; set: (patch: Partial<Draft>) => void }) {
    const writeIn = q.allowWriteIn && (
        <>
            <OptionButton
                square={q.kind === 'multi'}
                on={!!d?.writeInOn}
                onClick={() => {
                    if (q.kind === 'multi') set({ writeInOn: !d?.writeInOn })
                    else set({ writeInOn: true, optionId: null })
                }}
            >
                {q.writeInLabel ?? 'Something else'}…
            </OptionButton>
        </>
    )
    const writeInBox = q.allowWriteIn && d?.writeInOn && (
        <input className="crier-text" maxLength={200} autoFocus placeholder="In your own words"
            aria-label={q.writeInLabel ?? 'Something else'} value={d.writeIn ?? ''} onChange={e => set({ writeIn: e.target.value })} />
    )

    if (q.kind === 'single' || q.kind === 'item') {
        const items = q.kind === 'item'
        const two = !items && q.options.every(o => o.label.length <= 22) && q.options.length + (q.allowWriteIn ? 1 : 0) >= 3
        return (
            <>
                <div className={`crier-opts ${items ? 'items' : two ? 'two' : ''}`} role="radiogroup">
                    {q.options.map(o => (
                        <OptionButton key={o.id} on={d?.optionId === o.id && !d?.writeInOn} item={o.itemName}
                            onClick={() => set({ optionId: o.id, writeInOn: false })}>
                            {o.label}
                        </OptionButton>
                    ))}
                    {writeIn}
                </div>
                {writeInBox}
            </>
        )
    }

    if (q.kind === 'multi') {
        const chosen = d?.optionIds ?? []
        const most = q.settings.maxChoices ?? null
        const count = chosen.length + (d?.writeInOn ? 1 : 0)
        const two = q.options.every(o => o.label.length <= 22) && q.options.length + (q.allowWriteIn ? 1 : 0) >= 3
        return (
            <>
                <p className="crier-sub">{most ? `Choose up to ${most}.` : 'Choose any that fit.'}</p>
                <div className={`crier-opts ${two ? 'two' : ''}`}>
                    {q.options.map(o => {
                        const on = chosen.includes(o.id)
                        return (
                            <OptionButton key={o.id} square on={on} disabled={!on && most !== null && count >= most}
                                onClick={() => set({ optionIds: on ? chosen.filter(x => x !== o.id) : [...chosen, o.id] })}>
                                {o.label}
                            </OptionButton>
                        )
                    })}
                    {q.allowWriteIn && (
                        <OptionButton square on={!!d?.writeInOn} disabled={!d?.writeInOn && most !== null && count >= most}
                            onClick={() => set({ writeInOn: !d?.writeInOn })}>
                            {q.writeInLabel ?? 'Something else'}…
                        </OptionButton>
                    )}
                </div>
                {writeInBox}
            </>
        )
    }

    if (q.kind === 'scale') {
        const sc = q.settings.scale ?? { min: 1, max: 5, minLabel: null, maxLabel: null }
        const values: number[] = []
        for (let v = sc.min; v <= sc.max; v++) values.push(v)
        return (
            <>
                <div className={`crier-scale ${values.length > 6 ? 'wide' : ''}`} role="radiogroup">
                    {values.map(v => (
                        <button key={v} className={String(v) === d?.value ? 'on' : ''} aria-pressed={String(v) === d?.value}
                            onClick={() => set({ value: String(v) })}>{v}</button>
                    ))}
                </div>
                {(sc.minLabel || sc.maxLabel) && (
                    <div className="crier-ends"><span>{sc.minLabel}</span><span>{sc.maxLabel}</span></div>
                )}
            </>
        )
    }

    if (q.kind === 'rank') {
        const order = d?.order ?? q.options.map(o => o.id)
        const move = (i: number, by: number) => {
            const next = [...order]
            const j = i + by
            if (j < 0 || j >= next.length) return
            ;[next[i], next[j]] = [next[j], next[i]]
            set({ order: next })
        }
        return (
            <>
                <p className="crier-sub">Put them in order, the one you want most at the top.</p>
                <ol className="crier-rank">
                    {order.map((id, i) => {
                        const o = q.options.find(x => x.id === id)!
                        return (
                            <li key={id}>
                                <span className="crier-rank-n">{i + 1}</span>
                                <span className="crier-rank-label">{o.label}</span>
                                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${o.label} up`}>▲</button>
                                <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${o.label} down`}>▼</button>
                            </li>
                        )
                    })}
                </ol>
            </>
        )
    }

    if (q.kind === 'points') {
        const total = q.settings.total ?? 10
        const pts = d?.points ?? {}
        const used = Object.values(pts).reduce((s, v) => s + v, 0)
        const give = (id: number, by: number) => {
            const now = pts[id] ?? 0
            const next = Math.max(0, now + by)
            if (by > 0 && used >= total) return
            set({ points: { ...pts, [id]: next } })
        }
        return (
            <>
                <p className="crier-sub">Share {total} points between them. <strong>{total - used} left.</strong></p>
                <ul className="crier-points">
                    {q.options.map(o => (
                        <li key={o.id}>
                            <span className="crier-rank-label">{o.label}</span>
                            <button onClick={() => give(o.id, -1)} disabled={!(pts[o.id] > 0)} aria-label={`One less for ${o.label}`}>−</button>
                            <span className="crier-points-n">{pts[o.id] ?? 0}</span>
                            <button onClick={() => give(o.id, 1)} disabled={used >= total} aria-label={`One more for ${o.label}`}>+</button>
                        </li>
                    ))}
                </ul>
            </>
        )
    }

    if (q.kind === 'number') {
        const ns = q.settings.number ?? { min: null, max: null, integer: true, unit: null }
        return (
            <div className="crier-number">
                <input className="crier-text" type="number" inputMode={ns.integer ? 'numeric' : 'decimal'}
                    min={ns.min ?? undefined} max={ns.max ?? undefined} step={ns.integer ? 1 : 'any'}
                    aria-label={q.prompt} value={d?.value ?? ''} onChange={e => set({ value: e.target.value })} />
                {ns.unit && <span className="crier-unit">{ns.unit}</span>}
            </div>
        )
    }

    // text
    const max = q.settings.maxLength ?? 500
    return (
        <>
            <textarea className="crier-text" rows={3} maxLength={max} aria-label={q.prompt}
                value={d?.text ?? ''} onChange={e => set({ text: e.target.value })} />
            <div className="crier-ends"><span /><span>{(d?.text ?? '').length} / {max}</span></div>
        </>
    )
}

function OptionButton({ on, square, item, disabled, onClick, children }: {
    on: boolean; square?: boolean; item?: string | null; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
    return (
        <button className={`crier-opt ${square ? 'sq' : ''} ${on ? 'on' : ''} ${item ? 'with-item' : ''}`}
            aria-pressed={on} disabled={disabled} onClick={onClick}>
            {item
                ? <span className="inventory-slot occupied crier-item-icon">
                    <img src={getItemIcon(item)} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                </span>
                : <span className="crier-mark" aria-hidden="true" />}
            <span className="crier-opt-label">{children}</span>
        </button>
    )
}

function pct(n: number): string {
    return `${Math.round(n * 100)}%`
}

function ResultsCard({ results, chits, onClose }: { results: Results; chits: number; onClose: () => void }) {
    return (
        <div className="crier-card crier-notice crier-results" role="dialog" aria-label="The Crier's tally">
            <div className="crier-head">
                <span className="crier-kicker">📯 The Crier's tally</span>
                <button className="crier-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="crier-body">
            <p className="crier-q">{results.title}</p>
            <p className="crier-sub">{results.respondents} answered. Thank you for yours.</p>
            {results.questions.map(q => (
                <div key={q.id} className="crier-result">
                    <p className="crier-result-q">{q.prompt}</p>
                    {(q.kind === 'single' || q.kind === 'multi' || q.kind === 'item') && (
                        <>
                            {[...q.options].sort((a, b) => b.count - a.count).map(o => <Bar key={o.id} label={o.label} share={o.share} note={pct(o.share)} />)}
                            {q.writeInLabel && q.writeIns > 0 && (
                                <Bar label={q.writeInLabel} share={q.answered ? q.writeIns / q.answered : 0} note={pct(q.answered ? q.writeIns / q.answered : 0)} />
                            )}
                        </>
                    )}
                    {q.kind === 'rank' && q.options.map((o, i) => (
                        <div key={o.id} className="crier-bar-row"><span className="crier-bar-label">{i + 1}. {o.label}</span>
                            <span className="crier-bar-note">{o.avgRank ? `average place ${o.avgRank}` : ''}</span></div>
                    ))}
                    {q.kind === 'points' && (() => {
                        const all = q.options.reduce((s, o) => s + (o.points ?? 0), 0)
                        return [...q.options].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).map(o => (
                            <Bar key={o.id} label={o.label} share={all ? (o.points ?? 0) / all : 0} note={`${o.avgPoints ?? 0} avg`} />
                        ))
                    })()}
                    {q.kind === 'scale' && (
                        <>
                            {(q.distribution ?? []).map(v => (
                                <Bar key={v.value} label={String(v.value)} share={q.answered ? v.count / q.answered : 0} note={String(v.count)} />
                            ))}
                            {q.mean !== null && q.mean !== undefined && <p className="crier-sub">Average {q.mean}</p>}
                        </>
                    )}
                    {q.kind === 'number' && (
                        <p className="crier-sub">{q.answered ? `Average ${q.mean}, middle answer ${q.median}${q.settings.number?.unit ? ` ${q.settings.number.unit}` : ''}.` : 'No answers.'}</p>
                    )}
                    {q.kind === 'text' && <p className="crier-sub">{q.texts ?? 0} wrote an answer. The Maker reads every one.</p>}
                </div>
            ))}
            </div>
            <div className="crier-foot">
                <span className="crier-meta">You hold {CHITS(chits)}.</span>
                <button className="btn btn-gold" onClick={onClose}>Close</button>
            </div>
        </div>
    )
}

function Bar({ label, share, note }: { label: string; share: number; note: string }) {
    return (
        <div className="crier-bar-row">
            <span className="crier-bar-label">{label}</span>
            <span className="crier-bar"><span style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} /></span>
            <span className="crier-bar-note">{note}</span>
        </div>
    )
}
