import { apiFetch } from './api'

/**
 * Everything a tooltip needs to say about an item, for every item, held for the
 * session.
 *
 * Surfaces that show an item image mostly know a name and a quantity: ground
 * items, building storage, shop listings, merchant shelves, the trade window.
 * Rather than widen each of those payloads and keep five of them in step, the
 * detail is fetched once from /api/items/tooltips and looked up by name here.
 *
 * Items are static content. They change when a migration ships, not while
 * someone is playing, so one request per session is the whole cost.
 */

export interface ItemDetail {
    id: number
    name: string
    type: string | null
    subtype: string | null
    quality: string | null
    tier: number | null
    slot: string | null
    level_required: number | null
    description: string | null
    buff_effect: string | null
    buff_skill: string | null
    buff_magnitude: number | null
    buff_seconds: number | null
    // Combat gear (docs/combat-spec.md §6, §7); null on everything else.
    weapon_form: string | null
    damage_type: string | null
    aim: number | null
    power: number | null
    armour: number | null
    /** From the weapon's form, worked out on the server. */
    swing_seconds: number | null
    /** The skill level_required is checked against, from the server; null when ungated. */
    requires_skill: string | null
}

let byName: Map<string, ItemDetail> | null = null
let inFlight: Promise<Map<string, ItemDetail>> | null = null
/** Bumped on every load so hooks holding a lookup re-render when it arrives. */
let generation = 0
const listeners = new Set<() => void>()

export function onItemDetailsLoaded(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

export function itemDetailsGeneration(): number {
    return generation
}

/**
 * Load the table, once.
 *
 * A failure resolves to an empty map rather than rejecting: a tooltip with just
 * a name is the old behaviour and perfectly survivable, and the next call
 * retries.
 */
export function loadItemDetails(): Promise<Map<string, ItemDetail>> {
    if (byName) return Promise.resolve(byName)
    if (inFlight) return inFlight

    inFlight = apiFetch<{ items: ItemDetail[] }>('/api/items/tooltips')
        .then(data => {
            const map = new Map<string, ItemDetail>()
            for (const item of data.items || []) map.set(item.name, item)
            byName = map
            generation++
            listeners.forEach(fn => fn())
            return map
        })
        .catch(() => new Map<string, ItemDetail>())
        .finally(() => { inFlight = null })

    return inFlight
}

/** What is known about an item right now. Null before the load lands. */
export function itemDetail(name: string | null | undefined): ItemDetail | null {
    if (!name) return null
    return byName?.get(name) ?? null
}
