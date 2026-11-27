import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { onWorldEventsChanged, timeLeft } from '../lib/worldEvents'
import ConfirmModal from './ConfirmModal'
import ErrorLine from './ErrorLine'
import './AdminEvents.css'

/**
 * Tears (docs/invasions-spec.md §3): send one, and watch or close those sent.
 * Inside the admin Events tab, and the whole Tears tab for a moderator with
 * can_run_events. The server checks who is asking and validates every number;
 * this form only collects them.
 */

interface Realm {
    id: number
    key: string
    name: string
    description: string | null
    warning_line: string
    open_line: string
    is_active: boolean
    creatures: { name: string; level: number; tier: number }[]
}

interface Tear {
    id: number
    name: string
    location: string | null
    island: string | null
    pool_total: number
    pool_left: number
    xp_multiplier: string | number
    min_kills: number | null
    per_player_cap: number | null
    starts_at: string
    ends_at: string
    warn_at: string | null
    warned_at: string | null
    opened_at: string | null
    ended_at: string | null
    end_reason: 'pool' | 'time' | 'admin' | null
    standings: { name: string; kills: number }[]
    rewards: { place: number; name: string; kills: number; gold: number }[]
}

interface Overview {
    realms: Realm[]
    tears: Tear[]
    locations: { id: number; name: string; region: string | null }[]
}

const ENDED: Record<string, string> = { pool: 'held', time: 'closed on its own', admin: 'closed by staff' }

export default function AdminTears() {
    const [data, setData] = useState<Overview | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [now, setNow] = useState(() => Date.now())

    const load = useCallback(() => {
        apiFetch<Overview>('/api/admin/events/tears')
            .then(setData)
            .catch(() => setError('Could not load tears.'))
    }, [])

    useEffect(() => {
        load()
        const unsubscribe = onWorldEventsChanged(load)
        // The horde drains with every kill; re-read it now and then.
        const refresh = setInterval(load, 15_000)
        const clock = setInterval(() => setNow(Date.now()), 5_000)
        return () => { unsubscribe(); clearInterval(refresh); clearInterval(clock) }
    }, [load])

    const post = async (path: string, body: unknown, done: string): Promise<boolean> => {
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

    if (!data) return <div className="admin-action-card"><p className="ev-admin-note">{error ?? 'Loading tears…'}</p></div>

    return (
        <>
            <ErrorLine message={error} className="guild-error" />
            {success && <p className="guild-success">{success}</p>}
            <SendCard data={data} post={post} />
            <div className="admin-action-card">
                <p className="admin-section-title">🌀 Tears ({data.tears.length})</p>
                {data.tears.length === 0
                    ? <p className="ev-admin-note">No tear is sent or open, and none closed today.</p>
                    : data.tears.map(t => <TearCard key={t.id} tear={t} now={now} post={post} />)}
            </div>
        </>
    )
}

type Post = (path: string, body: unknown, done: string) => Promise<boolean>

function SendCard({ data, post }: { data: Overview; post: Post }) {
    const [realms, setRealms] = useState<string[]>(data.realms[0] ? [data.realms[0].key] : [])
    const [locationId, setLocationId] = useState('')
    const [horde, setHorde] = useState('')
    const [minutes, setMinutes] = useState('')
    const [mult, setMult] = useState('')
    const [minKills, setMinKills] = useState('')
    const [warnMinutes, setWarnMinutes] = useState('15')
    const [opensIn, setOpensIn] = useState('')
    const [cap, setCap] = useState('')
    const [warningLine, setWarningLine] = useState('')
    const [openLine, setOpenLine] = useState('')
    const [confirm, setConfirm] = useState(false)

    const place = data.locations.find(l => String(l.id) === locationId)
    const first = data.realms.find(r => r.key === realms[0])
    const toggle = (key: string) => setRealms(rs => rs.includes(key) ? rs.filter(k => k !== key) : [...rs, key])

    const send = async () => {
        setConfirm(false)
        const ok = await post('/tears/send', {
            realms, locationId, horde, minutes, multiplier: mult, minKills, warnMinutes, opensInMinutes: opensIn,
            perPlayerCap: cap, warningLine: warningLine || undefined, openLine: openLine || undefined,
        }, `Tear sent to ${place?.name ?? 'that place'}.`)
        if (ok) { setWarningLine(''); setOpenLine('') }
    }

    return (
        <div className="admin-action-card">
            <p className="admin-section-title">🌀 Send a Tear</p>
            <p className="ev-admin-note">
                Creatures come through from each realm chosen, those whose level suits the island the place is on.
                Blank numbers take the defaults: a horde of 300 on Taiar and 250 on Antura, two hours, +25%, five kills to place.
            </p>
            <div className="ev-admin-fields">
                {data.realms.map(r => (
                    <label key={r.key} className="ev-admin-check">
                        <input type="checkbox" checked={realms.includes(r.key)} disabled={!r.is_active} onChange={() => toggle(r.key)} />
                        {r.name}
                    </label>
                ))}
            </div>
            {data.realms.filter(r => realms.includes(r.key)).map(r => (
                <p key={r.key} className="ev-admin-note">
                    <strong>{r.name}:</strong>{' '}
                    {[1, 2].map(tier => {
                        const of = r.creatures.filter(c => c.tier === tier)
                        return of.length ? `tier ${tier}: ${of.map(c => `${c.name} ${c.level}`).join(', ')}` : null
                    }).filter(Boolean).join(' · ')}
                </p>
            ))}
            <div className="ev-admin-fields">
                <label>Place
                    <select className="chat-input" value={locationId} onChange={e => setLocationId(e.target.value)}>
                        <option value="">Choose…</option>
                        {data.locations.map(l => <option key={l.id} value={l.id}>{l.region ? `${l.region}: ` : ''}{l.name}</option>)}
                    </select>
                </label>
                <label>Horde<input className="chat-input" type="number" min={10} value={horde} placeholder="300 / 250" onChange={e => setHorde(e.target.value)} /></label>
                <label>Minutes open<input className="chat-input" type="number" min={10} value={minutes} placeholder="120" onChange={e => setMinutes(e.target.value)} /></label>
                <label>Multiplier<input className="chat-input" type="number" step={0.05} min={1} value={mult} placeholder="1.25" onChange={e => setMult(e.target.value)} /></label>
                <label>Kills to place<input className="chat-input" type="number" min={1} value={minKills} placeholder="5" onChange={e => setMinKills(e.target.value)} /></label>
                <label>Opens in (minutes)<input className="chat-input" type="number" min={0} value={opensIn} placeholder="now" onChange={e => setOpensIn(e.target.value)} /></label>
                <label>Warning (minutes before)<input className="chat-input" type="number" min={0} value={warnMinutes} placeholder="none" onChange={e => setWarnMinutes(e.target.value)} /></label>
                <label>Kills a player may count<input className="chat-input" type="number" min={1} value={cap} placeholder="no limit" onChange={e => setCap(e.target.value)} /></label>
            </div>
            <label className="ev-admin-wide">
                Warning line (blank uses the realm's); {'{location}'} is filled in
                <textarea className="chat-input" rows={2} value={warningLine} onChange={e => setWarningLine(e.target.value)} placeholder={first?.warning_line ?? ''} />
            </label>
            <label className="ev-admin-wide">
                Opening line (blank uses the realm's)
                <textarea className="chat-input" rows={2} value={openLine} onChange={e => setOpenLine(e.target.value)} placeholder={first?.open_line ?? ''} />
            </label>
            <div className="ev-admin-actions">
                <button className="btn btn-gold" disabled={!realms.length || !locationId} onClick={() => setConfirm(true)}>Send</button>
            </div>
            {confirm && (
                <ConfirmModal
                    message={`Send a tear to ${place?.name ?? 'that place'}${Number(opensIn) > 0 ? `, opening in ${opensIn} minutes` : ', opening now'}? Only one tear may be sent or open on an island at a time.`}
                    confirmLabel="Send It"
                    onConfirm={send}
                    onCancel={() => setConfirm(false)}
                />
            )}
        </div>
    )
}

function TearCard({ tear: t, now, post }: { tear: Tear; now: number; post: Post }) {
    const [confirm, setConfirm] = useState(false)
    const state = t.ended_at ? `${ENDED[t.end_reason ?? ''] ?? 'closed'}`
        : t.opened_at ? `open, ${timeLeft(t.ends_at, now)} left`
        : `opens in ${timeLeft(t.starts_at, now)}${t.warn_at && !t.warned_at ? `, warning in ${timeLeft(t.warn_at, now)}` : t.warned_at ? ', warned' : ''}`
    const bonus = Math.round((Number(t.xp_multiplier) - 1) * 100)
    return (
        <div className="ev-admin-live">
            <div className="ev-admin-live-head">
                <span className="ev-admin-name">{t.name}</span>
                <span>over {t.location ?? 'nowhere'}{t.island ? ` (${t.island})` : ''}</span>
                <span className="gold-text">+{bonus}%</span>
                <span className="tabular-num">{t.pool_left.toLocaleString()} of {t.pool_total.toLocaleString()} left</span>
                <span>{state}</span>
                <span className="ev-admin-muted">
                    {t.min_kills ?? 5} kills to place{t.per_player_cap ? `, ${t.per_player_cap} a player at most` : ''}
                </span>
            </div>
            {t.standings.length > 0 && (
                <p className="ev-admin-note">
                    {t.standings.map((s, i) => `${i + 1}. ${s.name} ${s.kills}`).join(' · ')}
                </p>
            )}
            {t.rewards.length > 0 && (
                <p className="ev-admin-note">
                    Paid: {t.rewards.map(r => `${r.name} ${r.gold.toLocaleString()}g for ${r.kills}`).join(', ')}
                </p>
            )}
            {!t.ended_at && (
                <div className="ev-admin-actions">
                    <button className="btn btn-red" onClick={() => setConfirm(true)}>Close It</button>
                </div>
            )}
            {confirm && (
                <ConfirmModal
                    message={`Close the tear over ${t.location ?? 'nowhere'} now? Fights there end after the creature in hand, and the top three are paid for what they have.`}
                    confirmLabel="Close It"
                    onConfirm={() => { setConfirm(false); post(`/tears/${t.id}/end`, {}, 'The tear is closed.') }}
                    onCancel={() => setConfirm(false)}
                />
            )}
        </div>
    )
}
