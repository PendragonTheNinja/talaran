import { useCallback, useEffect, useState } from 'react'
import { getQualityColor } from '../lib/items'
import { itemDetail, loadItemDetails, onItemDetailsLoaded, type ItemDetail } from '../lib/itemDetails'
import './ItemTooltip.css'

/**
 * The item tooltip, for every surface that shows an item.
 *
 * This is the inventory's tooltip, lifted out of LeftPanel so the rest of the
 * game can use it. Everywhere else was falling back to the browser's `title`
 * attribute: a bare name, in the OS font, with a delay and a position nobody
 * can control, and no description, quality colour or buff line. Ground items,
 * building storage, shop listings, merchant shelves and the trade window all
 * showed an item picture and told you almost nothing about it.
 *
 * Fields the caller already has (the inventory has all of them) are used as
 * given; anything missing is filled from the item-details cache, which is why a
 * surface that knows only a name still gets the full tooltip.
 */

/**
 * What a surface can pass. Only the name is required.
 *
 * Deliberately no index signature: one would force every caller's own item
 * interface to declare one too, and the inventory's does not. Extra fields on
 * a caller's object are simply ignored.
 */
export interface TooltipItem {
    name: string
    quality?: string | null
    description?: string | null
    slot?: string | null
    buff_effect?: string | null
    buff_skill?: string | null
    buff_magnitude?: number | null
    buff_seconds?: number | null
}

/**
 * What a buff does, in the same words the inventory has always used.
 *
 * Timer is a percentage off the action timer, rare is a better chance at a rare
 * find, double is a percentage of actions, travel is a percentage off the road.
 */
function describeBuff(item: TooltipItem | ItemDetail): string {
    const where = item.buff_skill || 'every skill'
    const n = item.buff_magnitude ?? 0
    switch (item.buff_effect) {
        case 'timer': return `${n}% faster at ${where}`
        case 'rare': return `${n}% better rare finds at ${where}`
        case 'double': return `${n}% chance of a double yield at ${where}`
        case 'travel': return `${n}% faster travel`
        default: return `A boon to ${where}`
    }
}

function fmtBuffTime(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.round((seconds % 3600) / 60)
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return h === 1 ? 'an hour' : `${h} hours`
    return m === 1 ? 'a minute' : `${m} minutes`
}

/**
 * The floating panel itself: chrome and placement, no content.
 *
 * Two tooltips existed, and they placed themselves differently. The item one
 * clamped to the viewport with hard-coded numbers, so near the right edge it
 * sat under the pointer; the skills one flipped to the other side of the
 * cursor, which is the better behaviour. That one won, and now both use it.
 */
export function TooltipShell({
    x, y, width = 240, height = 150, children,
}: {
    x: number
    y: number
    width?: number
    height?: number
    children: React.ReactNode
}) {
    const PAD = 14
    const flipX = x + PAD + width > window.innerWidth
    const flipY = y + PAD + height > window.innerHeight
    return (
        <div
            className="item-tooltip"
            style={{
                left: flipX ? x - width - PAD : x + PAD,
                top: flipY ? y - height - PAD : y + PAD,
                width,
            }}
        >
            {children}
        </div>
    )
}

interface ItemTooltipProps {
    x: number
    y: number
    item: TooltipItem
    /**
     * What clicking does HERE. The same item means different things on the
     * ground, in a pack and on a shelf, so the surface supplies this rather
     * than the tooltip guessing.
     */
    hint?: string | null
}

export default function ItemTooltip({ x, y, item, hint }: ItemTooltipProps) {
    // Whatever the surface knows, plus whatever the cache knows. The surface
    // wins: a shop listing's own quality is the one being sold.
    const cached = itemDetail(item.name)
    const quality = item.quality ?? cached?.quality ?? null
    const description = item.description ?? cached?.description ?? null
    const buff = item.buff_effect ? item : (cached?.buff_effect ? cached : null)

    return (
        <TooltipShell x={x} y={y} width={220}>
            <p
                className="item-tooltip-name"
                style={{ color: getQualityColor(quality) || 'var(--color-gold-bright)' }}
            >
                {item.name}
            </p>
            {quality && (
                <p className="item-tooltip-quality">
                    {quality.charAt(0).toUpperCase() + quality.slice(1)}
                </p>
            )}
            {description && <p className="item-tooltip-desc">{description}</p>}
            {/* What a provision actually does. The flavour text says "steadies
                the hands", which is the right voice and tells nobody what they
                are eating. */}
            {buff && (
                <p className="item-tooltip-buff">
                    {describeBuff(buff)} for {fmtBuffTime(buff.buff_seconds ?? 0)}
                </p>
            )}
            {hint && <p className="item-tooltip-hint">{hint}</p>}
        </TooltipShell>
    )
}

/**
 * Attach the tooltip to anything.
 *
 * Returns handlers to spread onto a tile and the tooltip element to drop at the
 * end of the component. The details load is kicked off on first hover rather
 * than on mount, so a surface nobody hovers costs nothing.
 *
 *   const { hoverProps, tooltipEl } = useItemTooltip()
 *   <div {...hoverProps(item, 'Left-click to pick up')} />
 *   {tooltipEl}
 */
export function useItemTooltip() {
    const [state, setState] = useState<{ x: number; y: number; item: TooltipItem; hint?: string | null } | null>(null)
    // The cache arriving mid-hover should fill the tooltip in rather than wait
    // for the pointer to move.
    const [, setGeneration] = useState(0)
    useEffect(() => onItemDetailsLoaded(() => setGeneration(g => g + 1)), [])

    const hoverProps = useCallback((item: TooltipItem | null | undefined, hint?: string | null) => {
        if (!item?.name) return {}
        const show = (e: { clientX: number; clientY: number }) => {
            loadItemDetails()
            setState({ x: e.clientX, y: e.clientY, item, hint })
        }
        return {
            onMouseEnter: show,
            onMouseMove: show,
            onMouseLeave: () => setState(null),
        }
    }, [])

    const tooltipEl = state
        ? <ItemTooltip x={state.x} y={state.y} item={state.item} hint={state.hint} />
        : null

    return { hoverProps, tooltipEl, hideTooltip: () => setState(null) }
}
