import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import './TallyBoard.css'
import './CaskPanel.css'
import { backdropClose } from '../lib/backdrop'
import ErrorLine from './ErrorLine'

// The cask in Mettlefell (apps/server/src/services/brewing.ts). Load batches,
// walk away, draw off the ale six hours later: the kiln's shape, for Cooking.
// Drawn in the tally board's frame so the passive-work panels read as one set.

interface CaskState {
    atCask: boolean
    cookingLevel: number
    levelRequired: number
    maxBatches: number
    canMake: number
    held: { barley: number; meadowsweet: number }
    perBatch: { inputs: { itemName: string; qty: number }[]; ale: number; xp: number }
    seconds: number
    brew: { batches: number; ale: number; location: string; here: boolean; readyAt: string; ready: boolean } | null
}

function timeLeft(iso: string): string {
    const mins = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000))
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function CaskPanel({ onClose }: { onClose: () => void }) {
    const [state, setState] = useState<CaskState | null>(null)
    const [batches, setBatches] = useState(1)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [, setTick] = useState(0)

    // The first read: a full cask by default, as much as the pack can make.
    useEffect(() => {
        let cancelled = false
        apiFetch<CaskState>('/api/brewing')
            .then(st => { if (!cancelled) { setState(st); setBatches(Math.max(1, st.canMake)) } })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'The cask could not be read.') })
        return () => { cancelled = true }
    }, [])
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60000)
        return () => clearInterval(id)
    }, [])

    const post = async (path: string, body?: unknown) => {
        setBusy(true); setError(null); setNotice(null)
        try {
            const r = await apiFetch<{ message?: string; state: CaskState }>(path, {
                method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            })
            setState(r.state)
            setNotice(r.message ?? null)
        } catch (err) {
            const e = err as { status?: number; message?: string }
            if (e?.status !== 423) setError(e?.message || 'That did not work.')
        } finally {
            setBusy(false)
        }
    }

    const s = state
    return (
        <div className="tally-overlay" {...backdropClose(onClose)}>
            <div className="tally-modal" onClick={e => e.stopPropagation()}>
                <div className="tally-header">
                    <h2 className="gold-text">The Cask</h2>
                    <button className="tally-close" onClick={onClose}>✕</button>
                </div>

                <ErrorLine message={error} className="guild-error" />
                {notice && <p className="cask-notice">{notice}</p>}

                {!s ? (
                    <p className="muted-text">Knocking on the staves…</p>
                ) : s.brew ? (
                    <div className="cask-brew">
                        <p>
                            {s.brew.batches} batches working{!s.brew.here && <> in {s.brew.location}</>}:
                            {' '}<span className="gold-text">{s.brew.ale} Ale</span>
                            {s.brew.ready ? ', ready to draw off.' : `, ready in ${timeLeft(s.brew.readyAt)}.`}
                        </p>
                        {s.brew.here && (
                            <button className="btn btn-gold" disabled={busy || !s.brew.ready} onClick={() => post('/api/brewing/collect')}>
                                {busy ? 'Drawing off…' : 'Draw off the ale'}
                            </button>
                        )}
                    </div>
                ) : !s.atCask ? (
                    <p className="muted-text">There is no cask here. The cookhouse in Mettlefell keeps one.</p>
                ) : s.cookingLevel < s.levelRequired ? (
                    <p className="muted-text">Brewing ale wants Cooking {s.levelRequired}. You have {s.cookingLevel}.</p>
                ) : (
                    <div className="cask-load">
                        <p className="muted-text">
                            Each batch is {s.perBatch.inputs.map(i => `${i.qty} ${i.itemName}`).join(' and ')}, and gives {s.perBatch.ale} Ale.
                            {' '}The cask takes {s.maxBatches} batches at your level and works for {Math.round(s.seconds / 3600)} hours.
                        </p>
                        <p className="cask-held">You carry {s.held.barley} Barley and {s.held.meadowsweet} Meadowsweet.</p>
                        {s.canMake > 0 ? (
                            <>
                                <label className="cask-slider">
                                    <span>{batches} {batches === 1 ? 'batch' : 'batches'}: {batches * s.perBatch.ale} Ale</span>
                                    <input
                                        type="range" min={1} max={s.canMake} value={Math.min(batches, s.canMake)}
                                        onChange={e => setBatches(Number(e.target.value))}
                                    />
                                </label>
                                <button className="btn btn-gold" disabled={busy} onClick={() => post('/api/brewing/start', { batches })}>
                                    {busy ? 'Filling…' : 'Fill the cask'}
                                </button>
                            </>
                        ) : (
                            <p className="muted-text">You have nothing to brew with.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
