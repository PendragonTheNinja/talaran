import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { onWorldEventsChanged, timeLeft, endedWords, isMerchant } from '../lib/worldEvents'
import ConfirmModal from './ConfirmModal'
import './AdminEvents.css'

/**
 * The Events tab (docs/WORLD-EVENTS-AND-MUSEUMS.md, "Admin: an Events section").
 *
 * Everything the scheduler and the roster use is a row, so all of it is
 * adjustable here: live events, starting one now, the roster, the scheduler's
 * dials, and what happened. The server validates every number; this form only
 * collects them and shows its answer.
 */

interface LiveEvent {
    id: number
    name: string
    kind: string
    /** The merchant's cart, on his live visit. */
    stock?: { name: string; price: number; left: number; total: number }[]
    skill: string | null
    location: string | null
    multiplier: number
    poolTotal: number
    poolLeft: number
    paidOut: number
    startsAt: string
    endsAt: string
    endedAt: string | null
    endReason: 'time' | 'pool' | 'admin' | null
    startedBy: string | null
    announcement: string | null
}

interface EventType {
    id: number
    key: string
    name: string
    skill: string | null
    rarity: string
    weight: number
    minMinutes: number
    maxMinutes: number
    minPool: number
    maxPool: number
    multiplier: number
    locationIds: number[]
    cooldownMinutes: number
    startText: string
    isActive: boolean
    eligiblePlaces: number
}

interface Settings { schedulerEnabled: boolean; averageGapMinutes: number; maxConcurrent: number }

interface MerchantSettings {
    enabled: boolean
    nextAt: string | null
    everyDays: number
    stayMinutes: number
    lines: number
    lineGold: number
    arrivalText: string
    places: number
}

interface Extra { id: number; itemId: number; name: string; chancePercent: number; minQty: number; maxQty: number; isActive: boolean }

interface Overview {
    merchant: MerchantSettings
    extras: Extra[]
    items: { id: number; name: string }[]
    live: LiveEvent[]
    history: LiveEvent[]
    types: EventType[]
    settings: Settings
    skills: string[]
    locations: { id: number; name: string; region: string }[]
}

const bonus = (m: number) => `+${Math.round((m - 1) * 100)}%`

export default function AdminEvents() {
    const [data, setData] = useState<Overview | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [now, setNow] = useState(() => Date.now())

    const load = useCallback(() => {
        apiFetch<Overview>('/api/admin/events')
            .then(setData)
            .catch(() => setError('Could not load events.'))
    }, [])

    useEffect(() => {
        load()
        const unsubscribe = onWorldEventsChanged(load)
        // Pools drain with every boosted action; re-read them now and then,
        // and tick the countdowns every few seconds.
        const refresh = setInterval(load, 30_000)
        const clock = setInterval(() => setNow(Date.now()), 5_000)
        return () => { unsubscribe(); clearInterval(refresh); clearInterval(clock) }
    }, [load])

    /** POST, then show the server's answer and reload. True when it worked. */
    const send = async (path: string, body: unknown, done: string): Promise<boolean> => {
        setError(null); setSuccess(null)
        try {
            await apiFetch(`/api/admin/events${path}`, { method: 'POST', body: JSON.stringify(body) })
            setSuccess(done)
            load()
            return true
        } catch (e) {
            setError(e instanceof Error && e.message ? e.message : 'That did not work.')
            return false
        }
    }

    if (!data) return <div className="admin-events"><p className="ev-admin-note">{error ?? 'Loading events…'}</p></div>

    return (
        <div className="admin-events">
            {error && <p className="guild-error">{error}</p>}
            {success && <p className="guild-success">{success}</p>}

            <div className="admin-action-card">
                <p className="admin-section-title">🎉 Live Events ({data.live.length})</p>
                {data.live.length === 0
                    ? <p className="ev-admin-note">Nothing is running.</p>
                    : data.live.map(e => <LiveCard key={e.id} event={e} now={now} send={send} />)}
            </div>

            <StartCard data={data} send={send} />

            <MerchantCard key={JSON.stringify(data.merchant)} data={data} send={send} />

            {/* Keyed on the saved values, so the form starts over from the
                server's when they change under it (another admin, a reload). */}
            <SchedulerCard key={JSON.stringify(data.settings)} settings={data.settings} send={send} />

            <div className="admin-action-card">
                <p className="admin-section-title">📜 Roster ({data.types.length})</p>
                <p className="ev-admin-note">
                    Weight is how often the scheduler picks a type; 0 means only by hand. Pinned places
                    override the default, which is wherever that skill's work is.
                </p>
                {data.types.map(t => (
                    <TypeEditor key={t.id} type={t} data={data} send={send} />
                ))}
                <TypeEditor data={data} send={send} />
            </div>

            <div className="admin-action-card">
                <p className="admin-section-title">📖 History (last {data.history.length})</p>
                {data.history.length === 0
                    ? <p className="ev-admin-note">No event has ended yet.</p>
                    : (
                        <div className="ev-admin-history">
                            {data.history.map(e => (
                                <div key={e.id} className="ev-admin-history-row">
                                    <span className="ev-admin-name">{e.name}</span>
                                    <span>{isMerchant(e) ? 'visiting' : e.skill} at {e.location ?? 'nowhere'}</span>
                                    <span>{endedWords(e)}</span>
                                    <span className="tabular-num">{e.paidOut.toLocaleString()} of {e.poolTotal.toLocaleString()} {isMerchant(e) ? 'sold' : 'paid'}</span>
                                    <span>{e.endedAt ? new Date(e.endedAt).toLocaleString() : ''}</span>
                                    <span>{e.startedBy ? `by ${e.startedBy}` : 'scheduler'}</span>
                                </div>
                            ))}
                        </div>
                    )}
            </div>
        </div>
    )
}

type Send = (path: string, body: unknown, done: string) => Promise<boolean>

/** One running event: its numbers, and a form to change them or end it. */
function LiveCard({ event, now, send }: { event: LiveEvent; now: number; send: Send }) {
    const [minutes, setMinutes] = useState('')
    const [pool, setPool] = useState('')
    const [mult, setMult] = useState('')
    const [announcement, setAnnouncement] = useState(event.announcement ?? '')
    const [confirmEnd, setConfirmEnd] = useState(false)

    const merchant = isMerchant(event)

    const save = async () => {
        const body: Record<string, unknown> = {}
        if (minutes) body.endsInMinutes = minutes
        if (pool) body.poolLeft = pool
        if (mult) body.multiplier = mult
        if (announcement !== (event.announcement ?? '')) body.announcement = announcement
        if (await send(`/live/${event.id}`, body, `${event.name} updated.`)) {
            setMinutes(''); setPool(''); setMult('')
        }
    }

    return (
        <div className="ev-admin-live">
            <div className="ev-admin-live-head">
                <span className="ev-admin-name">{event.name}</span>
                <span>{merchant ? 'visiting' : event.skill} at {event.location ?? 'nowhere'}</span>
                {!merchant && <span className="gold-text">{bonus(event.multiplier)}</span>}
                <span className="tabular-num">{timeLeft(event.endsAt, now)} left</span>
                <span className="tabular-num">
                    {event.poolLeft.toLocaleString()} of {event.poolTotal.toLocaleString()} {merchant ? 'unsold' : 'left'}
                    {' '}({event.paidOut.toLocaleString()} {merchant ? 'sold' : 'paid'})
                </span>
                <span className="ev-admin-muted">{event.startedBy ? `started by ${event.startedBy}` : 'scheduler'}</span>
            </div>
            {merchant && event.stock && (
                <div className="ev-admin-stock">
                    {event.stock.map(l => (
                        <span key={l.name} className="tabular-num">{l.left}/{l.total} {l.name} @ {l.price}g</span>
                    ))}
                </div>
            )}
            <div className="ev-admin-fields">
                <label>Minutes left<input className="chat-input" type="number" min={1} value={minutes} placeholder="unchanged" onChange={e => setMinutes(e.target.value)} /></label>
                {!merchant && (
                    <>
                        <label>Actions left<input className="chat-input" type="number" min={1} value={pool} placeholder={String(event.poolLeft)} onChange={e => setPool(e.target.value)} /></label>
                        <label>Multiplier<input className="chat-input" type="number" step={0.05} min={1} value={mult} placeholder={event.multiplier.toFixed(2)} onChange={e => setMult(e.target.value)} /></label>
                    </>
                )}
            </div>
            <label className="ev-admin-wide">Announcement (shown in the Events panel)
                <textarea className="chat-input" rows={2} value={announcement} onChange={e => setAnnouncement(e.target.value)} />
            </label>
            <div className="ev-admin-actions">
                <button className="btn btn-gold" onClick={save}>Save</button>
                <button className="btn btn-red" onClick={() => setConfirmEnd(true)}>End Now</button>
            </div>
            {confirmEnd && (
                <ConfirmModal
                    message={`End ${event.name} at ${event.location ?? 'nowhere'} now? The bonus stops for everyone.`}
                    confirmLabel="End It"
                    onConfirm={() => { setConfirmEnd(false); send(`/live/${event.id}/end`, {}, `${event.name} ended.`) }}
                    onCancel={() => setConfirmEnd(false)}
                />
            )}
        </div>
    )
}

/** Start a roster type or a one-off, anywhere, ignoring the scheduler's limits. */
function StartCard({ data, send }: { data: Overview; send: Send }) {
    const [typeId, setTypeId] = useState<string>(data.types[0] ? String(data.types[0].id) : 'oneoff')
    const [locationId, setLocationId] = useState('')
    const [minutes, setMinutes] = useState('')
    const [pool, setPool] = useState('')
    const [mult, setMult] = useState('')
    const [name, setName] = useState('')
    const [skill, setSkill] = useState(data.skills[0] ?? '')
    const [announcement, setAnnouncement] = useState('')

    const oneOff = typeId === 'oneoff'
    const type = data.types.find(t => String(t.id) === typeId)

    const start = async () => {
        const body: Record<string, unknown> = { locationId, minutes, pool, multiplier: mult }
        if (oneOff) Object.assign(body, { name, skill, announcement })
        else Object.assign(body, { typeId, announcement: announcement || undefined })
        const label = oneOff ? name : type?.name
        if (await send('/start', body, `${label} started.`)) {
            setMinutes(''); setPool(''); setMult(''); setAnnouncement('')
        }
    }

    return (
        <div className="admin-action-card">
            <p className="admin-section-title">▶️ Start an Event</p>
            <div className="ev-admin-fields">
                <label>Event
                    <select className="chat-input" value={typeId} onChange={e => setTypeId(e.target.value)}>
                        {data.types.map(t => <option key={t.id} value={t.id}>{t.name} ({t.skill})</option>)}
                        <option value="oneoff">One-off…</option>
                    </select>
                </label>
                <label>Place
                    <select className="chat-input" value={locationId} onChange={e => setLocationId(e.target.value)}>
                        <option value="">Random, where the work is</option>
                        {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </label>
                <label>Minutes<input className="chat-input" type="number" min={1} value={minutes} onChange={e => setMinutes(e.target.value)}
                    placeholder={type ? `${type.minMinutes} to ${type.maxMinutes}` : '60'} /></label>
                <label>Pool<input className="chat-input" type="number" min={1} value={pool} onChange={e => setPool(e.target.value)}
                    placeholder={type ? `${type.minPool} to ${type.maxPool}` : '300'} /></label>
                <label>Multiplier<input className="chat-input" type="number" step={0.05} min={1} value={mult} onChange={e => setMult(e.target.value)}
                    placeholder={type ? type.multiplier.toFixed(2) : '1.25'} /></label>
                {oneOff && (
                    <>
                        <label>Name<input className="chat-input" value={name} onChange={e => setName(e.target.value)} /></label>
                        <label>Skill
                            <select className="chat-input" value={skill} onChange={e => setSkill(e.target.value)}>
                                {data.skills.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                    </>
                )}
            </div>
            <label className="ev-admin-wide">
                Chat line{oneOff ? '' : ' (blank uses the roster line)'}; {'{location}'} is filled in
                <textarea className="chat-input" rows={2} value={announcement} onChange={e => setAnnouncement(e.target.value)}
                    placeholder={type?.startText ?? ''} />
            </label>
            <div className="ev-admin-actions">
                <button className="btn btn-gold" onClick={start}>Start</button>
            </div>
        </div>
    )
}

function SchedulerCard({ settings, send }: { settings: Settings; send: Send }) {
    const [enabled, setEnabled] = useState(settings.schedulerEnabled)
    const [gap, setGap] = useState(String(settings.averageGapMinutes))
    const [most, setMost] = useState(String(settings.maxConcurrent))

    return (
        <div className="admin-action-card">
            <p className="admin-section-title">⏱ Scheduler</p>
            <div className="ev-admin-fields">
                <label className="ev-admin-check">
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                    Starts events on its own
                </label>
                <label>Average gap (minutes)<input className="chat-input" type="number" min={1} value={gap} onChange={e => setGap(e.target.value)} /></label>
                <label>Most at once<input className="chat-input" type="number" min={0} value={most} onChange={e => setMost(e.target.value)} /></label>
            </div>
            <p className="ev-admin-note">Never two for one skill or one place at once. Each type's cooldown is on the roster.</p>
            <div className="ev-admin-actions">
                <button className="btn btn-gold" onClick={() => send('/settings',
                    { schedulerEnabled: enabled, averageGapMinutes: gap, maxConcurrent: most }, 'Scheduler saved.')}>Save</button>
            </div>
        </div>
    )
}

/** One roster type, collapsed to a line until opened. With no `type`, adds a new one. */
function TypeEditor({ type, data, send }: { type?: EventType; data: Overview; send: Send }) {
    const blank = {
        name: '', skill: data.skills[0] ?? '', rarity: 'common', weight: '6', minMinutes: '60', maxMinutes: '120',
        minPool: '300', maxPool: '500', multiplier: '1.25', cooldownMinutes: '360', startText: '', isActive: true,
        locationIds: [] as number[],
    }
    const fromType = (t: EventType) => ({
        name: t.name, skill: t.skill ?? '', rarity: t.rarity, weight: String(t.weight),
        minMinutes: String(t.minMinutes), maxMinutes: String(t.maxMinutes),
        minPool: String(t.minPool), maxPool: String(t.maxPool), multiplier: t.multiplier.toFixed(2),
        cooldownMinutes: String(t.cooldownMinutes), startText: t.startText, isActive: t.isActive,
        locationIds: t.locationIds,
    })
    const [open, setOpen] = useState(false)
    const [f, setF] = useState(() => type ? fromType(type) : blank)
    const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(prev => ({ ...prev, [k]: e.target.value }))

    const save = async () => {
        const ok = type
            ? await send(`/types/${type.id}`, f, `${f.name} saved.`)
            : await send('/types', f, `${f.name} added to the roster.`)
        if (ok && !type) { setF(blank); setOpen(false) }
    }

    if (!open) {
        return type ? (
            <button className={`ev-admin-type-line ${type.isActive ? '' : 'inactive'}`} onClick={() => { setF(fromType(type)); setOpen(true) }}>
                <span className="ev-admin-name">{type.name}</span>
                <span>{type.skill}</span>
                <span>{type.rarity}, weight {type.weight}</span>
                <span className="tabular-num">{type.minMinutes} to {type.maxMinutes} min</span>
                <span className="tabular-num">pool {type.minPool} to {type.maxPool}</span>
                <span className="gold-text">{bonus(type.multiplier)}</span>
                <span className={type.eligiblePlaces ? '' : 'ev-admin-warn'}>
                    {type.locationIds.length ? `${type.locationIds.length} pinned` : `${type.eligiblePlaces} place${type.eligiblePlaces === 1 ? '' : 's'}`}
                    {type.eligiblePlaces ? '' : ', never picked'}
                </span>
                <span>{type.isActive ? '' : 'off'}</span>
            </button>
        ) : (
            <button className="btn ev-admin-add" onClick={() => setOpen(true)}>+ Add a Type</button>
        )
    }

    return (
        <div className="ev-admin-type-edit">
            <div className="ev-admin-fields">
                <label>Name<input className="chat-input" value={f.name} onChange={set('name')} /></label>
                <label>Skill
                    <select className="chat-input" value={f.skill} onChange={set('skill')}>
                        {data.skills.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                <label>Rarity
                    <select className="chat-input" value={f.rarity} onChange={set('rarity')}>
                        <option value="common">Common</option>
                        <option value="uncommon">Uncommon</option>
                        <option value="rare">Rare</option>
                    </select>
                </label>
                <label>Weight<input className="chat-input" type="number" min={0} value={f.weight} onChange={set('weight')} /></label>
                <label>Shortest (min)<input className="chat-input" type="number" min={1} value={f.minMinutes} onChange={set('minMinutes')} /></label>
                <label>Longest (min)<input className="chat-input" type="number" min={1} value={f.maxMinutes} onChange={set('maxMinutes')} /></label>
                <label>Smallest pool<input className="chat-input" type="number" min={1} value={f.minPool} onChange={set('minPool')} /></label>
                <label>Largest pool<input className="chat-input" type="number" min={1} value={f.maxPool} onChange={set('maxPool')} /></label>
                <label>Multiplier<input className="chat-input" type="number" step={0.05} min={1} value={f.multiplier} onChange={set('multiplier')} /></label>
                <label>Cooldown (min)<input className="chat-input" type="number" min={0} value={f.cooldownMinutes} onChange={set('cooldownMinutes')} /></label>
                <label className="ev-admin-check">
                    <input type="checkbox" checked={f.isActive} onChange={e => setF(prev => ({ ...prev, isActive: e.target.checked }))} />
                    Scheduler may pick it
                </label>
            </div>
            <label className="ev-admin-wide">Chat line when it starts; {'{location}'} is filled in
                <textarea className="chat-input" rows={2} value={f.startText} onChange={set('startText')} />
            </label>
            <label className="ev-admin-wide">Pinned places (none: wherever the skill's work is; hold Ctrl to pick several)
                <select className="chat-input" multiple size={5} value={f.locationIds.map(String)}
                    onChange={e => {
                        const ids = Array.from(e.target.selectedOptions, o => Number(o.value))
                        setF(prev => ({ ...prev, locationIds: ids }))
                    }}>
                    {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
            </label>
            <div className="ev-admin-actions">
                <button className="btn btn-gold" onClick={save}>{type ? 'Save' : 'Add'}</button>
                <button className="btn" onClick={() => setOpen(false)}>Close</button>
            </div>
        </div>
    )
}

/**
 * The travelling merchant: his calendar and cart size, bringing him now, and
 * the extras list (items that can turn up in his cart wherever he is).
 */
function MerchantCard({ data, send }: { data: Overview; send: Send }) {
    const m = data.merchant
    const [enabled, setEnabled] = useState(m.enabled)
    const [nextIn, setNextIn] = useState('')
    const [every, setEvery] = useState(String(m.everyDays))
    const [stay, setStay] = useState(String(m.stayMinutes))
    const [lines, setLines] = useState(String(m.lines))
    const [lineGold, setLineGold] = useState(String(m.lineGold))
    const [arrival, setArrival] = useState(m.arrivalText)
    const [summonAt, setSummonAt] = useState('')
    const [summonStay, setSummonStay] = useState('')
    const [extraItem, setExtraItem] = useState('')
    const [extraChance, setExtraChance] = useState('50')
    const [extraMin, setExtraMin] = useState('1')
    const [extraMax, setExtraMax] = useState('1')
    const out = data.live.some(isMerchant)

    const saveSettings = () => send('/merchant/settings', {
        enabled, nextInHours: nextIn || undefined, everyDays: every, stayMinutes: stay,
        lines, lineGold, arrivalText: arrival,
    }, 'Merchant saved.')

    const saveExtra = async () => {
        const name = data.items.find(i => String(i.id) === extraItem)?.name ?? 'Item'
        if (await send('/merchant/extras', {
            itemId: extraItem, chancePercent: extraChance, minQty: extraMin, maxQty: extraMax,
        }, `${name} is on the extras list.`)) setExtraItem('')
    }

    return (
        <div className="admin-action-card">
            <p className="admin-section-title">🛒 Travelling Merchant</p>
            <p className="ev-admin-note">
                {out
                    ? 'He is out now (see Live Events).'
                    : m.enabled && m.nextAt
                        ? `Next due ${new Date(m.nextAt).toLocaleString()}.`
                        : m.enabled ? 'His first visit is set within a minute of the scheduler running.' : 'He is off: he only comes when summoned.'}
                {' '}{m.places} place{m.places === 1 ? '' : 's'} have something he could carry.
            </p>

            <div className="ev-admin-fields">
                <label className="ev-admin-check">
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                    Visits on his own
                </label>
                <label>Next visit in (hours)<input className="chat-input" type="number" min={0} value={nextIn} placeholder="unchanged" onChange={e => setNextIn(e.target.value)} /></label>
                <label>Every (days)<input className="chat-input" type="number" min={1} value={every} onChange={e => setEvery(e.target.value)} /></label>
                <label>Stays (minutes)<input className="chat-input" type="number" min={10} value={stay} onChange={e => setStay(e.target.value)} /></label>
                <label>Lines he carries<input className="chat-input" type="number" min={1} value={lines} onChange={e => setLines(e.target.value)} /></label>
                <label>Gold of goods per line<input className="chat-input" type="number" min={1} value={lineGold} onChange={e => setLineGold(e.target.value)} /></label>
            </div>
            <label className="ev-admin-wide">Arrival line; {'{location}'} is filled in
                <textarea className="chat-input" rows={2} value={arrival} onChange={e => setArrival(e.target.value)} />
            </label>
            <div className="ev-admin-actions">
                <button className="btn btn-gold" onClick={saveSettings}>Save</button>
            </div>

            <p className="admin-section-title ev-admin-subtitle">Summon Now</p>
            <div className="ev-admin-fields">
                <label>Place
                    <select className="chat-input" value={summonAt} onChange={e => setSummonAt(e.target.value)}>
                        <option value="">Random, somewhere with goods</option>
                        {data.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </label>
                <label>Stays (minutes)<input className="chat-input" type="number" min={1} value={summonStay} placeholder={String(m.stayMinutes)} onChange={e => setSummonStay(e.target.value)} /></label>
            </div>
            <div className="ev-admin-actions">
                <button className="btn btn-gold" disabled={out}
                    onClick={() => send('/merchant/summon', { locationId: summonAt, stayMinutes: summonStay }, 'He is on his way.')}>
                    Summon
                </button>
            </div>

            <p className="admin-section-title ev-admin-subtitle">Extras List</p>
            <p className="ev-admin-note">Each visit, every line here has its chance of being in his cart, wherever he is.</p>
            {data.extras.map(x => (
                <div key={x.id} className={`ev-admin-history-row ${x.isActive ? '' : 'ev-admin-muted'}`}>
                    <span className="ev-admin-name">{x.name}</span>
                    <span>{x.chancePercent}% a visit</span>
                    <span className="tabular-num">{x.minQty === x.maxQty ? x.minQty : `${x.minQty} to ${x.maxQty}`} at a time</span>
                    <button className="btn" onClick={() => send(`/merchant/extras/${x.id}/delete`, {}, `${x.name} is off the extras list.`)}>Remove</button>
                </div>
            ))}
            <div className="ev-admin-fields ev-admin-extra-add">
                <label>Item
                    <select className="chat-input" value={extraItem} onChange={e => setExtraItem(e.target.value)}>
                        <option value="">Pick an item…</option>
                        {data.items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                </label>
                <label>Chance (%)<input className="chat-input" type="number" min={1} max={100} value={extraChance} onChange={e => setExtraChance(e.target.value)} /></label>
                <label>Fewest<input className="chat-input" type="number" min={1} value={extraMin} onChange={e => setExtraMin(e.target.value)} /></label>
                <label>Most<input className="chat-input" type="number" min={1} value={extraMax} onChange={e => setExtraMax(e.target.value)} /></label>
            </div>
            <div className="ev-admin-actions">
                <button className="btn btn-gold" disabled={!extraItem} onClick={saveExtra}>Add or Update</button>
            </div>
        </div>
    )
}
