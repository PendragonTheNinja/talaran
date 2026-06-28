// Travel find-events. Travel-type-agnostic (Agility/Equitation/Sailing all use this).
// Adding a new find = append one entry. region 'global' = any island.

export interface TravelEvent {
    id: string
    region: string          // matches location.region, or 'global'
    itemName: string
    quantity: number
    rarity: number          // 1-in-N chance per segment roll
    messages: string[]      // journey-log flavor lines; one picked at random when it fires
}

export const TRAVEL_EVENTS: TravelEvent[] = [
    {
        id: 'daisy',
        region: 'Taiar Island',
        itemName: 'Daisy',
        quantity: 1,
        rarity: 10,
        messages: [
            'A scatter of daisies grew along the verge. You stooped to pick one as you passed.',
            'A single daisy nodded in the breeze at the roadside. You plucked it without breaking stride.',
            'You passed a sunlit patch of daisies and took one for the road.',
            'A daisy had pushed up through a crack in the old path. You freed it and tucked it away.',
        ],
    },
    {
        id: 'taiaria',
        region: 'Taiar Island',
        itemName: 'Taiaria',
        quantity: 1,
        rarity: 25,
        messages: [
            'Half-hidden in the shaded grass, a Taiaria bloom caught the light. You gathered it carefully.',
            'A Taiaria flower grew in the lee of a mossy stone. You knelt and picked it.',
            'The pale petals of a Taiaria stood out against the green. You added it to your pack.',
        ],
    },
    {
        id: 'tals_hope',
        region: 'Taiar Island',
        itemName: "Tal's Hope",
        quantity: 1,
        rarity: 300,
        messages: [
            "You almost walked past it... a rare Tal's Hope, blooming alone at the roadside. A fortunate find.",
            "A flash of unusual colour stopped you. A Tal's Hope, growing where little else dared. You gathered it gently.",
        ],
    },
    {
        id: 'tarnished_coin',
        region: 'Taiar Island',
        itemName: 'Tarnished Coin',
        quantity: 1,
        rarity: 50,
        messages: [
            'Something glinted in the dirt. You dug out an old tarnished coin, dropped here who-knows-when.',
            'Your boot turned over a tarnished coin half-buried in the mud. You pocketed it.',
            'A dull edge of metal in the path turned out to be an old coin, worn smooth by years.',
        ],
    },
    {
        id: 'chipped_arrowhead',
        region: 'Taiar Island',
        itemName: 'Chipped Arrowhead',
        quantity: 1,
        rarity: 500,
        messages: [
            'Among the fallen leaves lay a chipped flint arrowhead, the remnant of some long-forgotten hunt.',
            'You spotted a chipped arrowhead wedged between two roots. It appears someone missed their mark here, long ago.',
        ],
    },
    {
        id: 'four_leaf_clover',
        region: 'global',
        itemName: 'Four-Leaf Clover',
        quantity: 1,
        rarity: 100000,
        messages: [
            'You froze mid-step. There, impossibly, among countless ordinary clovers... one with four leaves. Fortune itself smiled on this road.',
            'A patch of clover like any other... except one. Four perfect leaves. You could hardly believe your eyes.',
        ],
    },
]

export interface RolledEvent {
    message: string
    itemName: string
    quantity: number
}

/**
 * Rolls travel events for a completed trip.
 * segments = ceil(baseTime / 60): roll 1 = sec 1-60, roll 2 = 61-120, etc.
 * Each segment rolls every eligible event (region match OR global) against its
 * own rarity; the RAREST success in that segment wins. Segments can yield nothing.
 * agilityLevel gives a small nudge to odds (effective rarity shrinks slightly w/ level).
 */
export function rollTravelEvents(baseTime: number, region: string, level: number = 1): RolledEvent[] {
    const segments = Math.max(1, Math.ceil(baseTime / 60))
    const pool = TRAVEL_EVENTS.filter(e => e.region === region || e.region === 'global')

    // Level nudge: up to ~15% better odds by high level, capped. Tune freely.
    const luck = 1 + Math.min(0.15, level * 0.0015)

    const results: RolledEvent[] = []

    for (let s = 0; s < segments; s++) {
        let best: TravelEvent | null = null
        for (const event of pool) {
            const effectiveRarity = Math.max(1, event.rarity / luck)
            if (Math.random() < 1 / effectiveRarity) {
                // success — keep the rarest (highest rarity number) that hit this segment
                if (!best || event.rarity > best.rarity) best = event
            }
        }
        if (best) {
            const line = best.messages[Math.floor(Math.random() * best.messages.length)]
            results.push({ message: line, itemName: best.itemName, quantity: best.quantity })
        }
    }

    return results
}