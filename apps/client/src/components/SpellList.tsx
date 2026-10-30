import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { announceTalar, type Talar } from '../lib/talar'
import SendingPicker, { type SendingStore } from './SendingPicker'
import SpellCastPopup, { type SpellCast } from './SpellCastPopup'

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
    /** Cast ahead and waiting to take effect (Tether, until the next fall). */
    armed: boolean
    xp: number
    vigilMinutes: number
    offering: string | null
    writ: string | null
    hasOffering: boolean
    hasWrit: boolean
}

/** One choice a spell needs before it is cast (Daily Step's places, Larder Ward's hours). */
interface SpellTarget {
    label: string
    cost: number
    params: Record<string, unknown>
    detail?: unknown
}

/** Spells that ask for a choice first. */
const PICKS_TARGET = new Set(['daily_step', 'larder_ward', 'sending', 'kindle', 'portal'])

/** What a spell's cost says on its card, for those priced by what they cover. */
function costText(s: SpellView): string {
    if (s.key === 'daily_step') return 'Talar by the road'
    if (s.key === 'larder_ward') return `${s.cost} Talar a head an hour`
    if (s.key === 'portal') return `${s.cost} Talar and more by the road`
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
    if (s.cooldownKind === 'per_death') return 'One fall at a time'
    const m = Math.round((s.cooldownSeconds ?? 0) / 60)
    return m >= 60 ? `Every ${Math.round(m / 60)} h` : `Every ${m} min`
}

/** "45 min", or "6 h 29 min" once it runs past an hour. */
function waitText(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    const m = minutes % 60
    return m ? `${Math.floor(minutes / 60)} h ${m} min` : `${minutes / 60} h`
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

export default function SpellList({ mode, onKeepVigil }: { mode: 'learn' | 'cast'; onKeepVigil?: (key: string) => void }) {
    const [spells, setSpells] = useState<SpellView[] | null>(null)
    const [atChurch, setAtChurch] = useState(false)
    const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
    const [reading, setReading] = useState<{ key: string; detail: unknown } | null>(null)
    // What the last cast did, shown in a popup until it is closed.
    const [lastCast, setLastCast] = useState<SpellCast | null>(null)
    const closeCast = useCallback(() => setLastCast(null), [])
    const [busy, setBusy] = useState(false)
    const [picking, setPicking] = useState<{ key: string; targets: SpellTarget[] } | null>(null)
    // Sending: which of the player's stores is open in the picker.
    const [sendTo, setSendTo] = useState<number | null>(null)

    const load = useCallback(() => {
        apiFetch<{ spells: SpellView[]; atChurch: boolean }>('/api/talar/spells')
            .then(d => { setSpells(d.spells); setAtChurch(d.atChurch) })
            .catch(() => setNote({ text: 'The words will not come just now.', error: true }))
    }, [])
    useEffect(() => { load() }, [load])

    // A spell that needs a choice asks first; the server says what can be chosen and what each costs.
    const pickTarget = async (s: SpellView) => {
        try {
            const d = await apiFetch<{ targets: SpellTarget[] }>(`/api/talar/spells/${s.key}/targets`)
            setPicking({ key: s.key, targets: d.targets })
            setSendTo(d.targets.length === 1 ? 0 : null)
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
            setNote(null)
            setLastCast({ spell: s.name, message: res.message, xp: res.xpAwarded, talar: res.talar })
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
            {lastCast && <SpellCastPopup cast={lastCast} onClose={closeCast} />}
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
                        {mode === 'cast' && s.armed && (
                            <p className="spell-needs gold-text">Active: it waits for your next fall.</p>
                        )}
                        {mode === 'learn' && !s.learned && (s.offering || s.writ) && (
                            <p className="spell-needs muted-text">
                                {s.offering && <>Offer: <span className={s.hasOffering ? 'gold-text' : 'spell-missing'}>1 {s.offering}</span></>}
                                {s.writ && <>{s.offering ? ' · ' : ''}Needs: <span className={s.hasWrit ? 'gold-text' : 'spell-missing'}>{s.writ}</span>
                                    {!s.hasWrit && ' (not yet found)'}</>}
                            </p>
                        )}
                        <div className="spell-actions">
                            {mode === 'cast' && (
                                <button className="btn btn-gold" disabled={busy || waiting > 0 || s.armed}
                                    onClick={() => PICKS_TARGET.has(s.key) ? pickTarget(s) : cast(s)}>
                                    {s.armed ? 'Holding' : waiting > 0 ? `Ready in ${waitText(waiting)}` : 'Cast'}
                                </button>
                            )}
                            {mode === 'learn' && s.learned && <span className="muted-text">Learned</span>}
                            {mode === 'learn' && !s.learned && (
                                s.canLearn
                                    ? <button className="btn btn-gold"
                                        disabled={busy || !atChurch || !s.hasOffering || !s.hasWrit || !onKeepVigil}
                                        onClick={() => onKeepVigil?.(s.key)}>
                                        Keep vigil ({s.vigilMinutes} min)
                                    </button>
                                    : <span className="station-tag locked">Talar level {s.level}</span>
                            )}
                        </div>
                        {picking?.key === s.key && (
                            picking.targets.length === 0
                                ? <p className="farm-empty">There is nowhere on this island you have walked to that you could step to from here.</p>
                                : <ul className="spell-targets">
                                    {picking.targets.map((t, i) => (
                                        <li key={t.label}>
                                            <button className={`btn ${s.key === 'sending' && sendTo === i ? 'btn-gold' : ''}`} disabled={busy}
                                                onClick={() => s.key === 'sending' ? setSendTo(i) : cast(s, t.params)}>
                                                {t.label} <span className="muted-text tabular-num">{t.cost} Talar</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                        )}
                        {picking?.key === s.key && s.key === 'sending' && sendTo !== null && picking.targets[sendTo] && (
                            <SendingPicker key={sendTo} store={picking.targets[sendTo] as SendingStore} busy={busy}
                                onSend={params => cast(s, params)} />
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
