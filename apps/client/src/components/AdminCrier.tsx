import { useState, useEffect, useCallback } from 'react'
import { apiFetch, apiUrl } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './AdminCrier.css'
import ErrorLine from './ErrorLine'

/**
 * The admin panel's Polls tab (server services/crierPolls.ts): write the Town
 * Crier's polls, schedule, open and close them, and read who said what.
 * Answers keep each player's level and hours played as they were.
 */

type Kind = 'single' | 'multi' | 'scale' | 'rank' | 'points' | 'item' | 'number' | 'text'
type Status = 'draft' | 'scheduled' | 'open' | 'closed'

interface Summary {
    id: number
    title: string
    status: Status
    chits: number
    opensAt: string | null
    closesAt: string | null
    closedAt: string | null
    minAccountDays: number
    minHoursPlayed: number
    questions: number
    responses: number
}

interface QDraft {
    key: number
    kind: Kind
    prompt: string
    help: string
    required: boolean
    allowWriteIn: boolean
    writeInLabel: string
    allowComment: boolean
    options: { label: string; itemName: string }[]
    maxChoices: string
    scaleMin: number
    scaleMax: number
    minLabel: string
    maxLabel: string
    total: number
    numMin: string
    numMax: string
    integer: boolean
    unit: string
    maxLength: number
}

interface PollDraft {
    id: number | null
    title: string
    intro: string
    chits: number
    minAccountDays: number
    minHoursPlayed: number
    opening: 'draft' | 'now' | 'at'
    opensAt: string
    closesAt: string
    questions: QDraft[]
}

const KIND_CHOICES: { value: string; label: string }[] = [
    { value: 'single', label: 'Single choice' },
    { value: 'multi', label: 'Multiple choice' },
    { value: 'yesno', label: 'Yes or no' },
    { value: 'agree', label: 'Agree or disagree' },
    { value: 'scale', label: 'Rating scale' },
    { value: 'rank', label: 'Ranking' },
    { value: 'points', label: 'Share points' },
    { value: 'item', label: 'Item picker' },
    { value: 'number', label: 'Number' },
    { value: 'text', label: 'Written answer' },
]
const KIND_NAME: Record<Kind, string> = {
    single: 'Single choice', multi: 'Multiple choice', scale: 'Rating scale', rank: 'Ranking',
    points: 'Share points', item: 'Item picker', number: 'Number', text: 'Written answer',
}
const CHOICE: Kind[] = ['single', 'multi', 'rank', 'points', 'item']
const WRITE_IN: Kind[] = ['single', 'multi', 'item']

let nextKey = 1

function blankQuestion(kind: Kind = 'single'): QDraft {
    return {
        key: nextKey++, kind, prompt: '', help: '', required: true, allowWriteIn: false, writeInLabel: 'Something else',
        allowComment: false, options: [{ label: '', itemName: '' }, { label: '', itemName: '' }],
        maxChoices: '', scaleMin: 1, scaleMax: 5, minLabel: '', maxLabel: '', total: 10,
        numMin: '', numMax: '', integer: true, unit: '', maxLength: 500,
    }
}

/** A datetime-local value for a moment, in the browser's time. */
function localInput(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function blankPoll(): PollDraft {
    return {
        id: null, title: '', intro: '', chits: 2, minAccountDays: 3, minHoursPlayed: 3,
        opening: 'draft', opensAt: localInput(new Date(Date.now() + 3600_000)),
        closesAt: localInput(new Date(Date.now() + 7 * 86400_000)), questions: [blankQuestion()],
    }
}

function when(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not set'
}

function toPayload(p: PollDraft) {
    return {
        title: p.title, intro: p.intro || null, chits: p.chits,
        minAccountDays: p.minAccountDays, minHoursPlayed: p.minHoursPlayed,
        opensAt: p.opening === 'draft' ? null : p.opening === 'now' ? 'now' : new Date(p.opensAt).toISOString(),
        closesAt: p.closesAt ? new Date(p.closesAt).toISOString() : null,
        questions: p.questions.map(q => ({
            kind: q.kind, prompt: q.prompt, help: q.help || null, required: q.required,
            allowWriteIn: q.allowWriteIn, writeInLabel: q.writeInLabel || null, allowComment: q.allowComment,
            options: CHOICE.includes(q.kind) ? q.options.map(o => ({ label: o.label || null, itemName: q.kind === 'item' ? o.itemName || null : null })) : [],
            settings: {
                maxChoices: q.kind === 'multi' && q.maxChoices ? Number(q.maxChoices) : null,
                scale: { min: q.scaleMin, max: q.scaleMax, minLabel: q.minLabel || null, maxLabel: q.maxLabel || null },
                total: q.total,
                number: { min: q.numMin === '' ? null : Number(q.numMin), max: q.numMax === '' ? null : Number(q.numMax), integer: q.integer, unit: q.unit || null },
                maxLength: q.maxLength,
            },
        })),
    }
}

interface ServerQuestion {
    kind: Kind
    prompt: string
    help: string | null
    required: boolean
    allowWriteIn: boolean
    writeInLabel: string | null
    allowComment: boolean
    options: { label: string; itemName: string | null }[]
    settings?: {
        maxChoices?: number | null
        scale?: { min: number; max: number; minLabel: string | null; maxLabel: string | null }
        total?: number
        number?: { min: number | null; max: number | null; integer: boolean; unit: string | null }
        maxLength?: number
    }
}
interface ServerPoll extends Summary { intro: string | null; questionList: ServerQuestion[] }

function fromServer(p: ServerPoll): PollDraft {
    return {
        id: p.id, title: p.title, intro: p.intro ?? '', chits: p.chits, minAccountDays: p.minAccountDays, minHoursPlayed: p.minHoursPlayed,
        opening: p.opensAt ? 'at' : 'draft',
        opensAt: p.opensAt ? localInput(new Date(p.opensAt)) : localInput(new Date(Date.now() + 3600_000)),
        closesAt: p.closesAt ? localInput(new Date(p.closesAt)) : localInput(new Date(Date.now() + 7 * 86400_000)),
        questions: (p.questionList ?? []).map(q => ({
            ...blankQuestion(q.kind),
            prompt: q.prompt, help: q.help ?? '', required: q.required, allowWriteIn: q.allowWriteIn,
            writeInLabel: q.writeInLabel ?? 'Something else', allowComment: q.allowComment,
            options: q.options.length ? q.options.map(o => ({ label: o.label, itemName: o.itemName ?? '' })) : blankQuestion().options,
            maxChoices: q.settings?.maxChoices ? String(q.settings.maxChoices) : '',
            scaleMin: q.settings?.scale?.min ?? 1, scaleMax: q.settings?.scale?.max ?? 5,
            minLabel: q.settings?.scale?.minLabel ?? '', maxLabel: q.settings?.scale?.maxLabel ?? '',
            total: q.settings?.total ?? 10,
            numMin: q.settings?.number?.min != null ? String(q.settings.number.min) : '', numMax: q.settings?.number?.max != null ? String(q.settings.number.max) : '',
            integer: q.settings?.number?.integer ?? true, unit: q.settings?.number?.unit ?? '',
            maxLength: q.settings?.maxLength ?? 500,
        })),
    }
}

export default function AdminCrier() {
    const [polls, setPolls] = useState<Summary[] | null>(null)
    const [editing, setEditing] = useState<PollDraft | null>(null)
    const [viewing, setViewing] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)

    const load = useCallback(() => {
        apiFetch<{ polls: Summary[] }>('/api/admin/crier/polls')
            .then(d => { setPolls(d.polls); setError(null) })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load the polls.'))
    }, [])
    useEffect(() => { load() }, [load])

    const act = async (path: string, method: string, body?: unknown, done?: string) => {
        try {
            await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined })
            setError(null)
            setNote(done ?? null)
            load()
        } catch (err) {
            setNote(null)
            setError(err instanceof Error ? err.message : 'That did not work.')
        }
    }

    const edit = async (id: number) => {
        try {
            const d = await apiFetch<{ poll: ServerPoll }>(`/api/admin/crier/polls/${id}`)
            setEditing(fromServer(d.poll))
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not open the poll.')
        }
    }

    if (editing) {
        return <PollEditor draft={editing} onCancel={() => setEditing(null)}
            onSaved={msg => { setEditing(null); setNote(msg); load() }} />
    }
    if (viewing !== null) return <PollResultsView id={viewing} onBack={() => setViewing(null)} />

    return (
        <div className="admin-crier">
            <ErrorLine message={error} className="guild-error" />
            {note && <p className="guild-success">{note}</p>}
            <div className="admin-action-card">
                <p className="admin-section-title">📯 The Town Crier's polls</p>
                <p className="crier-admin-note">
                    A poll comes to every player who may answer it: a notice on their scene when it opens or when they
                    next log in, and Hollin Bray standing wherever they are until they answer or it closes. Answering
                    pays the poll's Crier's Chits, once. Guests never see polls.
                </p>
                <button className="btn btn-gold" onClick={() => setEditing(blankPoll())}>New poll</button>
            </div>

            {polls === null && <p className="crier-admin-note">Loading…</p>}
            {polls?.length === 0 && <p className="crier-admin-note">No polls yet.</p>}
            {polls?.map(p => (
                <div key={p.id} className="admin-action-card crier-admin-poll">
                    <div className="crier-admin-row">
                        <span className={`crier-admin-status ${p.status}`}>{p.status}</span>
                        <strong className="crier-admin-title">{p.title}</strong>
                        <span className="crier-admin-note tabular-num">{p.responses} answered · {p.questions} question{p.questions === 1 ? '' : 's'} · {p.chits} chits</span>
                    </div>
                    <p className="crier-admin-note">
                        Opens {when(p.opensAt)} · closes {when(p.closedAt ?? p.closesAt)} · accounts {p.minAccountDays}+ days, {p.minHoursPlayed}+ hours played
                    </p>
                    <div className="crier-admin-actions">
                        <button className="btn" onClick={() => setViewing(p.id)}>Results</button>
                        {p.responses === 0 && p.status !== 'closed' && <button className="btn" onClick={() => edit(p.id)}>Edit</button>}
                        {(p.status === 'draft' || p.status === 'scheduled') && (
                            <button className="btn btn-gold" onClick={() => act(`/api/admin/crier/polls/${p.id}/open`, 'POST', {}, `"${p.title}" is open.`)}>Open now</button>
                        )}
                        {p.status === 'open' && (
                            <button className="btn" onClick={() => { if (confirm(`Close "${p.title}" now? Nobody can answer it after this.`)) act(`/api/admin/crier/polls/${p.id}/close`, 'POST', undefined, `"${p.title}" is closed.`) }}>Close now</button>
                        )}
                        {(p.status === 'open' || p.status === 'scheduled') && (
                            <ClosingTime onSet={iso => act(`/api/admin/crier/polls/${p.id}/closing-time`, 'POST', { closesAt: iso }, 'Closing time changed.')} />
                        )}
                        {p.responses === 0 && (
                            <button className="btn crier-admin-danger" onClick={() => { if (confirm(`Delete "${p.title}"?`)) act(`/api/admin/crier/polls/${p.id}`, 'DELETE', undefined, 'Deleted.') }}>Delete</button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

function ClosingTime({ onSet }: { onSet: (iso: string) => void }) {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState(() => localInput(new Date(Date.now() + 3 * 86400_000)))
    if (!open) return <button className="btn" onClick={() => setOpen(true)}>New closing time</button>
    return (
        <span className="crier-admin-inline">
            <input type="datetime-local" value={value} onChange={e => setValue(e.target.value)} aria-label="New closing time" />
            <button className="btn btn-gold" onClick={() => { onSet(new Date(value).toISOString()); setOpen(false) }}>Set</button>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
        </span>
    )
}

function PollEditor({ draft, onCancel, onSaved }: { draft: PollDraft; onCancel: () => void; onSaved: (msg: string) => void }) {
    const [p, setP] = useState<PollDraft>(draft)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const setQ = (i: number, patch: Partial<QDraft>) =>
        setP(x => ({ ...x, questions: x.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }))
    const moveQ = (i: number, by: number) => setP(x => {
        const qs = [...x.questions]
        const j = i + by
        if (j < 0 || j >= qs.length) return x
        ;[qs[i], qs[j]] = [qs[j], qs[i]]
        return { ...x, questions: qs }
    })

    const chooseKind = (i: number, value: string) => {
        if (value === 'yesno') setQ(i, { kind: 'single', options: [{ label: 'Yes', itemName: '' }, { label: 'No', itemName: '' }] })
        else if (value === 'agree') setQ(i, {
            kind: 'single', options: ['Strongly agree', 'Agree', 'Not sure', 'Disagree', 'Strongly disagree'].map(label => ({ label, itemName: '' })),
        })
        else setQ(i, { kind: value as Kind })
    }

    const save = async () => {
        setSaving(true)
        setError(null)
        try {
            const body = toPayload(p)
            if (p.id) await apiFetch(`/api/admin/crier/polls/${p.id}`, { method: 'PUT', body: JSON.stringify(body) })
            else await apiFetch('/api/admin/crier/polls', { method: 'POST', body: JSON.stringify(body) })
            onSaved(p.opening === 'now' ? `"${p.title}" is open.` : p.opening === 'at' ? `"${p.title}" is scheduled.` : `"${p.title}" is saved as a draft.`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the poll.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="admin-crier">
            <div className="admin-action-card">
                <p className="admin-section-title">{p.id ? '✏️ Edit poll' : '📯 New poll'}</p>
                <div className="crier-admin-grid">
                    <label className="wide">Title (players see it on the results)
                        <input value={p.title} maxLength={120} onChange={e => setP({ ...p, title: e.target.value })} />
                    </label>
                    <label className="wide">Introduction (optional, shown above the first question)
                        <textarea rows={2} value={p.intro} maxLength={500} onChange={e => setP({ ...p, intro: e.target.value })} />
                    </label>
                    <label>Crier's Chits for answering
                        <input type="number" min={0} max={100} value={p.chits} onChange={e => setP({ ...p, chits: Number(e.target.value) })} />
                    </label>
                    <label>Account at least (days)
                        <input type="number" min={0} max={365} value={p.minAccountDays} onChange={e => setP({ ...p, minAccountDays: Number(e.target.value) })} />
                    </label>
                    <label>Played at least (hours)
                        <input type="number" min={0} max={1000} value={p.minHoursPlayed} onChange={e => setP({ ...p, minHoursPlayed: Number(e.target.value) })} />
                    </label>
                </div>
                <div className="crier-admin-grid">
                    <fieldset className="wide crier-admin-opening">
                        <legend>Opens</legend>
                        <label><input type="radio" checked={p.opening === 'draft'} onChange={() => setP({ ...p, opening: 'draft' })} /> Keep as a draft</label>
                        <label><input type="radio" checked={p.opening === 'now'} onChange={() => setP({ ...p, opening: 'now' })} /> Now</label>
                        <label><input type="radio" checked={p.opening === 'at'} onChange={() => setP({ ...p, opening: 'at' })} /> At
                            <input type="datetime-local" value={p.opensAt} disabled={p.opening !== 'at'} onChange={e => setP({ ...p, opensAt: e.target.value })} />
                        </label>
                    </fieldset>
                    <label>Closes
                        <input type="datetime-local" value={p.closesAt} onChange={e => setP({ ...p, closesAt: e.target.value })} />
                    </label>
                </div>
            </div>

            {p.questions.map((q, i) => (
                <div key={q.key} className="admin-action-card crier-admin-q">
                    <div className="crier-admin-row">
                        <strong>Question {i + 1}</strong>
                        <select value={q.kind} onChange={e => chooseKind(i, e.target.value)} aria-label="Kind of question">
                            {KIND_CHOICES.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </select>
                        <span className="crier-admin-spacer" />
                        <button className="btn" onClick={() => moveQ(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                        <button className="btn" onClick={() => moveQ(i, 1)} disabled={i === p.questions.length - 1} aria-label="Move down">▼</button>
                        <button className="btn crier-admin-danger" disabled={p.questions.length === 1}
                            onClick={() => setP({ ...p, questions: p.questions.filter((_, j) => j !== i) })}>Remove</button>
                    </div>
                    <div className="crier-admin-grid">
                        <label className="wide">The question
                            <input value={q.prompt} maxLength={300} onChange={e => setQ(i, { prompt: e.target.value })} />
                        </label>
                        <label className="wide">Hint under it (optional)
                            <input value={q.help} maxLength={300} onChange={e => setQ(i, { help: e.target.value })} />
                        </label>
                    </div>

                    {CHOICE.includes(q.kind) && (
                        <div className="crier-admin-options">
                            {q.options.map((o, j) => (
                                <div key={j} className="crier-admin-option">
                                    {q.kind === 'item' && (
                                        <>
                                            <span className="inventory-slot occupied crier-admin-icon">
                                                {o.itemName && <img src={getItemIcon(o.itemName)} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
                                            </span>
                                            <input placeholder="Item name, exactly" value={o.itemName}
                                                onChange={e => setQ(i, { options: q.options.map((x, k) => k === j ? { ...x, itemName: e.target.value } : x) })} />
                                        </>
                                    )}
                                    <input placeholder={q.kind === 'item' ? 'Label (blank: the item name)' : `Answer ${j + 1}`} value={o.label} maxLength={200}
                                        onChange={e => setQ(i, { options: q.options.map((x, k) => k === j ? { ...x, label: e.target.value } : x) })} />
                                    <button className="btn" disabled={q.options.length <= 2} aria-label="Remove answer"
                                        onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== j) })}>✕</button>
                                </div>
                            ))}
                            <button className="btn" disabled={q.options.length >= (q.kind === 'rank' ? 8 : 12)}
                                onClick={() => setQ(i, { options: [...q.options, { label: '', itemName: '' }] })}>Add an answer</button>
                        </div>
                    )}

                    <div className="crier-admin-grid">
                        {q.kind === 'multi' && (
                            <label>Most they may choose (blank: any)
                                <input type="number" min={1} value={q.maxChoices} onChange={e => setQ(i, { maxChoices: e.target.value })} />
                            </label>
                        )}
                        {q.kind === 'scale' && (<>
                            <label>From
                                <select value={q.scaleMin} onChange={e => setQ(i, { scaleMin: Number(e.target.value) })}>
                                    <option value={0}>0</option><option value={1}>1</option>
                                </select>
                            </label>
                            <label>To
                                <select value={q.scaleMax} onChange={e => setQ(i, { scaleMax: Number(e.target.value) })}>
                                    {[3, 4, 5, 6, 7, 10].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </label>
                            <label>Low end says
                                <input value={q.minLabel} maxLength={40} placeholder="Poor" onChange={e => setQ(i, { minLabel: e.target.value })} />
                            </label>
                            <label>High end says
                                <input value={q.maxLabel} maxLength={40} placeholder="Very good" onChange={e => setQ(i, { maxLabel: e.target.value })} />
                            </label>
                        </>)}
                        {q.kind === 'points' && (
                            <label>Points to share
                                <input type="number" min={1} max={100} value={q.total} onChange={e => setQ(i, { total: Number(e.target.value) })} />
                            </label>
                        )}
                        {q.kind === 'number' && (<>
                            <label>Lowest (optional)<input type="number" value={q.numMin} onChange={e => setQ(i, { numMin: e.target.value })} /></label>
                            <label>Highest (optional)<input type="number" value={q.numMax} onChange={e => setQ(i, { numMax: e.target.value })} /></label>
                            <label>Unit (optional)<input value={q.unit} maxLength={20} placeholder="hours" onChange={e => setQ(i, { unit: e.target.value })} /></label>
                            <label className="crier-admin-check"><input type="checkbox" checked={q.integer} onChange={e => setQ(i, { integer: e.target.checked })} /> Whole numbers only</label>
                        </>)}
                        {q.kind === 'text' && (
                            <label>Longest answer (characters)
                                <input type="number" min={20} max={1000} value={q.maxLength} onChange={e => setQ(i, { maxLength: Number(e.target.value) })} />
                            </label>
                        )}
                    </div>

                    <div className="crier-admin-checks">
                        <label className="crier-admin-check"><input type="checkbox" checked={q.required} onChange={e => setQ(i, { required: e.target.checked })} /> Needs an answer</label>
                        {WRITE_IN.includes(q.kind) && (
                            <label className="crier-admin-check"><input type="checkbox" checked={q.allowWriteIn} onChange={e => setQ(i, { allowWriteIn: e.target.checked })} /> Allow their own answer</label>
                        )}
                        {WRITE_IN.includes(q.kind) && q.allowWriteIn && (
                            <label className="crier-admin-inline">labelled <input value={q.writeInLabel} maxLength={60} onChange={e => setQ(i, { writeInLabel: e.target.value })} /></label>
                        )}
                        <label className="crier-admin-check"><input type="checkbox" checked={q.allowComment} onChange={e => setQ(i, { allowComment: e.target.checked })} /> Allow a note</label>
                    </div>
                </div>
            ))}

            <div className="admin-action-card">
                <ErrorLine message={error} className="guild-error" />
                <div className="crier-admin-actions">
                    <button className="btn" disabled={p.questions.length >= 10} onClick={() => setP({ ...p, questions: [...p.questions, blankQuestion()] })}>Add a question</button>
                    <span className="crier-admin-spacer" />
                    <button className="btn" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-gold" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : p.opening === 'now' ? 'Save and open' : p.opening === 'at' ? 'Save and schedule' : 'Save draft'}
                    </button>
                </div>
            </div>
        </div>
    )
}

interface QResult {
    id: number; kind: Kind; prompt: string; answered: number
    options: { id: number; label: string; count: number; share: number; avgRank?: number; points?: number; avgPoints?: number }[]
    writeInLabel: string | null; writeIns: number
    mean?: number | null; median?: number | null; min?: number | null; max?: number | null
    distribution?: { value: number; count: number }[]
    writeInTexts?: string[]; textAnswers?: string[]; commentTexts?: string[]
}
interface ResultsData {
    results: { id: number; title: string; closedAt: string | null; respondents: number; questions: QResult[] }
    responses: { id: number; player: string; totalLevel: number; combatLevel: number; hoursPlayed: number; accountDays: number; at: string; answers: string[] }[]
}

function PollResultsView({ id, onBack }: { id: number; onBack: () => void }) {
    const [data, setData] = useState<ResultsData | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        apiFetch<ResultsData>(`/api/admin/crier/polls/${id}/results`).then(setData)
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load the results.'))
    }, [id])

    // A CSV is a download, fetched with the token by hand (as AdminChronicle does).
    const exportCsv = async () => {
        try {
            const token = localStorage.getItem('talaran_token')
            const res = await fetch(apiUrl(`/api/admin/crier/polls/${id}/export`), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
            if (!res.ok) throw new Error(`Export failed (${res.status}).`)
            const blob = await res.blob()
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `poll-${id}.csv`
            link.click()
            URL.revokeObjectURL(link.href)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed.')
        }
    }

    if (!data) return <div className="admin-crier"><button className="btn" onClick={onBack}>Back</button><p className="crier-admin-note">{error ?? 'Loading…'}</p></div>
    const r = data.results

    return (
        <div className="admin-crier">
            <div className="admin-action-card">
                <div className="crier-admin-row">
                    <button className="btn" onClick={onBack}>Back</button>
                    <p className="admin-section-title crier-admin-title">📊 {r.title}</p>
                    <span className="crier-admin-spacer" />
                    <button className="btn btn-gold" onClick={exportCsv} disabled={!data.responses.length}>Export CSV</button>
                </div>
                <p className="crier-admin-note">{r.respondents} answered{r.closedAt ? `, closed ${when(r.closedAt)}` : ', still open'}.</p>
                <ErrorLine message={error} className="guild-error" />
            </div>

            {r.questions.map((q, i) => (
                <div key={q.id} className="admin-action-card">
                    <p className="crier-admin-qtitle">{i + 1}. {q.prompt} <span className="crier-admin-note">({KIND_NAME[q.kind]}, {q.answered} answered)</span></p>
                    {q.options.length > 0 && (
                        <table className="crier-admin-table">
                            <tbody>
                                {q.options.map(o => (
                                    <tr key={o.id}>
                                        <td>{o.label}</td>
                                        <td className="crier-admin-barcell"><span className="crier-admin-bar" style={{ width: `${o.share * 100}%` }} /></td>
                                        <td className="tabular-num">
                                            {q.kind === 'rank' ? `avg place ${o.avgRank ?? '-'}` : q.kind === 'points' ? `${o.points} pts (${o.avgPoints} avg)` : `${o.count} (${Math.round(o.share * 100)}%)`}
                                        </td>
                                    </tr>
                                ))}
                                {q.writeInLabel && (
                                    <tr><td>{q.writeInLabel}</td><td className="crier-admin-barcell"><span className="crier-admin-bar" style={{ width: `${q.answered ? q.writeIns / q.answered * 100 : 0}%` }} /></td><td className="tabular-num">{q.writeIns}</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                    {q.distribution && (
                        <table className="crier-admin-table"><tbody>
                            {q.distribution.map(v => (
                                <tr key={v.value}><td>{v.value}</td><td className="crier-admin-barcell"><span className="crier-admin-bar" style={{ width: `${q.answered ? v.count / q.answered * 100 : 0}%` }} /></td><td className="tabular-num">{v.count}</td></tr>
                            ))}
                        </tbody></table>
                    )}
                    {(q.kind === 'scale' || q.kind === 'number') && q.answered > 0 && (
                        <p className="crier-admin-note">Average {q.mean} · middle {q.median} · lowest {q.min} · highest {q.max}</p>
                    )}
                    {!!q.writeInTexts?.length && <Quotes title={`${q.writeInLabel ?? 'Their own answers'}`} lines={q.writeInTexts} />}
                    {!!q.textAnswers?.length && <Quotes title="Answers" lines={q.textAnswers} />}
                    {!!q.commentTexts?.length && <Quotes title="Notes" lines={q.commentTexts} />}
                </div>
            ))}

            <div className="admin-action-card">
                <p className="admin-section-title">👥 Who answered</p>
                {data.responses.length === 0
                    ? <p className="crier-admin-note">Nobody yet.</p>
                    : (
                        <div className="crier-admin-table-wrap">
                            <table className="crier-admin-table crier-admin-responses">
                                <thead><tr><th>Player</th><th>Total level</th><th>Combat</th><th>Hours</th><th>Days</th>{r.questions.map((q, i) => <th key={q.id} title={q.prompt}>Q{i + 1}</th>)}</tr></thead>
                                <tbody>
                                    {data.responses.map(x => (
                                        <tr key={x.id}>
                                            <td>{x.player}</td><td className="tabular-num">{x.totalLevel}</td><td className="tabular-num">{x.combatLevel}</td>
                                            <td className="tabular-num">{x.hoursPlayed}</td><td className="tabular-num">{x.accountDays}</td>
                                            {x.answers.map((a, i) => <td key={i}>{a}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>
        </div>
    )
}

function Quotes({ title, lines }: { title: string; lines: string[] }) {
    return (
        <div className="crier-admin-quotes">
            <p className="crier-admin-note">{title} ({lines.length})</p>
            <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
    )
}
