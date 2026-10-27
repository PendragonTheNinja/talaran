import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import { useItemTooltip } from './ItemTooltip'
import './SmithingMenu.css'

// Filling gems at a rift (server: services/talar.ts fillOptions). The cards
// are the bench's own (RecipeList), so a stone reads the same here as it did
// at the lapidary that cut it.

interface FillOption {
    itemId: number
    name: string
    quantity: number
    talar: number
    minutes: number
    level: number
    canFill: boolean
}

interface FillOptions {
    atRift: boolean
    open: { itemId: number; name: string; filled: number; talar: number } | null
    gems: FillOption[]
}

interface TalarFillMenuProps {
    onClose: () => void
    /** Start (or resume) filling: the gem's item id, or null to resume the open one. */
    onStartFill: (itemId: number | null) => void
}

/** Minutes as the scene would say them: "1 h 26 min", "45 min". */
function duration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h > 0 ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

export default function TalarFillMenu({ onClose, onStartFill }: TalarFillMenuProps) {
    const { hoverProps, tooltipEl } = useItemTooltip()
    const [data, setData] = useState<FillOptions | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        apiFetch<FillOptions>('/api/talar/fill')
            .then(setData)
            .catch(() => setError('The light will not answer just now.'))
    }, [])

    const start = (itemId: number | null) => { onStartFill(itemId); onClose() }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="smithing-menu-modal" onClick={e => e.stopPropagation()}>
                <div className="smithing-menu-header">
                    <h3 className="gold-text">Fill a Gem</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                {error && <p className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>{error}</p>}
                {!data && !error && <p className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>Looking into the light…</p>}

                {data?.open && (
                    <div className="smithing-recipe-grid">
                        <div className="smithing-recipe-card" onClick={() => start(null)}>
                            <div className="smithing-recipe-image" {...hoverProps({ name: data.open.name })}>
                                <img src={getItemIcon(data.open.name)} alt={data.open.name} onError={e => { e.currentTarget.style.display = 'none' }} />
                            </div>
                            <span className="smithing-recipe-name">{data.open.name}</span>
                            <div className="smithing-recipe-ingredients">
                                <span className="smithing-ingredient">{data.open.filled} of {data.open.talar} Talar</span>
                            </div>
                            <span className="station-tag warn">Carry on filling</span>
                        </div>
                    </div>
                )}

                {data && !data.open && data.gems.length === 0 && (
                    <p className="muted-text" style={{ textAlign: 'center', padding: '12px' }}>
                        You have no cut stones to fill. Rough ones must go to a lapidary first.
                    </p>
                )}

                {data && !data.open && data.gems.length > 0 && (
                    <div className="smithing-recipe-grid">
                        {data.gems.map(g => (
                            <div
                                key={g.itemId}
                                className={`smithing-recipe-card ${g.canFill ? '' : 'locked'}`}
                                onClick={() => { if (g.canFill) start(g.itemId) }}
                            >
                                <div className="smithing-recipe-image" {...hoverProps({ name: g.name })}>
                                    <img src={getItemIcon(g.name)} alt={g.name} onError={e => { e.currentTarget.style.display = 'none' }} />
                                </div>
                                <span className="smithing-recipe-name">{g.name} ×{g.quantity}</span>
                                <div className="smithing-recipe-ingredients">
                                    <span className="smithing-ingredient">Holds {g.talar} Talar</span>
                                    <span className="smithing-ingredient">{duration(g.minutes)} each</span>
                                </div>
                                {!g.canFill && <div className="smithing-locked-label">Level {g.level}</div>}
                            </div>
                        ))}
                    </div>
                )}
                {tooltipEl}
            </div>
        </div>
    )
}
