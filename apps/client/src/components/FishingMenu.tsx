import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import './FishingMenu.css'

// The fishing panel. Follows ForagingMenu's shape (modal, "???" until found,
// tool row) with the three things fishing adds: a live window and season
// banner, the bait pouch, and per-species personal bests.

interface Species {
    name: string | null           // null → not yet caught → render "???"
    discovered: boolean
    requiredLevel: number
    unlocked: boolean
    eligibleNow: boolean
    blockedBy: 'level' | 'window' | 'season' | null
    baitCategory: string | null
    window: string | null
    windowExclusive: boolean
    seasons: string[]
    seasonExclusive: boolean
    record: { heaviestLb: number; lightestLb: number; catches: number } | null
}

interface Convertible {
    itemName: string
    quantity: number
    category: string
    baitValue: number
}

interface Cuttable {
    species: string
    itemName: string
    quantity: number
    baitValue: number
}

interface Overview {
    locationName: string
    water: string | null
    playerLevel: number
    window: string
    season: string
    windowEndsAt: string
    species: Species[]
    discoveredCount: number
    totalCount: number
    pouch: Record<string, number>
    salvage: Array<{ name: string | null; discovered: boolean }>
    convertible: Convertible[]
    cuttable: Cuttable[]
    tools: { hasRod: boolean; rodTier: number; hasNet: boolean; hasKnife: boolean }
    timers: { rod: number; rodBaited: number; net: number }
}

interface FishingMenuProps {
    onClose: () => void
    onStartRod: (baitCategory: string | null) => void
    onStartNet: () => void
    onStartCut: (species: string) => void
}

const BAIT_LABELS: Record<string, string> = {
    grain: 'Grain',
    cheese: 'Cheese',
    egg: 'Egg',
    spawn: 'Spawn',
    meat: 'Meat',
}

const WINDOW_ICONS: Record<string, string> = {
    dawn: '🌅', day: '☀️', dusk: '🌆', night: '🌙',
}

const SEASON_ICONS: Record<string, string> = {
    spring: '🌱', summer: '🌞', autumn: '🍂', winter: '❄️',
}

/**
 * The species portrait, or a placeholder holding its space.
 *
 * The slot is ALWAYS rendered, even for an undiscovered fish, so every row in
 * the list starts its text at the same x. Letting the icon appear only once a
 * fish is found would make the list shuffle sideways as you discover things.
 *
 * Undiscovered fish deliberately show a question mark rather than their art:
 * the silhouette would give away the shape of something the panel is otherwise
 * careful not to name.
 */
function SpeciesIcon({ name, discovered }: { name: string | null; discovered: boolean }) {
    const [failed, setFailed] = useState(false)
    if (!discovered || !name) {
        return <div className="fishing-species-icon unknown-icon">?</div>
    }
    return (
        <div className="fishing-species-icon">
            {failed
                // Art lands skill by skill and always after the content, so a
                // missing file is a normal state, not a broken one.
                ? <span className="fishing-species-icon-fallback">🐟</span>
                : <img
                    src={`/images/items/${name.replace(/ /g, '_')}.png`}
                    alt=""
                    onError={() => setFailed(true)}
                />}
        </div>
    )
}

function countdown(toIso: string): string {
    const ms = new Date(toIso).getTime() - Date.now()
    if (ms <= 0) return 'now'
    const mins = Math.floor(ms / 60000)
    const hours = Math.floor(mins / 60)
    if (hours > 0) return `${hours}h ${mins % 60}m`
    return `${mins}m`
}

export default function FishingMenu({ onClose, onStartRod, onStartNet, onStartCut }: FishingMenuProps) {
    const [data, setData] = useState<Overview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [bait, setBait] = useState<string>('')
    const [convertItem, setConvertItem] = useState<string>('')
    const [convertQty, setConvertQty] = useState<number>(1)
    const [cutSpecies, setCutSpecies] = useState<string>('')
    const [tick, setTick] = useState(0)

    const load = useCallback(() => {
        apiFetch<Overview>('/api/fishing/overview')
            .then(d => {
                setData(d)
                // Keep a selected bait only while it is still worth selecting.
                setBait(prev => (prev && (d.pouch[prev] || 0) > 0 ? prev : ''))
                setConvertItem(prev => (d.convertible.some(c => c.itemName === prev) ? prev : (d.convertible[0]?.itemName ?? '')))
                setCutSpecies(prev => (d.cuttable.some(c => c.species === prev) ? prev : (d.cuttable[0]?.species ?? '')))
            })
            .catch(() => setError('Could not read the water.'))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { load() }, [load])

    // Refresh the "dusk ends in 2h" line without refetching.
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 30000)
        return () => clearInterval(id)
    }, [])

    async function convert() {
        if (!convertItem) return
        setNotice('')
        try {
            const res = await apiFetch<{ category: string; added: number }>('/api/fishing/bait/convert', {
                method: 'POST',
                body: JSON.stringify({ itemName: convertItem, quantity: convertQty }),
            })
            setNotice(`${res.added} ${BAIT_LABELS[res.category] ?? res.category} bait added to your pouch.`)
            setBait(res.category)
            load()
        } catch (err: any) {
            setNotice(err?.message || 'That could not be turned into bait.')
        }
    }

    const tools = data?.tools
    const pouch = data?.pouch ?? {}
    const baitReady = bait !== '' && (pouch[bait] || 0) > 0
    const castSeconds = baitReady ? data?.timers.rodBaited : data?.timers.rod
    void tick   // the interval above exists purely to re-render the countdown

    return (
        <div className="fishing-overlay" onClick={onClose}>
            <div className="fishing-modal" onClick={e => e.stopPropagation()}>
                <div className="fishing-header">
                    <h2>Fishing</h2>
                    <button className="fishing-close" onClick={onClose}>✕</button>
                </div>

                {loading && <p className="fishing-empty">Reading the water…</p>}
                {error && <p className="fishing-error">{error}</p>}

                {!loading && !error && data && data.species.length === 0 && (
                    <p className="fishing-empty">There is nothing to fish for here.</p>
                )}

                {data && data.species.length > 0 && (
                    <>
                        <div className="fishing-conditions">
                            <span className="fishing-place">
                                {data.locationName}
                                <span className="fishing-water">
                                    {data.water === 'salt' ? 'saltwater' : 'freshwater'}
                                </span>
                            </span>
                            <span className="fishing-cond">
                                {WINDOW_ICONS[data.window]} {data.window}
                                <span className="fishing-until"> ends in {countdown(data.windowEndsAt)}</span>
                            </span>
                            <span className="fishing-cond">
                                {SEASON_ICONS[data.season]} {data.season}
                            </span>
                        </div>

                        {tools && (
                            <div className="fishing-tools">
                                <span className={tools.hasRod ? 'tool-on' : 'tool-off'} title="A rod casts for one fish at a time, and bait steers what takes it.">
                                    🎣 {tools.hasRod ? `Rod T${tools.rodTier}` : 'No rod'}
                                </span>
                                <span className={tools.hasNet ? 'tool-on' : 'tool-off'} title="A net takes several small fish at once, and ignores bait entirely.">
                                    🕸️ {tools.hasNet ? 'Net' : 'No net'}
                                </span>
                                <span className={tools.hasKnife ? 'tool-on' : 'tool-off'} title="A butchering knife cuts fish down into bait.">
                                    🔪 {tools.hasKnife ? 'Knife' : 'No knife'}
                                </span>
                            </div>
                        )}

                        <div className="fishing-pouch">
                            <span className="fishing-pouch-label">Bait pouch</span>
                            <div className="fishing-pouch-row">
                                {Object.keys(BAIT_LABELS).map(cat => {
                                    const amount = pouch[cat] || 0
                                    const selected = bait === cat
                                    return (
                                        <button
                                            key={cat}
                                            className={`fishing-bait-chip ${selected ? 'selected' : ''} ${amount > 0 ? '' : 'empty'}`}
                                            disabled={amount === 0}
                                            onClick={() => setBait(selected ? '' : cat)}
                                            title={amount === 0
                                                ? `No ${BAIT_LABELS[cat].toLowerCase()} bait. Break something down below.`
                                                : `Fish with ${BAIT_LABELS[cat].toLowerCase()} bait. One is spent per catch.`}
                                        >
                                            {BAIT_LABELS[cat]} <span className="fishing-bait-count">{amount}</span>
                                        </button>
                                    )
                                })}
                            </div>

                            {data.convertible.length > 0 ? (
                                <div className="fishing-convert">
                                    <select value={convertItem} onChange={e => setConvertItem(e.target.value)}>
                                        {data.convertible.map(c => (
                                            <option key={c.itemName} value={c.itemName}>
                                                {c.itemName} ({c.quantity}) → {c.baitValue} {BAIT_LABELS[c.category] ?? c.category}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        min={1}
                                        value={convertQty}
                                        onChange={e => setConvertQty(Math.max(1, parseInt(e.target.value) || 1))}
                                    />
                                    <button className="fishing-secondary" onClick={convert}>Break down</button>
                                </div>
                            ) : (
                                <p className="fishing-note">Nothing in your pack would tempt a fish. Grain, cheese, eggs, spawn and raw meat all serve.</p>
                            )}

                            {notice && <p className="fishing-notice">{notice}</p>}
                        </div>

                        <div className="fishing-actions">
                            <button
                                className="fishing-go"
                                disabled={!tools?.hasRod}
                                onClick={() => { onStartRod(baitReady ? bait : null); onClose() }}
                                title={tools?.hasRod ? undefined : 'Equip a fishing rod first.'}
                            >
                                Cast {baitReady ? `with ${BAIT_LABELS[bait].toLowerCase()}` : 'unbaited'}
                                <span className="fishing-timer">{castSeconds}s</span>
                            </button>
                            <button
                                className="fishing-go secondary"
                                disabled={!tools?.hasNet}
                                onClick={() => { onStartNet(); onClose() }}
                                title={tools?.hasNet ? 'Several small fish per haul. Bait makes no difference to a net.' : 'Equip a fishing net first.'}
                            >
                                Haul net
                                <span className="fishing-timer">{data.timers.net}s</span>
                            </button>
                        </div>

                        {data.cuttable.length > 0 && (
                            <div className="fishing-cut">
                                <select value={cutSpecies} onChange={e => setCutSpecies(e.target.value)}>
                                    {data.cuttable.map(c => (
                                        <option key={c.species} value={c.species}>
                                            {c.species} ({c.quantity}) → {c.baitValue} meat bait each
                                        </option>
                                    ))}
                                </select>
                                <button
                                    className="fishing-secondary"
                                    disabled={!tools?.hasKnife || !cutSpecies}
                                    onClick={() => { onStartCut(cutSpecies); onClose() }}
                                    title={tools?.hasKnife ? 'Cuts the whole stack, one fish at a time.' : 'Equip a butchering knife first.'}
                                >
                                    Cut for bait
                                </button>
                            </div>
                        )}

                        <div className="fishing-species-head">
                            <span>The water</span>
                            <span className="fishing-progress">{data.discoveredCount}/{data.totalCount} found</span>
                        </div>

                        <div className="fishing-species-list">
                            {data.species.map((s, i) => {
                                const blocked = s.blockedBy
                                return (
                                    <div
                                        key={i}
                                        className={`fishing-species ${s.discovered ? 'found' : 'unknown'} ${s.eligibleNow ? '' : 'blocked'}`}
                                    >
                                        <SpeciesIcon name={s.name} discovered={s.discovered} />
                                        <div className="fishing-species-body">
                                        <div className="fishing-species-main">
                                            <span className="fishing-species-name">
                                                {s.discovered ? s.name : '???'}
                                            </span>
                                            <span className="fishing-species-lvl">Lv {s.requiredLevel}</span>
                                        </div>

                                        <div className="fishing-species-tags">
                                            {s.discovered && s.baitCategory && (
                                                <span className="fishing-tag bait" title="This bait draws it in.">
                                                    {BAIT_LABELS[s.baitCategory]}
                                                </span>
                                            )}
                                            {s.discovered && s.window && (
                                                <span className={`fishing-tag ${s.windowExclusive ? 'lock' : ''}`}>
                                                    {WINDOW_ICONS[s.window]} {s.window}{s.windowExclusive ? ' only' : ''}
                                                </span>
                                            )}
                                            {s.discovered && s.seasons.length > 0 && (
                                                <span className={`fishing-tag ${s.seasonExclusive ? 'lock' : ''}`}>
                                                    {s.seasons.map(x => SEASON_ICONS[x]).join('')} {s.seasons.join(', ')}{s.seasonExclusive ? ' only' : ''}
                                                </span>
                                            )}
                                            {blocked === 'level' && <span className="fishing-tag off">Too skilled a fish for now</span>}
                                            {blocked === 'window' && <span className="fishing-tag off">Not at this hour</span>}
                                            {blocked === 'season' && <span className="fishing-tag off">Out of season</span>}
                                        </div>

                                        {s.record && (
                                            <div className="fishing-record">
                                                <span title="Your heaviest">▲ {s.record.heaviestLb.toFixed(2)} lb</span>
                                                <span title="Your lightest">▼ {s.record.lightestLb.toFixed(2)} lb</span>
                                                <span className="fishing-record-count">{s.record.catches} caught</span>
                                            </div>
                                        )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {data.salvage && data.salvage.length > 0 && (
                            <>
                                <div className="fishing-species-head">
                                    <span>What else the water gives up</span>
                                </div>
                                <div className="fishing-salvage-row">
                                    {data.salvage.map((s, i) => (
                                        <span
                                            key={i}
                                            className={`fishing-tag ${s.discovered ? '' : 'off'}`}
                                            title={s.discovered
                                                ? 'Comes up instead of a fish. Bait makes it less likely.'
                                                : 'Something you have not pulled up yet.'}
                                        >
                                            {s.discovered ? s.name : '???'}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}

                        <p className="fishing-hint">
                            Fish stay <span className="fishing-species unknown inline">???</span> until you land one yourself.
                            Bait never gates a catch, it only shortens the wait and shifts the odds.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
