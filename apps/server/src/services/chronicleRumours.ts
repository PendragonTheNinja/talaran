import db from '../db'
import { logSubtypeFor } from './woodcutting'
import { rockSubtypeFor } from './mining'

// ── Rumours (docs/chronicle-spec.md §15, step 5) ─────────────────────────────
//
// Things that are TRUE right now and nobody has done yet: a creature never
// beaten, a museum case never filled, a drop never found, a place never
// reached, the merchant's next stop. Never forced: no secret left, no rumour.
// Never telling what the Bestiary or the museum keeps back: an unfilled case
// is named by its exhibit, an unfound drop by its place, never the item.

export interface Rumour {
    kind: string
    /** What it is about, for the cooldown: 'creature:dock_rat', 'case:12', 'place:Lanaivale'. */
    subject: string
    slots: Record<string, string | null>
}

async function placeName(locationId: number | null | undefined): Promise<string | null> {
    if (!locationId) return null
    const l = await db('locations').where({ id: locationId, is_accessible: true }).first('name')
    return l?.name ?? null
}

/** A creature nobody has ever brought down, and somewhere it is found. */
async function unkilled(): Promise<Rumour[]> {
    const rows = await db('creatures as c')
        .join('fighting_spot_creatures as fsc', 'fsc.creature_id', 'c.id')
        .join('fighting_spots as s', 's.id', 'fsc.spot_id')
        .join('locations as l', 'l.id', 's.location_id')
        .where('c.is_active', true).where('s.is_active', true).where('l.is_accessible', true)
        .whereNotExists(db('player_creature_kills as k').whereRaw('k.creature_id = c.id'))
        .select('c.key', 'c.name', 'l.name as place')
    const seen = new Set<string>()
    return rows.filter((r: any) => !seen.has(r.key) && seen.add(r.key))
        .map((r: any) => ({ kind: 'rumour_unkilled', subject: `creature:${r.key}`, slots: { creature: r.name, place: r.place } }))
}

/** A museum case nobody has given, told by its exhibit, never its item. */
async function unfilledCases(): Promise<Rumour[]> {
    const rows = await db('museum_cases as c')
        .join('items as i', 'i.id', 'c.item_id')
        .join('museum_exhibits as e', 'e.id', 'c.exhibit_id')
        .join('museums as m', 'm.id', 'e.museum_id')
        .where('i.is_active', true)
        .whereNotExists(db('museum_donations as d').whereRaw('d.case_id = c.id'))
        .select('c.id', 'e.name as exhibit', 'm.name as museum')
    return rows.map((r: any) => ({ kind: 'rumour_unfilled_case', subject: `case:${r.id}`, slots: { exhibit: r.exhibit, museum: r.museum } }))
}

/** Where a drop table's source is found: a node, a rock, a tree kind, a fighting spot. Null for work done anywhere (sawing). */
async function placesOfSource(key: string, nodes: any[]): Promise<string[]> {
    const parts = key.split(':')
    const at = (ids: number[]) => Promise.all([...new Set(ids)].map(placeName))
    if (parts[0] === 'combat') {
        const [creatureKey, spotKey] = (parts[1] ?? '').split('@')
        if (spotKey) {
            const spot = await db('fighting_spots').where({ key: spotKey, is_active: true }).first('location_id')
            return (await at(spot ? [spot.location_id] : [])).filter((p): p is string => !!p)
        }
        const spots = await db('fighting_spots as s').join('fighting_spot_creatures as fsc', 'fsc.spot_id', 's.id')
            .join('creatures as c', 'c.id', 'fsc.creature_id').where('c.key', creatureKey).where('s.is_active', true)
            .select('s.location_id')
        return (await at(spots.map((s: any) => s.location_id))).filter((p): p is string => !!p)
    }
    if (parts[0] === 'woodcutting' && parts[1] === 'node') {
        const node = nodes.find((n) => n.id === Number(parts[2]))
        return (await at(node ? [node.location_id] : [])).filter((p): p is string => !!p)
    }
    if (parts[0] === 'woodcutting') {
        const ids = nodes.filter((n) => String(n.skill).toLowerCase() === 'woodcutting' && logSubtypeFor(n.name) === parts[1]).map((n) => n.location_id)
        return (await at(ids)).filter((p): p is string => !!p)
    }
    if (parts[0] === 'mining' && parts[1] === 'rock') {
        const ids = nodes.filter((n) => String(n.skill).toLowerCase() === 'mining' && rockSubtypeFor(n) === parts[2]).map((n) => n.location_id)
        return (await at(ids)).filter((p): p is string => !!p)
    }
    return []
}

/** A place that holds a drop nobody in Talaran has ever found. The place only. */
async function unfoundItems(): Promise<Rumour[]> {
    const entries = await db('drop_table_entries as e').join('items as i', 'i.id', 'e.item_id')
        .where('e.is_active', true).where('i.is_active', true)
        .whereNotExists(db('item_firsts as f').whereRaw('f.item_id = e.item_id'))
        .distinct('e.source_key')
    if (!entries.length) return []
    const nodes = await db('resource_nodes').where({ is_active: true }).select('id', 'name', 'skill', 'location_id', 'ore_subtype')
    const places = new Set<string>()
    for (const e of entries) for (const p of await placesOfSource(String(e.source_key), nodes)) places.add(p)
    return [...places].map((place) => ({ kind: 'rumour_unfound_item', subject: `place:${place}`, slots: { place } }))
}

/** A place nobody has ever travelled to, with a neighbour the road runs from. */
async function unwalkedRoads(): Promise<Rumour[]> {
    const unreached = await db('locations as l').where('l.is_accessible', true)
        .whereNotExists(db('player_exploration as x').where('x.discovery_type', 'location').whereRaw("x.discovery_key = 'location:' || l.id"))
        // Somebody standing there got there, by a road or by being born to it
        // (everyone starts in Talador without walking to it).
        .whereNotExists(db('players as p').whereRaw('p.current_location_id = l.id'))
        .select('l.id', 'l.name')
    const out: Rumour[] = []
    for (const l of unreached) {
        const road = await db('location_connections as c')
            .join('locations as a', 'a.id', db.raw('CASE WHEN c.to_location_id = ? THEN c.from_location_id ELSE c.to_location_id END', [l.id]))
            .where((q) => q.where('c.to_location_id', l.id).orWhere('c.from_location_id', l.id))
            .where('a.is_accessible', true)
            .first('a.name')
        if (road) out.push({ kind: 'rumour_unwalked_road', subject: `road:${l.id}`, slots: { place: road.name, place2: l.name } })
    }
    return out
}

/** The travelling merchant, due within a day, and where (chosen when his visit was set). */
async function merchantDue(): Promise<Rumour[]> {
    const s = await db('world_event_settings').where({ id: 1 }).first()
    if (!s?.merchant_enabled || !s.merchant_next_at || !s.merchant_next_location_id) return []
    const at = new Date(s.merchant_next_at).getTime()
    if (at < Date.now() || at > Date.now() + 24 * 3600_000) return []
    const live = await db('world_events').where({ kind: 'merchant' }).whereNull('ended_at').where('ends_at', '>', db.fn.now()).first('id')
    if (live) return []
    const place = await placeName(s.merchant_next_location_id)
    return place ? [{ kind: 'rumour_merchant', subject: `merchant:${new Date(at).toISOString().slice(0, 10)}`, slots: { place } }] : []
}

/** Every rumour true right now. */
export async function trueRumours(): Promise<Rumour[]> {
    const lists = await Promise.all([unkilled(), unfilledCases(), unfoundItems(), unwalkedRoads(), merchantDue()])
    return lists.flat()
}
