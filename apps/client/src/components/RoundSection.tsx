import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import ErrorLine from './ErrorLine'
import './TavernPanel.css'

// Standing a round (server services/rounds.ts): one Ale for everyone here, at
// least three of you, and every skill a little quicker for everyone for six
// hours, beside any provision. Ale is for company, so alone it does nothing.
// Where a keeper sells Ale (the Gaster's Gaze), it can be bought here too, dear.
// Shared by the Salty Sloth (TavernPanel) and a plain taproom (TaproomPanel).

interface RoundOffer {
    tavern: string; present: number; need: number; ale: number; canStand: boolean
    hours: number; magnitude: number
    mine: { secondsLeft: number; stoodBy: string | null } | null
    keeper: { name: string; price: number } | null
    gold: number
}

export default function RoundSection() {
    const [offer, setOffer] = useState<RoundOffer | null>(null)
    const [busy, setBusy] = useState(false)
    const [line, setLine] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [qty, setQty] = useState(3)
    useEffect(() => {
        let cancelled = false
        apiFetch<{ offer: RoundOffer | null }>('/api/rounds')
            .then(r => { if (!cancelled) setOffer(r.offer) })
            .catch(() => { /* no round section is a fine fallback */ })
        return () => { cancelled = true }
    }, [])
    if (!offer) return null

    const post = async (path: string, body?: unknown) => {
        setBusy(true); setErr(null)
        try {
            const r = await apiFetch<{ message: string; offer: RoundOffer | null }>(path, {
                method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            })
            setLine(r.message)
            setOffer(r.offer)
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'That did not work.')
        } finally {
            setBusy(false)
        }
    }
    const short = offer.present < offer.need
    const cost = offer.keeper ? offer.keeper.price * qty : 0
    return (
        <div className="tavern-round">
            <p className="tavern-line">
                {offer.present} {offer.present === 1 ? 'person' : 'people'} here.
                {' '}A round wants at least {offer.need}, one Ale each, and everyone works {offer.magnitude}% quicker at everything for {offer.hours} hours.
                {' '}You carry {offer.ale} Ale.
            </p>
            {offer.mine && (
                <p className="tavern-named-where">
                    You have a round in you{offer.mine.stoodBy ? ` from ${offer.mine.stoodBy}` : ''}, about {Math.ceil(offer.mine.secondsLeft / 3600)} hours left.
                </p>
            )}
            <button className="btn btn-gold" disabled={busy || !offer.canStand} onClick={() => post('/api/rounds')}>
                {busy ? 'Pouring…' : short ? `Wants ${offer.need - offer.present} more` : `Stand a round (${offer.present} Ale)`}
            </button>

            {offer.keeper && (
                <div className="tavern-keeper">
                    <p className="tavern-line">
                        {offer.keeper.name} sells Ale at {offer.keeper.price} gold a mug. It is a good deal cheaper to brew your own.
                    </p>
                    <div className="tavern-named-row">
                        <input
                            className="tavern-qty" type="number" min={1} max={50} value={qty}
                            onChange={e => setQty(Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1))))}
                        />
                        <button className="btn" disabled={busy || cost > offer.gold} onClick={() => post('/api/rounds/buy', { quantity: qty })}>
                            Buy {qty} for {cost} gold
                        </button>
                    </div>
                </div>
            )}

            {line && <p className="tavern-line">{line}</p>}
            <ErrorLine message={err} className="tavern-error" />
        </div>
    )
}
