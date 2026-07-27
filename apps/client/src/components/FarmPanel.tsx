import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import RecipeList from './RecipeList'
import PropertyStorage from './PropertyStorage'
import './FarmPanel.css'

interface CropDef {
    id: number; name: string; seedItem: string; produceItem: string
    plantLevel: number; growSeconds: number; yieldPerSeed: number
    cropType: string; isPerennial: boolean; unlocked: boolean; seedsHeld: number
}
interface Plot {
    id: number; slotIndex: number; state: string; soilState: string
    crop: { id: number; name: string; isPerennial: boolean } | null
    seedCount: number; readyAt: string | null; secondsRemaining: number | null
    yieldModifier?: number; restingSecondsToNextStep?: number | null; tended?: boolean
}
interface FarmState {
    hasFarmstead: boolean; atNovita: boolean; farmingLevel: number; hasHoe: boolean
    build?: {
        carpentryReq: number; cost: { itemName: string; qty: number }[]
        canAfford: boolean; missing: { itemName: string; need: number; have: number }[]
        plotsGranted: number; plotCapacity: number; seconds: number
    }
    property?: { id: number; tier: number; plotSlots: number }
    plotCapacity?: number
    plots?: Plot[]
    crops: CropDef[]
    plotCap?: number
    plotMax?: number
    nextPlot?: {
        number: number
        cost: { itemName: string; qty: number }[]
        canAfford: boolean
        missing: { itemName: string; need: number; have: number }[]
        seconds: number
    } | null
    timers?: { till: number; sowPerSeed: number; harvestPerSeed: number; buildPlot: number; manure: number }
    manure?: { held: number; cost: number }
    tend?: { hasBucket: boolean; plots: number; secondsPerPlot: number; speedup: number }
}

function fmtDuration(s: number): string {
    if (s <= 0) return 'ready'
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${sec}s`
    return `${sec}s`
}

const SOIL_LABEL: Record<string, string> = { rich: 'Rich soil', normal: 'Normal soil', depleted: 'Depleted soil' }

interface FarmPanelProps {
    onClose: () => void
    onActionStarted: (timerSeconds: number, kind: string) => void
    onStartRecipe: (recipeId: number) => void
    storeMode: boolean
    onToggleStoreMode: () => void
    storeAmount: number
    onStoreAmountChange: (n: number) => void
    storeRefresh?: number
    /** Opens the manual at the Farming page. Optional so the panel still works standalone. */
    onHelp?: () => void
}

export default function FarmPanel({ onClose, onActionStarted, onStartRecipe, storeMode, onToggleStoreMode, storeAmount, onStoreAmountChange, storeRefresh, onHelp }: FarmPanelProps) {
    const [data, setData] = useState<FarmState | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [sow, setSow] = useState<Record<number, { cropId: number; count: number }>>({})
    const [tab, setTab] = useState<'storage' | 'fields' | 'processing'>('storage')

    const load = useCallback(() => {
        return apiFetch<FarmState>('/api/farming/state')
            .then(setData).catch(() => setError('Could not load your farm.')).finally(() => setLoading(false))
    }, [])
    useEffect(() => { load() }, [load])
    // Refresh countdowns once a minute.
    useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t) }, [load])

    async function act(path: string, body?: any) {
        setBusy(true); setError('')
        try {
            const res = await apiFetch<{ timerSeconds: number }>(path, {
                method: 'POST', body: body ? JSON.stringify(body) : undefined,
            })
            const kind = (path.split('/').pop() || 'till').replace('-', '_')
            onActionStarted(res.timerSeconds, kind)   // hands off to the game view timer
        } catch (e: any) {
            setError(e.message || 'That did not work.')
            setBusy(false)
        }
    }

    const unlockedCrops = data?.crops.filter(c => c.unlocked) ?? []

    return (
        <div
            className={`farm-overlay ${storeMode ? 'store-open' : ''}`}
            onClick={() => { if (!storeMode) onClose() }}
        >
            <div className="farm-modal" onClick={e => e.stopPropagation()}>
                <div className="farm-header">
                    <h2>Homestead</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {onHelp && (
                            <button className="manual-help-btn" onClick={onHelp} title="Read about Farming">
                                ?
                            </button>
                        )}
                        <button className="farm-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                {!loading && data?.hasFarmstead && (
                    <div className="farm-tabs">
                        <button className={`farm-tab ${tab === 'storage' ? 'active' : ''}`} onClick={() => setTab('storage')}>Storage</button>
                        <button className={`farm-tab ${tab === 'fields' ? 'active' : ''}`} onClick={() => setTab('fields')}>Fields</button>
                        <button className={`farm-tab ${tab === 'processing' ? 'active' : ''}`} onClick={() => setTab('processing')}>Processing</button>
                    </div>
                )}

                {loading && <p className="farm-empty">Walking the fields…</p>}
                {error && <p className="farm-error">{error}</p>}

                {/* ── Build offer ─────────────────────────────── */}
                {!loading && data && !data.hasFarmstead && data.build && (
                    <div className="farm-build">
                        <p className="farm-build-lead">
                            You have no farmstead here. Raising one is the work of a season: timber, dressed stone, and ambren.<br></br>Come back with those, a mallet, and a saw.
                        </p>
                        <div className="farm-cost">
                            {data.build.cost.map(c => {
                                const miss = data.build!.missing.find(m => m.itemName === c.itemName)
                                const have = miss ? miss.have : c.qty
                                return (
                                    <div key={c.itemName} className={`farm-cost-row ${miss ? 'short' : 'ok'}`}>
                                        <span>{c.itemName}</span>
                                        <span>{have.toLocaleString()} / {c.qty.toLocaleString()}</span>
                                    </div>
                                )
                            })}
                        </div>
                        <p className="farm-build-grants">Grants {data.build.plotsGranted} plots · {data.build.plotCapacity} seeds each</p>
                        {!data.atNovita && <p className="farm-note">Travel to Novita to raise your farmstead.</p>}
                        <button
                            className="farm-btn primary"
                            disabled={busy || !data.build.canAfford || !data.atNovita}
                            onClick={() => act('/api/farming/establish')}
                        >
                            Raise Farmstead
                        </button>
                    </div>
                )}

                {/* ── The farm ────────────────────────────────── */}
                {!loading && data && data.hasFarmstead && tab === 'fields' && (
                    <>
                        <div className="farm-status">
                            <span>Farming Lv {data.farmingLevel}</span>
                            <span className={data.hasHoe ? 'tool-on' : 'tool-off'}>🪏 {data.hasHoe ? 'Hoe' : 'No hoe'}</span>
                            <span>Fields {data.plots?.length ?? 0} / {data.plotCap ?? 1}</span>
                        </div>

                        {data.tend && data.tend.plots > 0 && (
                            <div className="farm-tend-bar">
                                <span>
                                    {data.tend.plots} field{data.tend.plots === 1 ? '' : 's'} can be tended
                                    {' '}(−{Math.round(data.tend.speedup * 100)}% of time left each)
                                </span>
                                <button
                                    className="farm-btn primary"
                                    disabled={busy || !data.tend.hasBucket}
                                    title={data.tend.hasBucket ? undefined : 'You need a bucket to carry water'}
                                    onClick={() => act('/api/farming/tend')}
                                >
                                    {data.tend.hasBucket
                                        ? `Tend Fields (${fmtDuration(data.tend.plots * data.tend.secondsPerPlot)})`
                                        : 'Tend Fields (need a bucket)'}
                                </button>
                            </div>
                        )}

                        <div className="farm-plots">
                            {data.plots?.map(p => (
                                <div key={p.id} className={`farm-plot state-${p.state}`}>
                                    <div className="farm-plot-head">
                                        Plot {p.slotIndex + 1}
                                        <span className={`farm-soil soil-${p.soilState}`}>
                                            {SOIL_LABEL[p.soilState] || p.soilState}
                                            {p.yieldModifier && p.yieldModifier !== 1
                                                ? ` (${p.yieldModifier > 1 ? '+' : ''}${Math.round((p.yieldModifier - 1) * 100)}% yield)`
                                                : ''}
                                        </span>
                                    </div>
                                    {p.restingSecondsToNextStep != null && (
                                        <p className="farm-resting">Resting, recovers in {fmtDuration(p.restingSecondsToNextStep)}</p>
                                    )}
                                    {p.soilState !== 'rich' && (data.manure?.held ?? 0) >= (data.manure?.cost ?? 5) && (
                                        <button className="farm-btn farm-manure-btn" disabled={busy}
                                            onClick={() => act('/api/farming/manure', { plotId: p.id })}>
                                            Spread Manure ({data.manure?.cost})
                                        </button>
                                    )}

                                    {p.state === 'empty' && (
                                        <>
                                            <p className="farm-plot-desc">Untilled ground.</p>
                                            <button className="farm-btn" disabled={busy || !data.hasHoe}
                                                onClick={() => act('/api/farming/till', { plotId: p.id })}>Till{data.timers ? ` (${fmtDuration(data.timers.till)})` : ''}</button>
                                        </>
                                    )}

                                    {p.state === 'tilled' && (
                                        <div className="farm-sow">
                                            <select
                                                value={sow[p.id]?.cropId ?? unlockedCrops[0]?.id ?? 0}
                                                onChange={e => setSow(s => ({ ...s, [p.id]: { cropId: +e.target.value, count: s[p.id]?.count ?? 10 } }))}
                                            >
                                                {unlockedCrops.map(c => <option key={c.id} value={c.id}>{c.name} ({c.seedsHeld})</option>)}
                                            </select>
                                            <input type="number" min={1} max={data.plotCapacity ?? 10}
                                                value={sow[p.id]?.count ?? 10}
                                                onChange={e => setSow(s => ({ ...s, [p.id]: { cropId: s[p.id]?.cropId ?? unlockedCrops[0]?.id ?? 0, count: +e.target.value } }))}
                                            />
                                            <button className="farm-btn" disabled={busy || unlockedCrops.length === 0}
                                                onClick={() => act('/api/farming/sow', {
                                                    plotId: p.id,
                                                    cropId: sow[p.id]?.cropId ?? unlockedCrops[0]?.id,
                                                    seedCount: sow[p.id]?.count ?? 10,
                                                })}>Sow</button>
                                        </div>
                                    )}

                                    {p.state === 'growing' && (
                                        <>
                                            <p className="farm-plot-desc">{p.crop?.name} · {p.seedCount} sown</p>
                                            <p className="farm-grow">
                                                Growing, {fmtDuration(p.secondsRemaining ?? 0)}
                                                {p.tended && <span className="farm-tended"> · tended</span>}
                                            </p>
                                        </>
                                    )}

                                    {p.state === 'ready' && (
                                        <>
                                            <p className="farm-plot-desc gold-text">{p.crop?.name} · ready!</p>
                                            <button className="farm-btn primary" disabled={busy}
                                                onClick={() => act('/api/farming/harvest', { plotId: p.id })}>Harvest</button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        {data.nextPlot && (
                            <div className="farm-newplot">
                                <div className="farm-newplot-title">Enclose field {data.nextPlot.number}</div>
                                <div className="farm-cost">
                                    {data.nextPlot.cost.map(c => {
                                        const miss = data.nextPlot!.missing.find(m => m.itemName === c.itemName)
                                        const have = miss ? miss.have : c.qty
                                        return (
                                            <div key={c.itemName} className={`farm-cost-row ${miss ? 'short' : 'ok'}`}>
                                                <span>{c.itemName}</span>
                                                <span>{have.toLocaleString()} / {c.qty.toLocaleString()}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                                <button className="farm-btn primary" disabled={busy || !data.nextPlot.canAfford}
                                    onClick={() => act('/api/farming/build-plot')}>Enclose Field</button>
                            </div>
                        )}
                        {!data.nextPlot && (data.plots?.length ?? 0) < (data.plotMax ?? 20) && (
                            <p className="farm-note">Raise your Farming level to enclose another field.</p>
                        )}

                        <div className="farm-crops">
                            <div className="farm-crops-title">Crops</div>
                            {data.crops.map(c => (
                                <div key={c.id} className={`farm-crop-row ${c.unlocked ? '' : 'locked'}`}>
                                    <span>{c.name}{c.isPerennial ? ' 🌳' : ''}</span>
                                    <span className="farm-crop-meta">
                                        {c.unlocked
                                            ? `${c.seedsHeld} seed${c.seedsHeld === 1 ? '' : 's'} · ${fmtDuration(c.growSeconds)} · ${c.yieldPerSeed}×`
                                            : `Lv ${c.plantLevel} · ${c.seedsHeld} seed${c.seedsHeld === 1 ? '' : 's'}`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                {!loading && data && data.hasFarmstead && tab === 'storage' && (
                    <PropertyStorage
                        storeMode={storeMode}
                        onToggleStoreMode={onToggleStoreMode}
                        storeAmount={storeAmount}
                        onStoreAmountChange={onStoreAmountChange}
                        refreshKey={storeRefresh}
                    />
                )}

                {!loading && data && data.hasFarmstead && tab === 'processing' && (
                    <RecipeList
                        skill="Farming"
                        playerLevel={data.farmingLevel}
                        onStartRecipe={(id) => { onStartRecipe(id); onClose() }}
                    />
                )}
            </div>
        </div>
    )
}
