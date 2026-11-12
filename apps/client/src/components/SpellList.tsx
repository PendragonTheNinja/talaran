import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { announceTalar, type Talar } from '../lib/talar'
import SendingPicker, { type SendingStore } from './SendingPicker'
import SpellCastPopup, { type SpellCast } from './SpellCastPopup'
import ConfirmModal from './ConfirmModal'
import { minutesUntil, waitWords, useCountdownClock } from '../lib/countdown'
import ErrorLine from './ErrorLine'

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
    /** No cooldown: the spell sets its own limit (Larder Ward, one ward at a time). */
    ownLimit?: boolean
    xp: number
    vigilMinutes: number
    offering: string | null
    writ: string | null
    hasOffering: boolean
    hasWrit: boolean
    /** Larder Ward: the ward that holds now, and the head it would cover if cast now. */
    ward?: { endsAt: string; head: number; paid: number } | null
    /** Larder Ward: standing at the farmstead (where it is cast), its town, and when the last ward ran out. */
    wardAtFarm?: boolean
    wardTown?: string
    wardLastEndedAt?: string | null
    farmHead?: number
    /** Wearsight: the last reading of each look, newest first. */
    readings?: WearReading[]
}

/** One piece of gear or one tool, as Wearsight read it (server: WearLine in services/spells.ts). */
interface WearLine {
    name: string
    where: string
    /** Sure uses left, as a whole percent. */
    pct: number
    past: boolean
    breakPct: number | null
    broken?: boolean
}

interface WearReading { look: 'worn' | 'pack' | 'benches'; at: string; lines: WearLine[] }

const LOOK_WORDS: Record<WearReading['look'], string> = { worn: 'What you wear', pack: 'What you carry', benches: 'Your bench tools' }

/** One choice a spell needs before it is cast (Daily Step's places, Larder Ward's hours). */
interface SpellTarget {
    label: string
    cost: number
    params: Record<string, unknown>
    detail?: unknown
}

/** Spells that ask for a choice first. */
const PICKS_TARGET = new Set(['wearsight', 'daily_step', 'larder_ward', 'sending', 'kindle', 'portal'])

/** What a spell's cost says on its card, for those priced by what they cover. */
function costText(s: SpellView): string {
    if (s.key === 'daily_step') return 'Talar by the road'
    if (s.key === 'larder_ward') return `${s.cost} Talar a head an hour`
    if (s.key === 'portal') return `${s.cost} Talar and more by the road`
    if (s.key === 'wearsight') return `${s.cost} Talar, more for pack or benches`
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
    if (s.ownLimit) return s.key === 'larder_ward' ? 'One ward at a time' : 'One at a time'
    if (s.cooldownKind === 'daily') return 'Once a day'
    if (s.cooldownKind === 'per_death') return 'One fall at a time'
    const m = Math.round((s.cooldownSeconds ?? 0) / 60)
    return m >= 60 ? `Every ${Math.round(m / 60)} h` : `Every ${m} min`
}

/** "45 min", or "6 h 29 min" once it runs past an hour. */

/** What one line of a reading says of its piece. */
function wearWords(d: WearLine): string {
    if (d.broken) return 'broken; the bench makes do at half speed'
    if (!d.past) return `${d.pct}% of its sure uses left`
    return d.breakPct !== null
        ? `sure uses spent; ${d.breakPct}% chance to break each use`
        : 'sure uses spent; any use may break it'
}

/** When a reading was taken, in the player's own clock. */
function readingTime(at: string): string {
    return new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Wearsight's kept readings: one fold per look, the newest open when just cast. */
function WearReadings({ readings, fresh }: { readings: WearReading[]; fresh: string | null }) {
    if (!readings.length) return null
    return (
        <div className="spell-readings">
            {readings.map(r => (
                <details key={r.look} className="spell-reading-fold" open={fresh === r.at}>
                    <summary>
                        <span className="gold-text">{LOOK_WORDS[r.look]}</span>
                        <span className="muted-text tabular-num"> · {readingTime(r.at)}</span>
                    </summary>
                    {r.lines.length === 0
                        ? <p className="spell-needs muted-text">Nothing that could wear out.</p>
                        : <ul className="spell-reading">
                            {r.lines.map((d, i) => (
                                <li key={`${d.where}:${d.name}:${i}`} className={d.past ? 'spell-wear-past' : undefined}>
                                    <span className="gold-text">{d.name}</span>
                                    <span className="muted-text"> ({d.where})</span>: <span className="tabular-num">{wearWords(d)}</span>
                                </li>
                            ))}
                        </ul>}
                </details>
            ))}
        </div>
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

    // Lift a Larder Ward early: the Talar of the hours it had left comes back.
    const [confirmEnd, setConfirmEnd] = useState(false)
    const endWard = async () => {
        setConfirmEnd(false)
        setBusy(true)
        try {
            const res = await apiFetch<{ message: string; talar: Talar }>('/api/talar/spells/larder_ward/end', { method: 'POST' })
            announceTalar(res.talar)
            setNote({ text: res.message, error: false })
            load()
        } catch (err) {
            setNote({ text: (err as { message?: string }).message || 'Nothing happens.', error: true })
        } finally { setBusy(false) }
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

    // Cooldowns count down while the book is open, and a spell turns ready on its own.
    const now = useCountdownClock(!!spells?.some(s => s.readyAt || s.ward))

    if (!spells) return <p className="farm-empty">{note?.text ?? 'Turning the pages…'}</p>

    const shown = mode === 'cast' ? spells.filter(s => s.learned) : spells
    return (
        <div className="spell-list">
            {lastCast && <SpellCastPopup cast={lastCast} onClose={closeCast} />}
            {confirmEnd && (
                <ConfirmModal
                    message="Lift the Larder Ward now? The Talar for the hours it has left comes back to you, and you can cast it again at once."
                    confirmLabel="End the Ward"
                    onConfirm={endWard}
                    onCancel={() => setConfirmEnd(false)}
                />
            )}
            <ErrorLine message={note?.text} className={note?.error ? 'farm-error' : 'farm-note'} />
            {mode === 'cast' && shown.length === 0 && (
                <p className="farm-empty">You know no workings yet. They are taught in a church.</p>
            )}
            {shown.map(s => {
                const waiting = s.readyAt ? minutesUntil(s.readyAt, now) : 0
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
                        {mode === 'cast' && s.key === 'larder_ward' && (() => {
                            const ward = s.ward && new Date(s.ward.endsAt).getTime() > now ? s.ward : null
                            if (ward) {
                                const left = minutesUntil(ward.endsAt, now)
                                return (
                                    <p className="spell-needs gold-text">
                                        Holding over {ward.head} head for {waitWords(left)} more. Paid {ward.paid.toLocaleString(undefined, { maximumFractionDigits: 2 })} Talar. Its XP comes for the hours it holds.
                                    </p>
                                )
                            }
                            const head = s.farmHead ?? 0
                            const ago = s.wardLastEndedAt ? Math.max(0, Math.floor((now - new Date(s.wardLastEndedAt).getTime()) / 60000)) : null
                            return (
                                <>
                                    <p className="spell-needs muted-text">
                                        {head > 0
                                            ? `${head} head in your pens: ${(s.cost * head).toLocaleString(undefined, { maximumFractionDigits: 2 })} Talar an hour.`
                                            : 'Nothing in your pens to ward.'}
                                        {ago !== null && ` No ward holds now; the last one ran out ${ago < 1 ? 'just now' : `${waitWords(ago)} ago`}.`}
                                    </p>
                                    {s.wardAtFarm === false && head > 0 && (
                                        <p className="spell-needs muted-text">Cast it standing at your farmstead in {s.wardTown ?? 'Novita'}.</p>
                                    )}
                                </>
                            )
                        })()}
                        {mode === 'learn' && !s.learned && (s.offering || s.writ) && (
                            <p className="spell-needs muted-text">
                                {s.offering && <>Offer: <span className={s.hasOffering ? 'gold-text' : 'spell-missing'}>1 {s.offering}</span></>}
                                {s.writ && <>{s.offering ? ' · ' : ''}Needs: <span className={s.hasWrit ? 'gold-text' : 'spell-missing'}>{s.writ}</span>
                                    {!s.hasWrit && ' (not yet found)'}</>}
                            </p>
                        )}
                        <div className="spell-actions">
                            {mode === 'cast' && s.key === 'larder_ward' && s.ward && new Date(s.ward.endsAt).getTime() > now ? (
                                <button className="btn" disabled={busy} onClick={() => setConfirmEnd(true)}>End the Ward</button>
                            ) : mode === 'cast' && (
                                <button className="btn btn-gold" disabled={busy || waiting > 0 || s.armed || (s.key === 'larder_ward' && s.wardAtFarm === false)}
                                    onClick={() => PICKS_TARGET.has(s.key) ? pickTarget(s) : cast(s)}>
                                    {s.armed ? 'Holding' : waiting > 0 ? `Ready in ${waitWords(waiting)}` : 'Cast'}
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
                        {s.key === 'wearsight' && s.readings && (
                            <WearReadings readings={s.readings}
                                fresh={reading?.key === s.key ? (reading.detail as WearReading | undefined)?.at ?? null : null} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
