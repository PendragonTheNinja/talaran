import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import ConfirmModal from './ConfirmModal'
import './AnimalsTab.css'

interface AnimalCard {
    id: number; name: string; species: string; stage: string
    isMount: boolean; productItem: string | null; productReady: boolean
    productProgress: number; growProgress: number
    productUnits: number; productMax: number
    /** The baby item this animal was placed from, e.g. 'Chick'. */
    babyItem: string | null
    secondsToAdult: number; secondsToElder: number
    canSlaughter: boolean; canTame: boolean
}
interface Pen {
    id: number; slotIndex: number; penType: string
    species: string | null; speciesId: number | null
    capacity: number; headCount: number
    fed: boolean; fedUntil: string | null; canFeed: boolean
    needsMucking: boolean; muckDueAt: string | null; canMuck: boolean
    beddingCost: number; beddingItem: string
    readyUnits: number
    slaughterable: number
    feedItem: string | null; feedCost: number
    animals: AnimalCard[]
}
interface SpeciesDef {
    id: number; name: string; penType: string; level: number
    babyItem: string; feedItem: string; feedQty: number
    productItem: string | null; productSeconds: number | null
    productChance: number; growSeconds: number; elderSeconds: number
    isMount: boolean; description: string | null
    unlocked: boolean; babiesHeld: number
}
export interface HusbandryState {
    hasFarmstead: boolean; atNovita: boolean; town: string
    husbandryLevel: number; penCap: number; penMax: number
    coopCapacity: number; paddockCapacity: number
    fedHours: number; muckHours: number
    species: SpeciesDef[]
    hasPail: boolean; hasFork: boolean; hasHalter: boolean; hasKnife: boolean
    /** Null when properly kitted; otherwise the reason, ready to show. */
    missingBuildTool?: string | null
    /** Pens currently hungry, and pens currently due a mucking. */
    pensToFeed?: number
    pensToMuck?: number
    feedRoundCost?: { itemName: string; qty: number }[]
    muckRoundCost?: { itemName: string; qty: number }[]
    canFeedRound?: boolean
    canMuckRound?: boolean
    /** Sealed buckets, the open one, and empties to hand. */
    milk?: {
        per: number; sealed: number; open: number; total: number; empties: number
        sealedItem: string; emptyItem: string
    } | null
    pens: Pen[]
    canBuildPen?: boolean
    nextPenCost?: { coop: { itemName: string; qty: number }[]; paddock: { itemName: string; qty: number }[] } | null
}

function fmtDuration(s: number): string {
    if (s <= 0) return 'ready'
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${sec}s`
    return `${sec}s`
}

/** "12 Grain, 4 Straw" — what a whole round would consume. */
function costLabel(cost?: { itemName: string; qty: number }[]): string {
    if (!cost || !cost.length) return 'nothing'
    return cost.map(c => `${c.qty} ${c.itemName}`).join(', ')
}

/** Button suffix: the pen count and the bill, or nothing when there is no work. */
function costSuffix(pens?: number, cost?: { itemName: string; qty: number }[]): string {
    if (!pens) return ''
    return ` (${pens} — ${costLabel(cost)})`
}

const STAGE_LABEL: Record<string, string> = { juvenile: 'Young', adult: 'Adult', elder: 'Elder' }

/**
 * The image an animal shows at its current age.
 *
 *   juvenile  the baby item's own icon      Chick.png, Calf.png, Rouncey_Foal.png
 *   adult     the species icon              Chicken.png, Cow.png, Rouncey.png
 *   elder     the species icon, prefixed    Elder_Chicken.png, Elder_Cow.png
 *
 * Babies reuse the icon of the item they were placed from, so a Chick looks the
 * same in the coop as it did in the pack. Mounts never reach elder in practice —
 * they leave the pen as an item on maturing — so Elder_Rouncey.png is optional
 * and falls back to the adult picture.
 */
function animalIcon(a: AnimalCard): string {
    if (a.stage === 'juvenile' && a.babyItem) return getItemIcon(a.babyItem)
    if (a.stage === 'elder') return getItemIcon(`Elder ${a.species}`)
    return getItemIcon(a.species)
}

interface AnimalsTabProps {
    /** Hands the started timer to the game view, exactly as the Fields tab does. */
    onActionStarted: (timerSeconds: number, kind: string) => void
    husbandryLevel?: number
}

export default function AnimalsTab({ onActionStarted }: AnimalsTabProps) {
    const [data, setData] = useState<HusbandryState | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [place, setPlace] = useState<Record<number, number>>({})
    const [renaming, setRenaming] = useState<number | null>(null)
    const [newName, setNewName] = useState('')
    const [confirmKill, setConfirmKill] = useState<AnimalCard | null>(null)
    const [confirmKillAll, setConfirmKillAll] = useState<Pen | null>(null)
    // Demolishing refunds in full, but it is still a build being undone.
    const [confirmDemolish, setConfirmDemolish] = useState<Pen | null>(null)
    const [penType, setPenType] = useState<'coop' | 'paddock'>('coop')
    // Pens collapse so a farm with several of them stays scannable; a full coop
    // is six animals and would otherwise be most of a screen on its own.
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

    const load = useCallback(() => {
        return apiFetch<HusbandryState>('/api/husbandry/state')
            .then(setData).catch(() => setError('Could not reach your pens.')).finally(() => setLoading(false))
    }, [])
    useEffect(() => { load() }, [load])
    // Animals grow on their own; refresh the countdowns once a minute.
    useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t) }, [load])

    /** Timed work: the server starts an action and the game tick resolves it. */
    async function act(path: string, kind: string, body?: any) {
        setBusy(true); setError('')
        try {
            const res = await apiFetch<{ timerSeconds: number }>(path, {
                method: 'POST', body: body ? JSON.stringify(body) : undefined,
            })
            onActionStarted(res.timerSeconds, kind)
        } catch (e: any) {
            // 423 = a bot check is due. The server has already emitted
            // bot_check_required, so GameView's overlay is about to appear on top
            // of this panel — showing a red error underneath it just reads as a
            // failure the player has to go and fix somewhere else.
            if (e?.status !== 423) setError(e.message || 'That did not work.')
            setBusy(false)
        }
    }

    /** Instant work: stays in the panel and reloads, no timer involved. */
    async function instant(path: string, body: any) {
        setBusy(true); setError('')
        try {
            await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
            await load()
        } catch (e: any) {
            setError(e.message || 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    if (loading) return <p className="farm-empty">Walking out to the pens…</p>
    if (!data) return <p className="farm-error">{error || 'Could not reach your pens.'}</p>

    const canPlaceIn = (pen: Pen) => data.species.filter(s =>
        s.unlocked && s.penType === pen.penType && s.babiesHeld > 0 &&
        (!pen.speciesId || pen.speciesId === s.id))

    return (
        <>
            {error && <p className="farm-error">{error}</p>}

            <div className="farm-status">
                <span>Husbandry Lv {data.husbandryLevel}</span>
                <span className={data.hasPail ? 'tool-on' : 'tool-off'}>🪣 {data.hasPail ? 'Pail' : 'No pail'}</span>
                <span className={data.hasFork ? 'tool-on' : 'tool-off'}>🍴 {data.hasFork ? 'Fork' : 'No fork'}</span>
                {data.milk && (
                    <span className={data.milk.empties > 0 || data.milk.open > 0 ? 'tool-on' : 'tool-off'}>
                        🪣 Milk {data.milk.total}
                        {data.milk.open > 0 && ` (${data.milk.sealed} sealed + ${data.milk.open}/${data.milk.per} open)`}
                        {data.milk.open === 0 && data.milk.empties === 0 && ' — no empty buckets'}
                    </span>
                )}
                <span>Pens {data.pens.length} / {data.penCap}</span>
            </div>

            {!data.atNovita && <p className="farm-note">Travel to {data.town} to work your pens.</p>}

            {/* Farm-wide round. Hidden with a single pen, where it would just be
                the pen's own buttons a second time. Not level-gated: pens are
                already capped by Husbandry level, so this only becomes useful to
                players who have earned their way to several. */}
            {data.pens.length > 1 && (
                <div className="animal-round">
                    <button className="farm-btn"
                        disabled={busy || !data.atNovita || !data.hasPail
                            || !(data.pensToFeed ?? 0) || data.canFeedRound === false}
                        title={!data.hasPail ? 'You need a Feed Pail equipped'
                            : !(data.pensToFeed ?? 0) ? 'Every pen has been fed'
                                : data.canFeedRound === false ? `Not enough: ${costLabel(data.feedRoundCost)}`
                                    : `Feeds ${data.pensToFeed} ${data.pensToFeed === 1 ? 'pen' : 'pens'}`}
                        onClick={() => act('/api/husbandry/feed-all', 'feed_all')}>
                        Feed All Animals{costSuffix(data.pensToFeed, data.feedRoundCost)}
                    </button>
                    <button className="farm-btn"
                        disabled={busy || !data.atNovita || !data.hasFork
                            || !(data.pensToMuck ?? 0) || data.canMuckRound === false}
                        title={!data.hasFork ? 'You need a Mucking Fork equipped'
                            : !(data.pensToMuck ?? 0) ? 'No pen needs mucking yet'
                                : data.canMuckRound === false ? `Not enough: ${costLabel(data.muckRoundCost)}`
                                    : `Mucks out ${data.pensToMuck} ${data.pensToMuck === 1 ? 'pen' : 'pens'}`}
                        onClick={() => act('/api/husbandry/muck-all', 'muck_all')}>
                        Muck Out All Pens{costSuffix(data.pensToMuck, data.muckRoundCost)}
                    </button>
                </div>
            )}

            <div className="animal-pens">
                {data.pens.map(pen => (
                    <div key={pen.id} className={`animal-pen ${pen.fed ? '' : 'unfed'}`}>
                        <button
                            className="animal-pen-head"
                            onClick={() => setCollapsed(c => ({ ...c, [pen.id]: !c[pen.id] }))}
                            aria-expanded={!collapsed[pen.id]}
                            title={collapsed[pen.id] ? 'Show this pen' : 'Collapse this pen'}
                        >
                            <span>
                                <span className="animal-pen-caret">{collapsed[pen.id] ? '▸' : '▾'}</span>
                                {pen.penType === 'coop' ? 'Coop' : 'Paddock'} {pen.slotIndex + 1}
                                {pen.species && <span className="animal-pen-species"> · {pen.species}</span>}
                            </span>
                            <span className="animal-pen-count">
                                {pen.headCount === 0 && (
                                    <span
                                        className="animal-pen-demolish"
                                        title="Pull this pen down and get the materials back"
                                        onClick={(e) => { e.stopPropagation(); setConfirmDemolish(pen) }}
                                    >
                                        Demolish
                                    </span>
                                )}
                                {/* Collapsed, the header is the only status the player can see. */}
                                {collapsed[pen.id] && pen.headCount > 0 && (
                                    <span className={pen.fed ? 'pen-ok' : 'pen-warn'}>
                                        {pen.fed ? '' : 'hungry · '}
                                    </span>
                                )}
                                {collapsed[pen.id] && pen.animals.some(a => a.productReady) && (
                                    <span className="gold-text">ready · </span>
                                )}
                                {pen.headCount} / {pen.capacity}
                            </span>
                        </button>

                        {!collapsed[pen.id] && pen.headCount > 0 && (
                            <div className="animal-pen-status">
                                <span className={pen.fed ? 'pen-ok' : 'pen-warn'}>
                                    {pen.fed ? 'Fed' : pen.fedUntil ? 'Hungry — nothing is growing' : 'Not fed yet'}
                                </span>
                                {pen.needsMucking && <span className="pen-warn">Needs mucking out</span>}
                            </div>
                        )}

                        {!collapsed[pen.id] && pen.headCount > 0 && (
                            <div className="animal-pen-actions">
                                <button className="farm-btn"
                                    disabled={busy || !data.atNovita || !data.hasPail || !pen.canFeed}
                                    title={!data.hasPail ? 'You need a Feed Pail equipped'
                                        : !pen.canFeed ? 'They have been fed — wait until the trough runs dry'
                                            : undefined}
                                    onClick={() => act('/api/husbandry/feed', 'feed', { penId: pen.id })}>
                                    {pen.canFeed
                                        ? `Feed All${pen.feedItem ? ` (${pen.feedCost} ${pen.feedItem})` : ''}`
                                        : 'Fed'}
                                </button>
                                {pen.readyUnits > 0 && (
                                    <button className="farm-btn primary"
                                        disabled={busy || !data.atNovita}
                                        onClick={() => act('/api/husbandry/collect-all', 'collect_all', { penId: pen.id })}>
                                        Collect All ({pen.readyUnits})
                                    </button>
                                )}
                                {pen.slaughterable > 0 && (
                                    <button className="farm-btn danger"
                                        disabled={busy || !data.atNovita || !data.hasKnife}
                                        title={data.hasKnife
                                            ? `Slaughter every grown animal in this pen (${pen.slaughterable})`
                                            : 'You need an Ambren Butchering Knife equipped'}
                                        onClick={() => setConfirmKillAll(pen)}>
                                        Slaughter All ({pen.slaughterable})
                                    </button>
                                )}
                                <button className="farm-btn"
                                    disabled={busy || !data.atNovita || !data.hasFork || !pen.canMuck}
                                    title={!data.hasFork ? 'You need a Mucking Fork equipped'
                                        : !pen.canMuck ? 'The bedding is still clean'
                                            : `Lays ${pen.beddingCost} ${pen.beddingItem} as fresh bedding`}
                                    onClick={() => act('/api/husbandry/muck', 'muck', { penId: pen.id })}>
                                    {pen.canMuck ? `Muck Out (${pen.beddingCost} ${pen.beddingItem})` : 'Clean'}
                                </button>
                            </div>
                        )}

                        {!collapsed[pen.id] && <div className="animal-list">
                            {pen.animals.map(a => (
                                <div key={a.id} className={`animal-card stage-${a.stage}`}>
                                    <div className="animal-icon">
                                        {/* Same icon-with-name-fallback the inventory grid uses, so a
                                            species with no art yet reads as a label, not a blank hole. */}
                                        <img src={animalIcon(a)} alt={`${a.species}, ${a.stage}`}
                                            onLoad={e => {
                                                e.currentTarget.style.display = ''
                                                e.currentTarget.nextElementSibling?.setAttribute('style', 'display: none')
                                            }}
                                            onError={e => {
                                                // One retry at the adult picture: an
                                                // elder or baby image that has not been
                                                // drawn yet should show the animal, not
                                                // its name.
                                                const img = e.currentTarget
                                                const adult = getItemIcon(a.species)
                                                if (!img.dataset.fellBack && img.getAttribute('src') !== adult) {
                                                    img.dataset.fellBack = '1'
                                                    img.setAttribute('src', adult)
                                                    return
                                                }
                                                img.style.display = 'none'
                                                img.nextElementSibling?.removeAttribute('style')
                                            }} />
                                        <span className="animal-icon-text" style={{ display: 'none' }}>{a.species}</span>
                                    </div>
                                    <div className="animal-body">
                                        {renaming === a.id ? (
                                            <div className="animal-rename">
                                                <input value={newName} maxLength={40} autoFocus
                                                    onChange={e => setNewName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            instant('/api/husbandry/rename', { animalId: a.id, name: newName })
                                                            setRenaming(null)
                                                        }
                                                        if (e.key === 'Escape') setRenaming(null)
                                                    }} />
                                                <button className="farm-btn" onClick={() => {
                                                    instant('/api/husbandry/rename', { animalId: a.id, name: newName })
                                                    setRenaming(null)
                                                }}>Save</button>
                                            </div>
                                        ) : (
                                            <div className="animal-name" onClick={() => { setRenaming(a.id); setNewName(a.name) }}
                                                title="Click to rename">
                                                {a.name}
                                                <span className={`animal-stage stage-tag-${a.stage}`}>{STAGE_LABEL[a.stage] || a.stage}</span>
                                            </div>
                                        )}

                                        {a.stage === 'juvenile' && (
                                            <p className="animal-meta">
                                                Growing · {pen.fed ? fmtDuration(a.secondsToAdult) : 'paused, needs feeding'}
                                            </p>
                                        )}
                                        {a.stage !== 'juvenile' && a.productItem && (
                                            <p className="animal-meta">
                                                {a.productUnits > 0
                                                    ? <span className={a.productUnits >= a.productMax ? 'pen-warn' : 'gold-text'}>
                                                        {a.productUnits}{a.productUnits >= a.productMax ? ' — full' : ''} {a.productItem.toLowerCase()}
                                                    </span>
                                                    : `${a.productItem} · ${Math.round(a.productProgress * 100)}%`}
                                                {a.stage === 'elder' && <span className="animal-elder-note"> · slower now</span>}
                                            </p>
                                        )}
                                        {a.stage === 'adult' && !a.productItem && !a.isMount && (
                                            <p className="animal-meta">Grown. Ready when you are.</p>
                                        )}
                                        {a.isMount && a.stage !== 'juvenile' && (
                                            <p className="animal-meta">Grown — halter it to keep it for good.</p>
                                        )}

                                        <div className="animal-actions">
                                            {a.productReady && (() => {
                                                // Milk needs a bucket to go into; other products need nothing.
                                                // Room means an open bucket with space, or an empty to start one.
                                                const noRoom = a.productItem === 'Milk'
                                                    && !!data.milk
                                                    && data.milk.open === 0 && data.milk.empties === 0
                                                return (
                                                    <button className="farm-btn"
                                                        disabled={busy || !data.atNovita || noRoom}
                                                        title={noRoom ? 'You need another Lanai Bucket to hold the milk' : undefined}
                                                        onClick={() => act('/api/husbandry/collect', 'collect', { animalId: a.id })}>
                                                        {a.productItem === 'Milk' ? (noRoom ? 'No bucket' : 'Milk') : 'Collect'}
                                                    </button>
                                                )
                                            })()}
                                            {a.canTame && (
                                                <button className="farm-btn primary" disabled={busy || !data.atNovita || !data.hasHalter}
                                                    title={data.hasHalter ? undefined : 'You need a Halter & Lead equipped'}
                                                    onClick={() => act('/api/husbandry/tame', 'tame', { animalId: a.id })}>
                                                    Halter
                                                </button>
                                            )}
                                            {a.canSlaughter && (
                                                <button className="farm-btn danger" disabled={busy || !data.atNovita || !data.hasKnife}
                                                    title={data.hasKnife ? undefined : 'You need an Ambren Butchering Knife equipped'}
                                                    onClick={() => setConfirmKill(a)}>
                                                    Slaughter
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>}

                        {!collapsed[pen.id] && pen.headCount < pen.capacity && (
                            <div className="animal-place">
                                {canPlaceIn(pen).length > 0 ? (
                                    <>
                                        <select value={place[pen.id] ?? canPlaceIn(pen)[0]?.id ?? 0}
                                            onChange={e => setPlace(p => ({ ...p, [pen.id]: +e.target.value }))}>
                                            {canPlaceIn(pen).map(s => (
                                                <option key={s.id} value={s.id}>{s.babyItem} ({s.babiesHeld})</option>
                                            ))}
                                        </select>
                                        <button className="farm-btn" disabled={busy || !data.atNovita}
                                            onClick={() => instant('/api/husbandry/place', {
                                                penId: pen.id,
                                                speciesId: place[pen.id] ?? canPlaceIn(pen)[0]?.id,
                                            })}>Put In Pen</button>
                                    </>
                                ) : (
                                    <p className="farm-note">
                                        {pen.species
                                            ? `No young ${pen.species.toLowerCase()}s to hand.`
                                            : 'Bring back young animals from the wild to stock this pen.'}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {data.canBuildPen && data.nextPenCost && (
                <div className="farm-newplot">
                    <div className="farm-newplot-title">Raise pen {data.pens.length + 1}</div>
                    <div className="animal-pentype">
                        <button className={`farm-tab ${penType === 'coop' ? 'active' : ''}`}
                            onClick={() => setPenType('coop')}>Coop ({data.coopCapacity} birds)</button>
                        <button className={`farm-tab ${penType === 'paddock' ? 'active' : ''}`}
                            onClick={() => setPenType('paddock')}>Paddock ({data.paddockCapacity} beasts)</button>
                    </div>
                    <div className="farm-cost">
                        {data.nextPenCost[penType].map(c => (
                            <div key={c.itemName} className="farm-cost-row">
                                <span>{c.itemName}</span>
                                <span>{c.qty.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                    {data.missingBuildTool && <p className="farm-note">{data.missingBuildTool}</p>}
                    <button className="farm-btn primary"
                        disabled={busy || !data.atNovita || !!data.missingBuildTool}
                        onClick={() => act('/api/husbandry/build-pen', 'build_pen', { penType })}>
                        Raise {penType === 'coop' ? 'Coop' : 'Paddock'}
                    </button>
                </div>
            )}
            {!data.canBuildPen && data.pens.length < data.penMax && (
                <p className="farm-note">Raise your Husbandry level to add another pen.</p>
            )}

            <div className="farm-crops">
                <div className="farm-crops-title">Stock</div>
                {data.species.map(s => (
                    <div key={s.id} className={`farm-crop-row ${s.unlocked ? '' : 'locked'}`}>
                        <span>{s.name}{s.isMount ? ' 🐎' : ''}</span>
                        <span className="farm-crop-meta">
                            {s.unlocked
                                ? `${s.babiesHeld} young · grows in ${fmtDuration(s.growSeconds)}${s.productItem ? ` · ${s.productItem}` : ''}`
                                : `Lv ${s.level} · ${s.babiesHeld} young`}
                        </span>
                    </div>
                ))}
            </div>

            {confirmDemolish && (
                <ConfirmModal
                    message={`Pull down ${confirmDemolish.penType === 'coop' ? 'Coop' : 'Paddock'} ${confirmDemolish.slotIndex + 1}? Every material goes back into your pack, and the slot is freed for a different kind of pen.`}
                    onConfirm={() => {
                        const pen = confirmDemolish
                        setConfirmDemolish(null)
                        act('/api/husbandry/demolish-pen', 'demolish_pen', { penId: pen.id })
                    }}
                    onCancel={() => setConfirmDemolish(null)}
                />
            )}

            {confirmKillAll && (
                <ConfirmModal
                    message={`Slaughter all ${confirmKillAll.slaughterable} grown ${(confirmKillAll.species ?? 'animal').toLowerCase()}${confirmKillAll.slaughterable === 1 ? '' : 's'} in this pen? The young will be left. This cannot be undone.`}
                    onConfirm={() => {
                        const p = confirmKillAll
                        setConfirmKillAll(null)
                        act('/api/husbandry/slaughter-all', 'slaughter_all', { penId: p.id })
                    }}
                    onCancel={() => setConfirmKillAll(null)}
                />
            )}

            {confirmKill && (
                <ConfirmModal
                    message={`Slaughter ${confirmKill.name}? This cannot be undone.`}
                    onConfirm={() => {
                        const a = confirmKill
                        setConfirmKill(null)
                        act('/api/husbandry/slaughter', 'slaughter', { animalId: a.id })
                    }}
                    onCancel={() => setConfirmKill(null)}
                />
            )}
        </>
    )
}
