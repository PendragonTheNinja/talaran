import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import ErrorLine from './ErrorLine'
import './AdminQuests.css'

// The admin panel's Quests tab: every NPC's words and every quest's, by NPC,
// so text can be touched up without a migration (server routes/adminQuests.ts).
// Every save goes through the content browser's own PATCH, one field at a
// time, so it is checked, logged, and revertible from Content > Changes.
// Names and links (which quest, which item, how many) are left to migrations.
//
// A text box holding several lines takes one line per paragraph, with a blank
// line between them, as they show in the game.

interface Option { label: string; next_stage: string | null; action: string | null }
interface Dialogue { id: number; stage_key: string; text_lines: string[]; options: Option[] }
interface Objective { id: number; order: number; description: string; type: string; target_item: string | null; required_amount: number }
interface Quest { id: number; name: string; description: string | null; is_active: boolean; objectives: Objective[] }
interface Leg { from: string; to: string; item: string; offer: string[]; waiting: string[]; on_time: string[]; late: string[]; very_late: string[] }
interface Errand { id: number; key: string; name: string; legs: Leg[] }
interface DailyTask { id: number; item_name: string; quantity: number; ask: string[]; thanks: string[] }
interface RareLine { id: number; line: string; chance_one_in: number }
interface Npc {
    id: number; name: string; title: string | null; avatar: string | null; location: string | null; island: string | null
    daily_skill: string | null; daily_chatter: string[] | null
    dialogues: Dialogue[]; rareLines: RareLine[]; quests: Quest[]; errands: Errand[]; dailyTasks: DailyTask[]
}

const LEG_FIELDS: { key: keyof Leg; label: string }[] = [
    { key: 'offer', label: 'Handing it over' },
    { key: 'waiting', label: 'While you still carry it' },
    { key: 'on_time', label: 'Delivered on time' },
    { key: 'late', label: 'Delivered late' },
    { key: 'very_late', label: 'Delivered very late' },
]

const joinLines = (ls: string[] | null | undefined) => (ls ?? []).join('\n\n')
const splitLines = (t: string) => t.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)

/** House style checks on text a player will read (CLAUDE.md §10). */
function styleWarnings(text: string): string[] {
    const out: string[] = []
    if (text.includes('—')) out.push('Has an em dash.')
    if (/\b(colour|grey|harbour|favour|armour)\b/i.test(text)) out.push('British spelling.')
    return out
}

async function patch(table: string, id: number, column: string, value: unknown) {
    await apiFetch(`/api/admin/content/table/${table}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ column, value: typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value) }),
    })
}

/** A text box with its own Save button and a note of what went wrong. */
function Field({ label, value, rows = 3, single, onSave }: {
    label: string; value: string; rows?: number; single?: boolean
    onSave: (text: string) => Promise<void>
}) {
    const [text, setText] = useState(value)
    const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [err, setErr] = useState<string | null>(null)
    // When the saved value changes (a reload after any save), the box follows it.
    const [seen, setSeen] = useState(value)
    if (seen !== value) { setSeen(value); setText(value) }
    const dirty = text !== value
    const warn = styleWarnings(text)
    const save = async () => {
        setState('saving'); setErr(null)
        try { await onSave(text); setState('saved') } catch (e) { setErr((e as Error).message || 'Could not save.'); setState('idle') }
    }
    return (
        <div className="aq-field">
            <label className="aq-label">{label}</label>
            {single
                ? <input className="aq-input" value={text} onChange={e => setText(e.target.value)} />
                : <textarea className="aq-input" rows={rows} value={text} onChange={e => setText(e.target.value)} />}
            <div className="aq-field-row">
                <button className="btn btn-gold" disabled={!dirty || state === 'saving'} onClick={save}>
                    {state === 'saving' ? 'Saving…' : 'Save'}
                </button>
                {state === 'saved' && !dirty && <span className="aq-ok">Saved</span>}
                {warn.map(w => <span key={w} className="aq-warn">{w}</span>)}
            </div>
            <ErrorLine message={err} className="aq-error" />
        </div>
    )
}

export default function AdminQuests() {
    const [npcs, setNpcs] = useState<Npc[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [pickedId, setPickedId] = useState<number | null>(null)
    const [filter, setFilter] = useState('')

    const load = useCallback(() => {
        apiFetch<{ npcs: Npc[] }>('/api/admin/quests')
            .then(r => setNpcs(r.npcs))
            .catch(e => setError((e as Error).message || 'Could not load.'))
    }, [])
    useEffect(() => { load() }, [load])

    // Every save reloads, so what is shown is what the database holds.
    const saved = useCallback(async (fn: () => Promise<void>) => { await fn(); load() }, [load])

    const shown = useMemo(() => {
        const f = filter.trim().toLowerCase()
        return (npcs ?? []).filter(n => !f
            || n.name.toLowerCase().includes(f)
            || (n.location ?? '').toLowerCase().includes(f)
            || n.quests.some(q => q.name.toLowerCase().includes(f)))
    }, [npcs, filter])
    const npc = npcs?.find(n => n.id === pickedId) ?? null

    if (error) return <ErrorLine message={error} className="aq-error" />
    if (!npcs) return <p className="aq-note">Loading…</p>

    return (
        <div className="aq">
            <div className="aq-list">
                <input className="aq-input" placeholder="Find an NPC, a place, or a quest" value={filter} onChange={e => setFilter(e.target.value)} />
                {shown.map(n => (
                    <button key={n.id} className={`aq-npc${n.id === pickedId ? ' is-picked' : ''}`} onClick={() => setPickedId(n.id)}>
                        <span>{n.avatar} {n.name}</span>
                        <span className="aq-note">{n.location ?? 'nowhere'}{n.quests.length ? ` · ${n.quests.length} quest${n.quests.length === 1 ? '' : 's'}` : ''}{n.errands.length ? ' · errands' : ''}{n.daily_skill ? ' · dailies' : ''}</span>
                    </button>
                ))}
            </div>

            <div className="aq-editor">
                {!npc && <p className="aq-note">Pick someone on the left. Saves are logged and can be reverted from Content, Changes.</p>}
                {npc && (
                    <>
                        <div className="admin-action-card">
                            <p className="admin-section-title">{npc.avatar ?? '🧑'} {npc.name}</p>
                            <Field single label="Title" value={npc.title ?? ''} onSave={t => saved(() => patch('npcs', npc.id, 'title', t))} />
                        </div>

                        {npc.quests.map(q => (
                            <div key={q.id} className="admin-action-card">
                                <p className="admin-section-title">📜 {q.name}{q.is_active ? '' : ' (inactive)'}</p>
                                <Field label="Description (the quest log)" value={q.description ?? ''} onSave={t => saved(() => patch('quests', q.id, 'description', t))} />
                                {q.objectives.map(o => (
                                    <Field key={o.id} single label={`Step ${o.order}: ${o.type}${o.target_item ? ` ${o.target_item}` : ''} ×${o.required_amount}`}
                                        value={o.description} onSave={t => saved(() => patch('quest_objectives', o.id, 'description', t))} />
                                ))}
                            </div>
                        ))}

                        {npc.dialogues.length > 0 && (
                            <div className="admin-action-card">
                                <p className="admin-section-title">💬 Dialogue</p>
                                {npc.dialogues.map(d => (
                                    <div key={d.id} className="aq-stage">
                                        <Field label={`Stage "${d.stage_key}": what they say`} rows={Math.max(3, d.text_lines.length * 2)}
                                            value={joinLines(d.text_lines)} onSave={t => saved(() => patch('npc_dialogues', d.id, 'text_lines', splitLines(t)))} />
                                        {d.options.map((o, i) => (
                                            <Field key={i} single label={`Button ${i + 1}${o.action ? ` (${o.action})` : ''}${o.next_stage ? ` → ${o.next_stage}` : ''}`}
                                                value={o.label} onSave={t => saved(() => patch('npc_dialogues', d.id, 'options', d.options.map((x, j) => (j === i ? { ...x, label: t } : x))))} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}

                        {npc.daily_skill && (
                            <div className="admin-action-card">
                                <p className="admin-section-title">📅 Daily tasks ({npc.daily_skill})</p>
                                <Field label="Chatter between tasks (one said at random)" rows={6} value={joinLines(npc.daily_chatter)}
                                    onSave={t => saved(() => patch('npcs', npc.id, 'daily_chatter', splitLines(t)))} />
                                {npc.dailyTasks.map(task => (
                                    <div key={task.id} className="aq-stage">
                                        <p className="aq-note">{task.item_name} ×{task.quantity}. "{'{qty}'}" is filled in with the count.</p>
                                        <Field label="Asking" value={joinLines(task.ask)} onSave={t => saved(() => patch('daily_tasks', task.id, 'ask', splitLines(t)))} />
                                        <Field label="Thanks" value={joinLines(task.thanks)} onSave={t => saved(() => patch('daily_tasks', task.id, 'thanks', splitLines(t)))} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {npc.errands.map(e => (
                            <div key={e.id} className="admin-action-card">
                                <p className="admin-section-title">📦 Errand: {e.name}</p>
                                <p className="aq-note">"{'{limit}'}" and "{'{late}'}" are filled in with times. Only the legs {npc.name} gives or receives are shown.</p>
                                {e.legs.map((leg, li) => (leg.from === npc.name || leg.to === npc.name) && (
                                    <div key={li} className="aq-stage">
                                        <p className="aq-note">Leg {li + 1}: {leg.item}, from {leg.from} to {leg.to}</p>
                                        {LEG_FIELDS.filter(f => (f.key === 'offer' || f.key === 'waiting') ? leg.from === npc.name : leg.to === npc.name).map(f => (
                                            <Field key={f.key} label={f.label} value={joinLines(leg[f.key] as string[])}
                                                onSave={t => saved(() => patch('errands', e.id, 'legs', e.legs.map((x, j) => (j === li ? { ...x, [f.key]: splitLines(t) } : x))))} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        ))}

                        {npc.rareLines.length > 0 && (
                            <div className="admin-action-card">
                                <p className="admin-section-title">✨ Rare lines</p>
                                {npc.rareLines.map(r => (
                                    <div key={r.id} className="aq-stage">
                                        <Field label="Line" value={r.line} onSave={t => saved(() => patch('npc_rare_lines', r.id, 'line', t))} />
                                        <Field single label="1 in how many talks" value={String(r.chance_one_in)} onSave={t => saved(() => patch('npc_rare_lines', r.id, 'chance_one_in', Math.floor(Number(t))))} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
