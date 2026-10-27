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
    /** Health it mends when eaten, by the fight's food rule; null when it mends nothing. */
    mends: number | null
    /** Jewelry: what it does, drawing on the wearer's Talar (docs/talar-spec.md §8). */
    aids?: string | null
}

let byName: Map<string, ItemDetail> | null = null
/** When byName arrived, so a long-open tab picks up changed items. */
let loadedAt = 0
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
 * How old the table may get before a lookup quietly fetches it again. It was
 * loaded once per page, so a tab open across a content change kept the old
 * rows: raw food went on sale as food, and its tooltip still said nothing
 * about mending until a refresh (2026-10-16). The server caches its copy for
 * five minutes (routes/items.ts), so a change shows within about fifteen.
 */
const STALE_MS = 10 * 60 * 1000

/**
 * Load the table, once, and again in the background once it is STALE_MS old.
 *
 * A failure resolves to an empty map rather than rejecting: a tooltip with just
 * a name is the old behaviour and perfectly survivable, and the next call
 * retries.
 */
export function loadItemDetails(): Promise<Map<string, ItemDetail>> {
    if (byName && Date.now() - loadedAt < STALE_MS) return Promise.resolve(byName)
    if (inFlight) return inFlight
    // Stale: answer with what we have and refresh behind it.
    const stale = byName

    inFlight = apiFetch<{ items: ItemDetail[] }>('/api/items/tooltips')
        .then(data => {
            const map = new Map<string, ItemDetail>()
            for (const item of data.items || []) map.set(item.name, item)
            byName = map
            loadedAt = Date.now()
            generation++
            listeners.forEach(fn => fn())
            return map
        })
        .catch(() => {
            // Keep what we had, and try again in a minute rather than on
            // every tooltip until the server answers.
            if (byName) loadedAt = Date.now() - STALE_MS + 60_000
            return byName ?? new Map<string, ItemDetail>()
        })
        .finally(() => { inFlight = null })

    return stale ? Promise.resolve(stale) : inFlight
}

/** What is known about an item right now. Null before the load lands. */
export function itemDetail(name: string | null | undefined): ItemDetail | null {
    if (!name) return null
    if (byName && Date.now() - loadedAt >= STALE_MS) void loadItemDetails()
    return byName?.get(name) ?? null
}
