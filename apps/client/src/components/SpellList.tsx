import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { announceTalar, type Talar } from '../lib/talar'

// Spells (server: services/spells.ts). One list in two places: the church,
// where spells are learned, and the spellbook (the Talar bar), where they are
// cast. Every number comes from the server.

interface SpellView {
    key: string
    name: string
    description: string | null
    level: number
    cost: number
    cooldownKind: string
    cooldownSeconds: number | null
    learned: boolean
    canLearn: boolean
    readyAt: string | null
    xp: number
}

/** One choice a spell needs before it is cast (Daily Step's places, Larder Ward's hours). */
interface SpellTarget {
    label: string
    cost: number
    params: Record<string, unknown>
}

/** Spells that ask for a choice first. */
const PICKS_TARGET = new Set(['daily_step', 'larder_ward'])

/** What a spell's cost says on its card, for those priced by what they cover. */
function costText(s: SpellView): string {
    if (s.key === 'daily_step') return 'Talar by the road'
    if (s.key === 'larder_ward') return `${s.cost} Talar a head an hour`
    return `${s.cost} Talar`
}

interface CastResult {
    spell: string
    message: string
    detail?: unknown
    talar: Talar
    xpAwarded: number
}

/** What a spell's cooldown says on its card. */
function cooldownText(s: SpellView): string {
    if (s.cooldownKind === 'daily') return 'Once a day'
    if (s.cooldownKind === 'per_death') return 'Once after each fall'
    const m = Math.round((s.cooldownSeconds ?? 0) / 60)
    return m >= 60 ? `Every ${Math.round(m / 60)} h` : `Every ${m} min`
}

function minutesUntil(iso: string): number {
    return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000))
}

/** Wearsight's reading: a line per worn piece. */
function WearReading({ detail }: { detail: { slot: string; name: string; word: string }[] }) {
    if (!detail.length) return null
    return (
        <ul className="spell-reading">
            {detail.map(d => <li key={d.slot}><span className="gold-text">{d.name}</span>: {d.word}</li>)}
        </ul>
    )
}

export default function SpellList({ mode }: { mode: 'learn' | 'cast' }) {
    const [spells, setSpells] = useState<SpellView[] | null>(null)
    const [atChurch, setAtChurch] = useState(false)
    const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
    const [reading, setReading] = useState<{ key: string; detail: unknown } | null>(null)
    const [busy, setBusy] = useState(false)
    const [picking, setPicking] = useState<{ key: string; targets: SpellTarget[] } | null>(null)

    const load = useCallback(() => {
        apiFetch<{ spells: SpellView[]; atChurch: boolean }>('/api/talar/spells')
            .then(d => { setSpells(d.spells); setAtChurch(d.atChurch) })
            .catch(() => setNote({ text: 'The words will not come just now.', error: true }))
    }, [])
    useEffect(() => { load() }, [load])

    const learn = async (s: SpellView) => {
        setBusy(true)
        try {
            await apiFetch('/api/talar/spells/learn', { method: 'POST', body: JSON.stringify({ key: s.key }) })
            setNote({ text: `You have learned ${s.name}.` })
            load()
        } catch (err) {
            setNote({ text: (err as { message?: string }).message || 'You could not learn that.', error: true })
        } finally { setBusy(false) }
    }

    // A spell that needs a choice asks first; the server says what can be chosen and what each costs.
    const pickTarget = async (s: SpellView) => {
        try {
            const d = await apiFetch<{ targets: SpellTarget[] }>(`/api/talar/spells/${s.key}/targets`)
            setPicking({ key: s.key, targets: d.targets })
        } catch (err) {
            setNote({ text: (err as { message?: string }).message || 'Nothing happens.', error: true })
        }
    }

    const cast = async (s: SpellView, params: Record<string, unknown> = {}) => {
        setBusy(true)
        try {
            const res = await apiFetch<CastResult>('/api/talar/spells/cast', { method: 'POST', body: JSON.stringify({ key: s.key, ...params }) })
            setPicking(null)
            announceTalar(res.talar)
            setNote({ text: `${res.message} +${res.xpAwarded} Talar experience.` })
            setReading({ key: s.key, detail: res.detail })
            load()
        } catch (err) {
            setNote({ text: (err as { message?: string }).message || 'Nothing happens.', error: true })
        } finally { setBusy(false) }
    }

    if (!spells) return <p className="farm-empty">{note?.text ?? 'Turning the pages…'}</p>

    const shown = mode === 'cast' ? spells.filter(s => s.learned) : spells
    return (
        <div className="spell-list">
            {note && <p className={note.error ? 'farm-error' : 'farm-note'}>{note.text}</p>}
            {mode === 'cast' && shown.length === 0 && (
                <p className="farm-empty">You know no workings yet. They are taught in a church.</p>
            )}
            {shown.map(s => {
                const waiting = s.readyAt ? minutesUntil(s.readyAt) : 0
                return (
                    <div key={s.key} className={`spell-card ${!s.learned && !s.canLearn ? 'locked' : ''}`}>
                        <div className="spell-card-head">
                            <span className="spell-name gold-text">{s.name}</span>
                            <span className="spell-meta muted-text tabular-num">
                                {costText(s)} · {cooldownText(s)} · Level {s.level}
                            </span>
                        </div>
                        {s.description && <p className="spell-desc">{s.description}</p>}
                        <div className="spell-actions">
                            {mode === 'cast' && (
                                <button className="btn btn-gold" disabled={busy || waiting > 0}
                                    onClick={() => PICKS_TARGET.has(s.key) ? pickTarget(s) : cast(s)}>
                                    {waiting > 0 ? `Ready in ${waiting} min` : 'Cast'}
                                </button>
                            )}
                            {mode === 'learn' && s.learned && <span className="muted-text">Learned</span>}
                            {mode === 'learn' && !s.learned && (
                                s.canLearn
                                    ? <button className="btn btn-gold" disabled={busy || !atChurch} onClick={() => learn(s)}>Learn</button>
                                    : <span className="station-tag locked">Talar level {s.level}</span>
                            )}
                        </div>
                        {picking?.key === s.key && (
                            picking.targets.length === 0
                                ? <p className="farm-empty">There is nowhere on this island you have walked to that you could step to from here.</p>
                                : <ul className="spell-targets">
                                    {picking.targets.map(t => (
                                        <li key={t.label}>
                                            <button className="btn" disabled={busy} onClick={() => cast(s, t.params)}>
                                                {t.label} <span className="muted-text tabular-num">{t.cost} Talar</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                        )}
                        {reading?.key === s.key && s.key === 'wearsight' && Array.isArray(reading.detail) && (
                            <WearReading detail={reading.detail as { slot: string; name: string; word: string }[]} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
