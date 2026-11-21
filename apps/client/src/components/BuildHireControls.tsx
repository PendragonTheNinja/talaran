import { useState } from 'react'
import './TavernPanel.css'
import './GuildHallTab.css'
import './SlipPanel.css'

// The hiring side of a build raised a material at a time (docs/antura-plan.md
// §6b): who may work on it, what a piece pays, the purse that pays it, and
// materials left for the builders, in the order a player thinks of it
// (Nathan, 2026-11-20: the first version read as one block of controls).
// Shared by the boat on a slip (SlipPanel) and the guild hall (GuildHallTab);
// the parent says where each operation goes (server services/boats.ts and
// services/guildHall.ts, both paying through services/builds.ts).

export type HireOp = 'hands' | 'hands/remove' | 'rate' | 'purse/lay' | 'purse/take' | 'stock/lay' | 'stock/take'

export interface BuildHire {
    rate: number
    purse: number
    hands: string[]
    /** Per material: laid here, and room for more (what the build still wants, less what is laid). */
    materials: { item: string; laid: number; room: number }[]
}

const fmt = (n: number) => n.toLocaleString('en-US')

export default function BuildHireControls({ site, hire, atSite, busy, intro, leftover, canManage = true, canTakeStock = true, onAct }: {
    /** Where the work stands, in words: "slip" or "hall". */
    site: string
    hire: BuildHire
    /** Gold and materials move only for someone standing there. */
    atSite: boolean
    busy: boolean
    intro: string
    leftover: string
    /** May name hands, set the pay, and take gold back out. */
    canManage?: boolean
    /** May take laid materials back. */
    canTakeStock?: boolean
    onAct: (op: HireOp, body: Record<string, unknown>, fallback: string) => Promise<void>
}) {
    const [hand, setHand] = useState('')
    const [rate, setRate] = useState(String(hire.rate))
    const [gold, setGold] = useState('')
    const [qty, setQty] = useState<Record<string, string>>({})
    const amountOf = (item: string) => Math.floor(Number(qty[item] ?? ''))
    const piecesPaid = hire.rate > 0 ? Math.floor(hire.purse / hire.rate) : null

    return (
        <div className="hall-hire">
            <p className="tavern-section">Hire Carpenters</p>
            <p className="muted-text hall-note">{intro}</p>

            <p className="hall-hire-step">1. Who may work on it</p>
            <div className="hall-hire-row">
                {hire.hands.length ? hire.hands.map(n => (
                    <button key={n} className="btn hall-hire-chip" disabled={busy || !canManage} title={`Stop ${n} working on it`}
                        onClick={() => onAct('hands/remove', { name: n }, 'That carpenter could not be let go.')}>
                        {n} ✕
                    </button>
                )) : <span className="muted-text">Nobody yet.</span>}
            </div>
            {canManage && (
                <div className="hall-hire-row">
                    <input className="hall-hire-input" placeholder="A carpenter's name" value={hand} maxLength={32}
                        onChange={e => setHand(e.target.value)} />
                    <button className="btn btn-gold" disabled={busy || !hand.trim()}
                        onClick={() => { void onAct('hands', { name: hand.trim() }, 'That carpenter could not be added.'); setHand('') }}>
                        Add
                    </button>
                </div>
            )}

            <p className="hall-hire-step">2. What a piece pays</p>
            {canManage && (
                <div className="hall-hire-row">
                    <input className="hall-hire-input hall-hire-num" inputMode="numeric" value={rate} onChange={e => setRate(e.target.value)} />
                    <span className="muted-text">gold for each piece a carpenter sets in</span>
                    <button className="btn btn-gold" disabled={busy || String(hire.rate) === rate.trim()}
                        onClick={() => onAct('rate', { rate: Number(rate) }, 'The pay could not be set.')}>
                        Set
                    </button>
                </div>
            )}
            <p className="muted-text hall-note">
                {hire.rate > 0 ? `Now ${fmt(hire.rate)} gold a piece.` : 'Now nothing: carpenters work on it as a favor.'}
            </p>

            <p className="hall-hire-step">3. The purse</p>
            <p className="muted-text hall-note">
                {`It holds ${fmt(hire.purse)} gold`}
                {piecesPaid !== null ? `, enough for ${fmt(piecesPaid)} more ${piecesPaid === 1 ? 'piece' : 'pieces'}.` : '.'}
                {' '}Each piece is paid from it the moment it goes in. When it cannot pay for the next piece, the carpenter stops.
            </p>
            <div className="hall-hire-row">
                <input className="hall-hire-input hall-hire-num" inputMode="numeric" placeholder="Gold" value={gold} onChange={e => setGold(e.target.value)} />
                <button className="btn btn-gold" disabled={busy || !atSite || !(Number(gold) > 0)}
                    onClick={() => { void onAct('purse/lay', { amount: Number(gold) }, 'The gold could not be put in.'); setGold('') }}>
                    Put in
                </button>
                {canManage && (
                    <button className="btn" disabled={busy || !atSite || !(Number(gold) > 0) || hire.purse < 1}
                        onClick={() => { void onAct('purse/take', { amount: Number(gold) }, 'The gold could not be taken out.'); setGold('') }}>
                        Take out
                    </button>
                )}
            </div>

            <p className="hall-hire-step">4. Materials at the {site}</p>
            <p className="muted-text hall-note">Carpenters use these before their own. Only what it still needs can be left here.</p>
            {hire.materials.map(m => {
                const n = amountOf(m.item)
                return (
                    <div key={m.item} className="hall-hire-row">
                        <span className="hall-req-name">
                            {m.item}: {fmt(m.laid)} here{m.room > 0 ? `, room for ${fmt(m.room)} more` : ', all it needs'}
                        </span>
                        <input className="hall-hire-input hall-hire-num" inputMode="numeric" placeholder="How many" value={qty[m.item] ?? ''}
                            onChange={e => setQty(q => ({ ...q, [m.item]: e.target.value }))} />
                        <button className="btn btn-gold" disabled={busy || !atSite || !(n > 0) || n > m.room}
                            onClick={() => { void onAct('stock/lay', { item: m.item, quantity: n }, 'Those could not be left here.'); setQty(q => ({ ...q, [m.item]: '' })) }}>
                            Leave
                        </button>
                        {canTakeStock && (
                            <button className="btn" disabled={busy || !atSite || !(n > 0) || n > m.laid}
                                onClick={() => { void onAct('stock/take', { item: m.item, quantity: n }, 'Those could not be taken back.'); setQty(q => ({ ...q, [m.item]: '' })) }}>
                                Take back
                            </button>
                        )}
                    </div>
                )
            })}
            <p className="muted-text hall-note">{leftover}</p>
        </div>
    )
}
