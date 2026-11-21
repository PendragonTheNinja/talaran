import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { onSocket } from '../lib/socket'
import ErrorLine from './ErrorLine'
import './TavernPanel.css'
import './GuildHallTab.css'
import './SlipPanel.css'

// Hiring a carpenter for a homestead or a shop (server services/hires.ts;
// docs/antura-plan.md §6b). One section for both sides: the owner names a
// carpenter, lays the fee and any materials, and may call the work off; a
// carpenter sees the work they have been hired for here and starts it. The
// work itself is the owner's own build action, so the timer, the scene, and
// a refresh mid-build are the panels' as they always were.
// Used by FarmPanel (the homestead) and ShopsMenu (the shops in a port).

type Kind = 'farmstead' | 'shop'

interface Material { itemName: string; need: number; laid: number }
interface Option { work: 'establish' | 'upgrade'; tier: number; seconds: number; carpentryRequired: number; cost: { itemName: string; qty: number }[] }
interface HireState {
    kind: Kind; place: string; atPlace: boolean; maxFee: number
    options: Option[]
    mine: { id: number; work: 'establish' | 'upgrade'; tier: number; carpenter: string; fee: number; working: boolean; materials: Material[] } | null
    forMe: {
        id: number; owner: string; work: 'establish' | 'upgrade'; tier: number; fee: number; seconds: number
        carpentryRequired: number; carpentryOk: boolean; canAfford: boolean; stillWanted: boolean
        missingTool: string | null; materials: (Material & { have: number })[]
    }[]
}

const fmt = (n: number) => n.toLocaleString('en-US')

function minutes(s: number): string {
    const m = Math.round(s / 60)
    return `${m} minute${m === 1 ? '' : 's'}`
}

/** "a tier 2 farmstead", "the shop built on to tier 2". */
function workWords(kind: Kind, work: 'establish' | 'upgrade', tier: number): string {
    const what = kind === 'farmstead' ? 'farmstead' : 'shop'
    if (work === 'upgrade') return `the ${what} built on to tier ${tier}`
    return tier === 1 ? `a ${what}` : `a tier ${tier} ${what}`
}

export default function HireSection({ kind, onStarted }: {
    kind: Kind
    /** Hands a started build to the game view timer, with the action it runs as. */
    onStarted: (seconds: number, actionType: string) => void
}) {
    const [state, setState] = useState<HireState | null>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [open, setOpen] = useState(false)
    const [pick, setPick] = useState(0)
    const [carpenter, setCarpenter] = useState('')
    const [fee, setFee] = useState('')
    const [qty, setQty] = useState<Record<string, string>>({})

    const load = useCallback(() => {
        apiFetch<HireState>(`/api/hires?kind=${kind}`)
            .then(setState)
            .catch(() => { /* no hire section is a fine fallback */ })
    }, [kind])
    useEffect(() => { load() }, [load])
    // A hire made, finished, or called off by the other side.
    useEffect(() => onSocket('hires_changed', load), [load])

    const post = async (path: string, body: Record<string, unknown>, fallback: string) => {
        setBusy(true); setErr(null)
        try {
            await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
            load()
        } catch (e) {
            const er = e as { status?: number; message?: string }
            if (er?.status !== 423) setErr(er?.message || fallback)
        } finally {
            setBusy(false)
        }
    }

    const build = async (hire: number) => {
        setBusy(true); setErr(null)
        try {
            const r = await apiFetch<{ timerSeconds: number; actionType: string }>('/api/hires/build', {
                method: 'POST', body: JSON.stringify({ hire }),
            })
            onStarted(r.timerSeconds, r.actionType)
        } catch (e) {
            // 423: a bot check is due and its overlay is already on the way.
            const er = e as { status?: number; message?: string }
            if (er?.status !== 423) setErr(er?.message || 'The work could not be started.')
            setBusy(false)
        }
    }

    if (!state) return null
    const { mine, forMe, options } = state
    if (!mine && !forMe.length && !options.length) return null
    const chosen = options[Math.min(pick, options.length - 1)]
    const feeN = fee.trim() === '' ? 0 : Math.floor(Number(fee))
    const feeOk = Number.isFinite(feeN) && feeN >= 0 && feeN <= state.maxFee

    return (
        <div className="hall-hire">
            {forMe.map(h => (
                <div key={h.id}>
                    <p className="tavern-section">Hired by {h.owner}</p>
                    <p className="muted-text hall-note">
                        {h.owner} has hired you to build {workWords(state.kind, h.work, h.tier)} here
                        {h.fee > 0 ? `, for ${fmt(h.fee)} gold, paid when it stands.` : ', for no fee.'}
                        {' '}{minutes(h.seconds)} of work, at Carpentry {h.carpentryRequired}. What {h.owner} has left here is used before your own.
                    </p>
                    {h.materials.map(m => (
                        <div key={m.itemName} className="hall-hire-row">
                            <span className="hall-req-name">{m.itemName}</span>
                            <span className={m.laid + m.have >= m.need ? 'muted-text' : 'hall-short'}>
                                {fmt(m.need)} wanted · {fmt(m.laid)} left here · {fmt(m.have)} in your pack
                            </span>
                        </div>
                    ))}
                    {!h.carpentryOk && <p className="muted-text hall-note">You need Carpentry {h.carpentryRequired}.</p>}
                    {h.missingTool && <p className="muted-text hall-note">Missing: {h.missingTool}.</p>}
                    {!h.stillWanted && <p className="muted-text hall-note">That work has been done already.</p>}
                    {!state.atPlace && <p className="muted-text hall-note">The work is in {state.place}.</p>}
                    <button className="btn btn-gold"
                        disabled={busy || !state.atPlace || !h.carpentryOk || !h.canAfford || !h.stillWanted || !!h.missingTool}
                        onClick={() => build(h.id)}>
                        Build it for {h.owner}
                    </button>
                </div>
            ))}

            {mine && (
                <div>
                    <p className="tavern-section">Your Carpenter</p>
                    <p className="muted-text hall-note">
                        You have hired {mine.carpenter} to build {workWords(state.kind, mine.work, mine.tier)}
                        {mine.fee > 0 ? `, for ${fmt(mine.fee)} gold, paid to them when it stands.` : ', for no fee.'}
                        {mine.working ? ` ${mine.carpenter} is at work on it now.` : ''}
                    </p>
                    <p className="hall-hire-step">Materials left for them</p>
                    <p className="muted-text hall-note">They use these before their own. Anything not built in comes back to you.</p>
                    {mine.materials.map(m => {
                        const n = Math.floor(Number(qty[m.itemName] ?? ''))
                        const room = Math.max(0, m.need - m.laid)
                        return (
                            <div key={m.itemName} className="hall-hire-row">
                                <span className="hall-req-name">
                                    {m.itemName}: {fmt(m.laid)} of {fmt(m.need)} here
                                </span>
                                <input className="hall-hire-input hall-hire-num" inputMode="numeric" placeholder="How many" value={qty[m.itemName] ?? ''}
                                    onChange={e => setQty(q => ({ ...q, [m.itemName]: e.target.value }))} />
                                <button className="btn btn-gold" disabled={busy || !state.atPlace || !(n > 0) || n > room}
                                    onClick={() => { void post('/api/hires/stock/lay', { kind, item: m.itemName, quantity: n }, 'Those could not be left here.'); setQty(q => ({ ...q, [m.itemName]: '' })) }}>
                                    Leave
                                </button>
                                <button className="btn" disabled={busy || !state.atPlace || mine.working || !(n > 0) || n > m.laid}
                                    onClick={() => { void post('/api/hires/stock/take', { kind, item: m.itemName, quantity: n }, 'Those could not be taken back.'); setQty(q => ({ ...q, [m.itemName]: '' })) }}>
                                    Take back
                                </button>
                            </div>
                        )
                    })}
                    <button className="btn" disabled={busy || !state.atPlace || mine.working}
                        onClick={() => post('/api/hires/cancel', { kind }, 'The work could not be called off.')}>
                        Call it off
                    </button>
                </div>
            )}

            {!mine && chosen && (
                open ? (
                    <div>
                        <p className="tavern-section">Hire a Carpenter</p>
                        <p className="muted-text hall-note">
                            Someone with the Carpentry, a mallet, and a saw can build it for you. They bring the materials, or use what you leave here. The fee is laid now and paid to them when it stands; call it off before they start and it comes back.
                        </p>
                        {options.length > 1 && (
                            <div className="hall-hire-row">
                                {options.map((o, i) => (
                                    <button key={`${o.work}${o.tier}`} className={`btn hall-hire-chip${i === pick ? ' btn-gold' : ''}`}
                                        onClick={() => setPick(i)}>
                                        {workWords(state.kind, o.work, o.tier)}
                                    </button>
                                ))}
                            </div>
                        )}
                        <p className="muted-text hall-note">
                            {workWords(state.kind, chosen.work, chosen.tier).replace(/^./, c => c.toUpperCase())}: {chosen.cost.map(c => `${fmt(c.qty)} ${c.itemName}`).join(', ')}.
                            {' '}Carpentry {chosen.carpentryRequired}, {minutes(chosen.seconds)} of work.
                        </p>
                        <div className="hall-hire-row">
                            <input className="hall-hire-input" placeholder="A carpenter's name" value={carpenter} maxLength={32}
                                onChange={e => setCarpenter(e.target.value)} />
                            <input className="hall-hire-input hall-hire-num" inputMode="numeric" placeholder="Fee" value={fee}
                                onChange={e => setFee(e.target.value)} />
                            <span className="muted-text">gold</span>
                        </div>
                        <div className="hall-hire-row">
                            <button className="btn btn-gold" disabled={busy || !state.atPlace || !carpenter.trim() || !feeOk}
                                onClick={() => post('/api/hires', { kind, work: chosen.work, tier: chosen.tier, carpenter: carpenter.trim(), fee: feeN }, 'The carpenter could not be hired.')}>
                                Hire {carpenter.trim() || 'them'}{feeN > 0 ? ` for ${fmt(feeN)} gold` : ''}
                            </button>
                            <button className="btn" disabled={busy} onClick={() => setOpen(false)}>Never mind</button>
                        </div>
                        {!state.atPlace && <p className="muted-text hall-note">Travel to {state.place} to hire a carpenter for it.</p>}
                    </div>
                ) : (
                    <button className="btn" onClick={() => setOpen(true)}>Hire a carpenter to build it</button>
                )
            )}

            <ErrorLine message={err} className="tavern-error" />
        </div>
    )
}
