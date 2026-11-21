import { getItemIcon } from '../lib/items'
import type { useItemTooltip } from './ItemTooltip'
import './GuildHallTab.css'

// One material a build raised a piece at a time still wants: its icon, how
// far along it is, what the player carries and what is laid at the site, and
// the button that starts setting it in. Shared by the boat on a slip
// (SlipPanel), the guild hall (GuildHallTab), and a hand's hall work
// (HallWorkPanel).

export interface BuildRequirement { item: string; needed: number; delivered: number; exists: boolean; held: number; stocked?: number }

const fmt = (n: number) => n.toLocaleString('en-US')
const percent = (n: number, of: number) => `${Math.min(100, (n / Math.max(1, of)) * 100).toFixed(1)}%`

export default function BuildRequirementRow({ r, site, busy, blocked, hoverProps, onAdd }: {
    r: BuildRequirement
    /** Where laid materials lie, in words: "the slip", "the hall". */
    site: string
    busy: boolean
    /** Why this cannot be built now, shown on the button, or null. */
    blocked: string | null
    hoverProps: ReturnType<typeof useItemTooltip>['hoverProps']
    onAdd: () => void
}) {
    const done = r.delivered >= r.needed
    const stocked = r.stocked ?? 0
    return (
        <div className="hall-req">
            <div className="inventory-slot occupied hall-req-icon" {...hoverProps({ name: r.item })}>
                <img src={getItemIcon(r.item)} alt={r.item} className="inventory-item-icon" onError={e => { e.currentTarget.style.display = 'none' }} />
            </div>
            <div className="hall-req-body">
                <span className="hall-req-name">{r.item}</span>
                <div className="hall-bar"><div className="hall-bar-fill" style={{ width: percent(r.delivered, r.needed) }} /></div>
                <span className="muted-text hall-req-count">
                    {fmt(r.delivered)} of {fmt(r.needed)}
                    {r.exists ? ` · you carry ${fmt(r.held)}` : ' · no one in Talaran can make these yet'}
                    {stocked > 0 && ` · ${fmt(stocked)} laid at ${site}`}
                </span>
            </div>
            <button
                className="btn btn-gold hall-req-btn"
                disabled={busy || done || !r.exists || r.held + stocked < 1 || !!blocked}
                title={blocked ?? undefined}
                onClick={onAdd}
            >
                {done ? 'Done' : !r.exists ? 'Not made yet' : `Add ${r.item}`}
            </button>
        </div>
    )
}
