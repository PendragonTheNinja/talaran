import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { onSocket } from '../lib/socket'
import { backdropClose } from '../lib/backdrop'
import { useItemTooltip } from './ItemTooltip'
import ErrorLine from './ErrorLine'
import BuildRequirementRow, { type BuildRequirement } from './BuildRequirementRow'
import './TavernPanel.css'
import './GuildHallTab.css'

// Hall work for a hired hand (server services/guildHall.ts, building for hire;
// docs/antura-plan.md §6b): the halls of guilds that named this player, what
// each tier still wants, and what it pays. Opened from the location panel
// where such a hall stands. A guild's own members build from the Guild panel.

interface HallHire {
    hallId: number; guildName: string; locationName: string; island: string; atHall: boolean
    rate: number; purse: number
    building: { tier: number; buildLevel: number; carpentry: number; xpPerPiece: number; piecesPerAction: number; requirements: BuildRequirement[] } | null
}

const fmt = (n: number) => n.toLocaleString('en-US')

export default function HallWorkPanel({ onClose, onStartBuild }: {
    onClose: () => void
    /** Start setting `item` into the hall `hallId` (GameView's guild_build). */
    onStartBuild: (item: string, hallId: number) => void
}) {
    const [hires, setHires] = useState<HallHire[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const { hoverProps, tooltipEl } = useItemTooltip()

    const load = useCallback(() => {
        apiFetch<{ hires?: HallHire[] }>('/api/guild-hall')
            .then(s => setHires(s.hires ?? []))
            .catch(err => setError((err as { message?: string }).message || 'The hall could not be reached just now.'))
    }, [])
    useEffect(() => {
        load()
        return onSocket('guild_hall_changed', load)
    }, [load])

    return (
        <div className="tavern-overlay" {...backdropClose(onClose)}>
            <div className="tavern-modal" onClick={e => e.stopPropagation()}>
                <div className="tavern-header">
                    <h2>Hall Work</h2>
                    <button className="tavern-close" onClick={onClose}>✕</button>
                </div>
                <ErrorLine message={error} className="tavern-error" />
                {hires && hires.length === 0 && <p className="tavern-scene">Nobody has asked you to work on a hall.</p>}
                {hires?.map(h => {
                    const b = h.building
                    const purseEmpty = h.rate > 0 && h.purse < h.rate
                    const blocked = !h.atHall ? `It stands at ${h.locationName}.`
                        : b && b.carpentry < b.buildLevel ? `Needs Carpentry ${b.buildLevel}.`
                            : purseEmpty ? 'The purse at the hall is empty.' : null
                    return (
                        <div key={h.hallId} className="hall-build">
                            <p className="tavern-section">{h.guildName}'s Hall</p>
                            {!b ? (
                                <p className="muted-text hall-note">It stands as high as it can be built, for now.</p>
                            ) : (
                                <>
                                    <p className="muted-text hall-note">
                                        At {h.locationName}, building its tier {b.tier}.
                                        {h.rate > 0
                                            ? ` Pays ${fmt(h.rate)} gold for each piece you set in, from a purse of ${fmt(h.purse)}: enough for ${fmt(Math.floor(h.purse / h.rate))} more.`
                                            : ' Unpaid: a favor.'}
                                        {` 1 to 3 pieces every 20 seconds (about ${b.piecesPerAction} at your Carpentry level), each turn paying you ${b.xpPerPiece} Carpentry experience. Materials laid at the hall are used before your own.`}
                                    </p>
                                    {h.atHall
                                        ? b.requirements.map(r => (
                                            <BuildRequirementRow key={r.item} r={r} site="the hall" busy={false} blocked={blocked} hoverProps={hoverProps}
                                                onAdd={() => { onStartBuild(r.item, h.hallId); onClose() }} />
                                        ))
                                        : <p className="muted-text hall-note">{blocked}</p>}
                                </>
                            )}
                        </div>
                    )
                })}
                {tooltipEl}
            </div>
        </div>
    )
}
