import db from '../db'
import { logger } from '../lib/logger'

// Travel find-events: what a walker turns up on the road. The finds are rows
// in `road_finds` (migration 20261121150000; CLAUDE.md §2, nouns are rows), so a
// new find, its odds, or its lines are content. `region` is the island whose
// roads turn it up, or null for any island. Read through a one-minute cache,
// as the language filter's list is.

export interface TravelEvent {
    id: string
    region: string | null   // matches location.region; null = any island
    itemName: string
    quantity: number
    rarity: number          // 1-in-N chance per minute of road
    messages: string[]      // journey-log flavor lines; one picked at random when it fires
}

const CACHE_MS = 60_000
let cache: TravelEvent[] = []
let loadedAt = 0

/** Every active road find, fresh to within a minute. */
export async function loadRoadFinds(): Promise<TravelEvent[]> {
    if (Date.now() - loadedAt < CACHE_MS) return cache
    try {
        const rows = await db('road_finds').where({ is_active: true }).orderBy('id')
        cache = rows.map((r: any) => ({
            id: r.key,
            region: r.region ?? null,
            itemName: r.item_name,
            quantity: Number(r.quantity) || 1,
            rarity: Math.max(1, Number(r.rarity) || 1),
            messages: Array.isArray(r.messages) ? r.messages : JSON.parse(r.messages || '[]'),
        }))
    } catch (err) {
        logger.error(`loadRoadFinds error: ${err}`)
    }
    loadedAt = Date.now()
    return cache
}

/** The finds as last loaded, for callers that cannot wait (call loadRoadFinds first). */
export function roadFindsCached(): TravelEvent[] {
    return cache
}

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
 * The Wayfaring level gives a small nudge to odds (effective rarity shrinks slightly w/ level).
 */
export async function rollTravelEvents(baseTime: number, region: string, level: number = 1, boost: number = 1): Promise<RolledEvent[]> {
    const segments = Math.max(1, Math.ceil(baseTime / 60))
    const pool = (await loadRoadFinds()).filter(e => e.region === region || e.region === null)

    // Level nudge: up to ~15% better odds by high level, capped. Tune freely.
    // A Wayfinder's Amulet multiplies it (services/jewelry.ts).
    const luck = (1 + Math.min(0.15, level * 0.0015)) * boost

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