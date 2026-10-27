import db from '../db'
import { logger } from '../lib/logger'
import { SERVER_ERROR } from '../lib/serviceResult'
import { nextGameMidnight } from '../lib/gameTime'
import { activeXpForSeconds } from './farming'
import { awardXp, playerSkillLevel } from './xp'
import { HUNDREDTHS, spendTalarWithin, type TalarState } from './talar'
import { churchHere } from './church'
import { loadDurabilityTiers, durabilityRule } from './durability'
import { endFightIfAny } from './combatFights'
import { DEATH_PILE_PRIVATE_MINUTES, announceGroundChange } from './groundItems'
import { afterCommit } from '../lib/afterCommit'
import { pushToPlayer, pushToPlayerAfterCommit, pushToRoom } from '../lib/realtime'
import { wardableHead, wardFarmsteadWithin, settleWardsWithin } from './husbandry'
import { moveIntoStorageWithin, moveOutOfStorageWithin } from './property'
import { eligibleLocations, eventsChanged } from './worldEvents'
import { announceServer } from './records'
import { takeItemsWithin, notifyInventoryChanged } from './inventory'

// Spells (docs/talar-spec.md §5 to §7). A spell is a row (services' nouns);
// what it does is an entry in EFFECTS below (verbs are code).
//
// Common rules, all enforced in castSpell:
//  - Learned by keeping a vigil at a church, from the spell's Talar level
//    (startVigil / resolveVigil below; Nathan, 2026-10-27).
//  - Every spell has its own cooldown per player (player_spells.ready_at),
//    read and written on the player's locked row, so two parallel casts pay
//    once and only one lands.
//  - Paid from the reservoir inside the same transaction as the effect; any
//    refusal after the payment throws, so it rolls back with it.
//  - Instant: a cast never takes the player's one action slot.

export interface SpellRow {
    id: number
    key: string
    name: string
    description: string | null
    talar_level: number
    cost: number
    cooldown_kind: 'timer' | 'daily' | 'per_death'
    cooldown_seconds: number | null
    display_order: number
    vigil_minutes: number
    /** A charged gem given up when the vigil ends. */
    offering_item_name: string | null
    /** A writing found in the world, given up with it; null for the first tier. */
    writ_item_name: string | null
}

/** A refusal from inside the cast. Thrown, never returned (CLAUDE.md §4 rule 3). */
export class SpellAbort extends Error {}

/**
 * Casting XP (§7): the band of the spell's level for W minutes, where W is a
 * tenth of its cooldown held between 2 (spells cast often) and 30 (daily
 * ones). A spell with no clock to its cooldown (Tether) takes the floor.
 */
export function castMinutes(spell: Pick<SpellRow, 'cooldown_kind' | 'cooldown_seconds'>): number {
    const cooldownMinutes = spell.cooldown_kind === 'daily' ? 24 * 60
        : spell.cooldown_kind === 'timer' ? Number(spell.cooldown_seconds ?? 0) / 60
        : 0
    return Math.min(30, Math.max(2, cooldownMinutes / 10))
}

export function castXp(spell: Pick<SpellRow, 'talar_level' | 'cooldown_kind' | 'cooldown_seconds'>): number {
    return activeXpForSeconds(spell.talar_level, castMinutes(spell) * 60)
}

/** When a spell cast at `now` is next ready; null when no clock holds it (per death). */
function nextReady(spell: SpellRow, now: Date): Date | null {
    if (spell.cooldown_kind === 'daily') return nextGameMidnight(now)
    if (spell.cooldown_kind === 'timer') return new Date(now.getTime() + Number(spell.cooldown_seconds ?? 0) * 1000)
    return null
}

export interface CastOutcome {
    message: string
    /** What the client shows beyond the message, spell by spell. */
    detail?: unknown
}

/** One choice in the spellbook: what it says, what it costs, and what is sent back to cast it. */
export interface SpellTarget {
    label: string
    cost: number
    params: Record<string, unknown>
    /** Anything else the spellbook needs to offer this choice (Sending: what is in that store). */
    detail?: unknown
}

interface SpellEffect {
    /**
     * Work that cannot run inside the cast's transaction (settling a fight runs
     * its own). Called only after an unlocked look says the cast would go
     * ahead; the transaction checks everything again.
     */
    prepare?: (playerId: number, spell: SpellRow, params: Record<string, unknown>) => Promise<void>
    /** Choices a cast needs (Daily Step's destinations), for the spellbook to offer. */
    targets?: (playerId: number, spell: SpellRow) => Promise<SpellTarget[]>
    /** Talar this cast costs (may be fractional; charged in hundredths). Throws SpellAbort to refuse. */
    cost: (trx: any, playerId: number, spell: SpellRow, params: Record<string, unknown>) => Promise<number>
    /** Do it, inside the cast's transaction. Throws SpellAbort to refuse; the payment rolls back. */
    cast: (trx: any, playerId: number, spell: SpellRow, params: Record<string, unknown>) => Promise<CastOutcome>
}

// ── Wearsight (§6) ───────────────────────────────────────────────────────────
// Reads the wear on everything worn, in words, never numbers. Wear is silent
// everywhere else (Nathan, 2026-10-12); this is the one paid exception.

/** The word for how much use is left: by uses against the item's guarantee. */
export function wearWord(uses: number, guaranteedUses: number): string {
    if (uses > guaranteedUses) return 'living on borrowed time'
    if (uses > guaranteedUses * 0.85) return 'near its end'
    if (uses > guaranteedUses * 0.5) return 'worn'
    return 'sound'
}

const wearsight: SpellEffect = {
    cost: async (_trx, _playerId, spell) => Number(spell.cost),
    cast: async (trx, playerId) => {
        const worn = await trx('player_equipment').where({ player_id: playerId }).first()
        const slots = Object.entries(worn ?? {})
            .filter(([column, itemId]) => column.endsWith('_item_id') && column !== 'trophy_item_id' && itemId)
            .map(([column, itemId]) => ({ slot: column.slice(0, -'_item_id'.length), itemId: Number(itemId) }))
        if (!slots.length) return { message: 'You look yourself over. You are wearing nothing that could wear out.', detail: [] }

        const ids = slots.map(s => s.itemId)
        const [items, wear, tiers] = await Promise.all([
            trx('items').whereIn('id', ids).select('id', 'name', 'tier', 'durability_uses', 'durability_break_pct'),
            trx('player_item_wear').where({ player_id: playerId }).whereIn('item_id', ids).select('item_id', 'uses'),
            loadDurabilityTiers(trx),
        ])
        const byId = new Map(items.map((i: any) => [Number(i.id), i]))
        const usesOf = new Map<number, number>(wear.map((w: any) => [Number(w.item_id), Number(w.uses)]))
        const detail = slots.map(s => {
            const item: any = byId.get(s.itemId)
            const rule = durabilityRule(item, tiers)
            return { slot: s.slot, name: item?.name ?? '?', word: wearWord(usesOf.get(s.itemId) ?? 0, rule.guaranteedUses) }
        })
        return { message: 'You look over what you are wearing, and see it plainly.', detail }
    },
}

// ── Daily Step (§6) ──────────────────────────────────────────────────────────
// One way, alone, to anywhere on this island the player has walked to before
// (player_exploration 'location' rows, plus Talador, where everyone starts).
// Priced by the road it skips: the rate times the shortest way there by road,
// in base seconds. Leaves exactly as starting travel does (routes/travel.ts):
// the fight is settled first (prepare), then the action and any trade end.
// No Wayfaring XP, no finds on the road.

const START_TOWN = 'Talador'

interface StepTarget { locationId: number; name: string; seconds: number }

/** Every place this player could step to from where they stand, with its road time. */
async function stepTargets(conn: any, playerId: number): Promise<{ from: number | null; targets: StepTarget[] }> {
    const player = await conn('players').where({ id: playerId }).select('current_location_id').first()
    const from = player?.current_location_id ? Number(player.current_location_id) : null
    if (!from) return { from, targets: [] }
    const here = await conn('locations').where({ id: from }).select('region').first()
    const island = await conn('locations').where({ region: here?.region ?? null }).select('id', 'name')
    const onIsland = new Map<number, string>(island.map((l: any) => [Number(l.id), l.name]))

    const visited = new Set<number>(
        (await conn('player_exploration').where({ player_id: playerId, discovery_type: 'location' }).pluck('discovery_key'))
            .map((k: string) => Number(String(k).split(':')[1])),
    )
    for (const [id, name] of onIsland) if (name === START_TOWN) visited.add(id)

    // Shortest road time from here to every place on the island (Dijkstra; a
    // few dozen places, so a plain scan for the nearest is plenty).
    const roads = await conn('location_connections').select('from_location_id', 'to_location_id', 'base_travel_time', 'is_bidirectional')
    const next = new Map<number, { to: number; s: number }[]>()
    const link = (a: number, b: number, s: number) => {
        if (!onIsland.has(a) || !onIsland.has(b)) return
        if (!next.has(a)) next.set(a, [])
        next.get(a)!.push({ to: b, s })
    }
    for (const r of roads) {
        const s = Number(r.base_travel_time ?? 30)
        link(Number(r.from_location_id), Number(r.to_location_id), s)
        if (r.is_bidirectional) link(Number(r.to_location_id), Number(r.from_location_id), s)
    }
    const dist = new Map<number, number>([[from, 0]])
    const done = new Set<number>()
    for (;;) {
        let at: number | null = null
        for (const [id, d] of dist) if (!done.has(id) && (at === null || d < dist.get(at)!)) at = id
        if (at === null) break
        done.add(at)
        for (const { to, s } of next.get(at) ?? []) {
            const d = dist.get(at)! + s
            if (d < (dist.get(to) ?? Infinity)) dist.set(to, d)
        }
    }

    const targets = [...visited]
        .filter(id => id !== from && onIsland.has(id) && dist.has(id))
        .map(id => ({ locationId: id, name: onIsland.get(id)!, seconds: dist.get(id)! }))
        .sort((a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name))
    return { from, targets }
}

async function stepTarget(conn: any, playerId: number, params: Record<string, unknown>): Promise<StepTarget> {
    const want = Math.floor(Number(params.locationId))
    if (!Number.isFinite(want) || want <= 0) throw new SpellAbort('Choose where to step to.')
    const target = (await stepTargets(conn, playerId)).targets.find(t => t.locationId === want)
    if (!target) throw new SpellAbort('You can only step to a place on this island you have walked to before.')
    return target
}

/** Talar for a step of `seconds` of road, in whole hundredths. */
function stepCost(spell: SpellRow, seconds: number): number {
    return Math.round(Number(spell.cost) * seconds * HUNDREDTHS) / HUNDREDTHS
}

/**
 * Move a player to another place at once, leaving the way starting travel does
 * (routes/travel.ts): their action ends and any open trade is called off. The
 * fight, if any, must already be settled (endFightIfAny runs its own
 * transaction, so callers do it first); one begun since is refused rather than
 * left mid-swing. Shared by Daily Step and Portal. Returns where they left.
 */
async function stepIntoWithin(trx: any, playerId: number, to: { locationId: number; name: string }): Promise<string> {
    const me = await trx('players').where({ id: playerId }).forNoKeyUpdate().first('current_location_id')
    const left = await trx('locations').where({ id: me?.current_location_id ?? null }).first('name')
    const action = await trx('player_actions').where({ player_id: playerId }).first()
    if (action?.action_type === 'combat') throw new SpellAbort('You cannot step away in the middle of a fight.')
    if (action) await trx('player_actions').where({ id: action.id }).delete()

    const trade = await trx('trades')
        .where(function (this: any) { this.where({ player1_id: playerId }).orWhere({ player2_id: playerId }) })
        .whereIn('status', ['pending', 'active'])
        .forUpdate()
        .first()
    if (trade) {
        await trx('trades').where({ id: trade.id }).update({ status: 'cancelled' })
        const otherId = trade.player1_id === playerId ? trade.player2_id : trade.player1_id
        afterCommit(trx, () => pushToPlayer(otherId, 'trade_cancelled', { reason: 'The other player left the area.' }))
    }

    await trx('players').where({ id: playerId }).update({ current_location_id: to.locationId })
    pushToPlayerAfterCommit(trx, playerId, 'stepped', { locationId: to.locationId, destination: to.name })
    return left?.name ?? 'where you stood'
}

const dailyStep: SpellEffect = {
    prepare: async (playerId) => { await endFightIfAny(playerId) },
    targets: async (playerId, spell) => (await stepTargets(db, playerId)).targets
        .map(t => ({ label: t.name, cost: stepCost(spell, t.seconds), params: { locationId: t.locationId } })),
    cost: async (trx, playerId, spell, params) => stepCost(spell, (await stepTarget(trx, playerId, params)).seconds),
    cast: async (trx, playerId, _spell, params) => {
        await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id')
        const target = await stepTarget(trx, playerId, params)
        const left = await stepIntoWithin(trx, playerId, target)
        return { message: `You step out of ${left} and into ${target.name}.`, detail: { destination: target.name } }
    },
}

// ── Tether (§6) ──────────────────────────────────────────────────────────────
// Cast after a fall, from anywhere: the latest death pile stays private to its
// owner DEATH_PILE_PRIVATE_MINUTES longer. Once per death: a pile already held
// is refused, so the cooldown is the death itself and no clock is kept.
// A death pile is told from an ordinary drop by its private window, which is
// set to exactly DEATH_PILE_PRIVATE_MINUTES at the fall (dropEverythingWithin).

const DEATH_WINDOW_SECONDS = DEATH_PILE_PRIVATE_MINUTES * 60

const tether: SpellEffect = {
    cost: async (_trx, _playerId, spell) => Number(spell.cost),
    cast: async (trx, playerId) => {
        const now = new Date()
        const piles = trx('ground_items')
            .where({ dropped_by_player_id: playerId })
            .where('visible_to_all_at', '>', now)
            .whereRaw('visible_to_all_at - dropped_at >= make_interval(secs => ?)', [DEATH_WINDOW_SECONDS])
        const latest: { at: Date | null } | undefined = await piles.clone().max('dropped_at as at').first()
        if (!latest?.at) throw new SpellAbort('Nothing of yours is lying anywhere to hold on to.')

        const pile = await trx('ground_items')
            .where({ dropped_by_player_id: playerId, dropped_at: latest.at })
            .forUpdate()
            .select('id', 'location_id', 'dropped_at', 'visible_to_all_at')
        const held = pile.some((g: any) =>
            new Date(g.visible_to_all_at).getTime() - new Date(g.dropped_at).getTime() > DEATH_WINDOW_SECONDS * 1000)
        if (held) throw new SpellAbort('You are already holding on to what you dropped. It will not hold any tighter.')

        await trx('ground_items').whereIn('id', pile.map((g: any) => g.id))
            .update({ visible_to_all_at: trx.raw('visible_to_all_at + make_interval(mins => ?)', [DEATH_PILE_PRIVATE_MINUTES]) })
        const where = Number(pile[0].location_id)
        const place = await trx('locations').where({ id: where }).select('name').first()
        afterCommit(trx, () => announceGroundChange(where))
        return {
            message: `You keep a hold on what you dropped at ${place?.name ?? 'the place you fell'}. It stays yours a quarter of an hour longer.`,
            detail: { stacks: pile.length },
        }
    },
}

// ── Larder Ward (§6) ─────────────────────────────────────────────────────────
// Cast at the farmstead over every pen there, for some hours. The ward itself
// is husbandry's (services/husbandry.ts); this is its price: the rate per
// head-hour covered, for the head in the pens when it is cast.

const WARD_HOURS = [4, 8, 12]
const WARD_MAX_HOURS = 12

function wardHours(params: Record<string, unknown>): number {
    const hours = Math.floor(Number(params.hours))
    if (!Number.isFinite(hours) || hours < 1 || hours > WARD_MAX_HOURS) throw new SpellAbort(`A ward holds from 1 to ${WARD_MAX_HOURS} hours.`)
    return hours
}

async function wardHead(conn: any, playerId: number): Promise<number> {
    const r = await wardableHead(playerId, conn)
    if ('error' in r) throw new SpellAbort(r.error)
    return r.head
}

const larderWard: SpellEffect = {
    targets: async (playerId, spell) => {
        const head = await wardHead(db, playerId)
        return WARD_HOURS.map(h => ({
            label: `${h} hours`, cost: Math.round(Number(spell.cost) * head * h * HUNDREDTHS) / HUNDREDTHS, params: { hours: h },
        }))
    },
    cost: async (trx, playerId, spell, params) => {
        const hours = wardHours(params)
        return Math.round(Number(spell.cost) * (await wardHead(trx, playerId)) * hours * HUNDREDTHS) / HUNDREDTHS
    },
    cast: async (trx, playerId, _spell, params) => {
        const hours = wardHours(params)
        const r = await wardFarmsteadWithin(trx, playerId, hours)
        if ('error' in r) throw new SpellAbort(r.error)
        const fed = r.toppedUp ? ` ${r.toppedUp === 1 ? 'One empty trough fills' : `${r.toppedUp} empty troughs fill`} from your store.` : ''
        return {
            message: `You walk the pens and set the ward. ${r.pens === 1 ? 'The pen is' : `All ${r.pens} pens are`} looked after for the next ${hours} hours.${fed}`,
            detail: r,
        }
    },
}

// ── Sending (§6) ─────────────────────────────────────────────────────────────
// One stack between the pack and a store of the player's OWN, anywhere on the
// island they stand on. Own storage only, so it never stands in for a trade.
// The move is the storage route's own (moveIntoStorageWithin and
// moveOutOfStorageWithin in services/property.ts): locked, relative, all or
// nothing, and a full store refuses rather than destroys. A farmstead's Larder
// Ward is settled first, as at the chest. It runs inside the cast, so a
// refused move throws and the Talar comes back with it.

const PROPERTY_WORD: Record<string, string> = { farmstead: 'Farmstead', shop: 'Shop', homestead: 'Homestead' }

/** The player's properties on the island they stand on. */
async function ownStoresHere(conn: any, playerId: number): Promise<any[]> {
    const here = await conn('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId).first('l.region')
    return conn('player_properties as pp').join('locations as l', 'l.id', 'pp.location_id')
        .where('pp.player_id', playerId).where('l.region', here?.region ?? null)
        .orderBy('pp.id')
        .select('pp.id', 'pp.type', 'pp.storage_slots', 'l.name as location')
}

async function sendingStore(conn: any, playerId: number, params: Record<string, unknown>): Promise<any> {
    const id = Math.floor(Number(params.propertyId))
    const store = (await ownStoresHere(conn, playerId)).find(p => Number(p.id) === id)
    if (!store) throw new SpellAbort('You can only send to a store of your own on this island.')
    return store
}

const sending: SpellEffect = {
    targets: async (playerId, spell) => {
        const stores = await ownStoresHere(db, playerId)
        if (!stores.length) throw new SpellAbort('You have no store of your own on this island to send to.')
        const out: SpellTarget[] = []
        for (const p of stores) {
            const items = await db('property_storage as ps').join('items as i', 'i.id', 'ps.item_id')
                .where('ps.property_id', p.id).where('ps.quantity', '>', 0).orderBy('i.name')
                .select('i.id as itemId', 'i.name', 'ps.quantity')
            out.push({
                label: `${PROPERTY_WORD[p.type] ?? 'Store'}, ${p.location}`,
                cost: Number(spell.cost),
                params: { propertyId: Number(p.id) },
                detail: { slots: Number(p.storage_slots ?? 50), used: items.length, items },
            })
        }
        return out
    },
    cost: async (trx, playerId, spell, params) => {
        await sendingStore(trx, playerId, params)
        return Number(spell.cost)
    },
    cast: async (trx, playerId, _spell, params) => {
        const store = await sendingStore(trx, playerId, params)
        const itemId = Math.floor(Number(params.itemId))
        const quantity = Math.floor(Number(params.quantity ?? Infinity))
        if (!Number.isFinite(itemId) || itemId <= 0) throw new SpellAbort('Choose what to send.')
        if (!(quantity > 0)) throw new SpellAbort('Choose how many to send.')
        const fetch = params.direction === 'fetch'
        if (params.direction !== 'store' && !fetch) throw new SpellAbort('Choose whether to send it away or fetch it back.')

        if (store.type === 'farmstead') await settleWardsWithin(trx, playerId)
        const moved = fetch
            ? await moveOutOfStorageWithin(trx, playerId, store, itemId, quantity)
            : await moveIntoStorageWithin(trx, playerId, store, itemId, quantity)
        if (!moved.ok) throw new SpellAbort(moved.error)
        afterCommit(trx, () => notifyInventoryChanged(playerId))
        const where = `${(PROPERTY_WORD[store.type] ?? 'store').toLowerCase()} at ${store.location}`
        return {
            message: fetch
                ? `${moved.quantity} ${moved.name} come to your hand from your ${where}.`
                : `${moved.quantity} ${moved.name} leave your pack for your ${where}.`,
            detail: { itemId, quantity: moved.quantity, direction: params.direction },
        }
    },
}

// ── Kindle (§6) ──────────────────────────────────────────────────────────────
// A small skill event where the caster stands, on the world-events machinery
// (applyEventBonus in services/worldEvents.ts, inside awardXp). A smaller pool
// than a scheduled event, and nobody draws more than a quarter of it, so it
// takes four people to empty. Gathering skills only, from what can be done at
// that spot. One per place, never on top of a live event for the same skill.
// Whoever lit it earns Talar XP for every boosted action by someone else
// (payKindler): the reward is for bringing people together.

const KINDLE_SKILLS = ['Woodcutting', 'Mining', 'Fishing', 'Foraging', 'Hunting']
const KINDLE_POOL = 80
const KINDLE_SHARE = 20
const KINDLE_MINUTES = 45
const KINDLE_MULTIPLIER = 1.25
/** Talar XP to the kindler per boosted action by someone else: this many seconds of the spell's band. */
const KINDLE_REWARD_SECONDS = 30

/** The gathering skills that can be worked where this player stands. */
async function kindleSkillsHere(conn: any, playerId: number): Promise<{ locationId: number; place: string; skills: string[] }> {
    const here = await conn('players as p').join('locations as l', 'l.id', 'p.current_location_id')
        .where('p.id', playerId).first('l.id', 'l.name')
    if (!here) throw new SpellAbort('You are nowhere the light can be kindled.')
    const skills: string[] = []
    for (const skill of KINDLE_SKILLS) {
        if ((await eligibleLocations({ skill, location_ids: null })).includes(Number(here.id))) skills.push(skill)
    }
    if (!skills.length) throw new SpellAbort(`There is no gathering to be done at ${here.name}, so nothing to kindle.`)
    return { locationId: Number(here.id), place: here.name, skills }
}

const kindle: SpellEffect = {
    targets: async (playerId, spell) => {
        const { skills } = await kindleSkillsHere(db, playerId)
        return skills.map(skill => ({ label: skill, cost: Number(spell.cost), params: { skill } }))
    },
    cost: async (_trx, _playerId, spell) => Number(spell.cost),
    cast: async (trx, playerId, _spell, params) => {
        const { locationId, place, skills } = await kindleSkillsHere(trx, playerId)
        const skill = skills.find(k => k.toLowerCase() === String(params.skill ?? '').toLowerCase())
        if (!skill) throw new SpellAbort(`Choose the work to kindle: ${skills.join(', ')}.`)

        // The place locked, so two people kindling it at once light it once.
        await trx('locations').where({ id: locationId }).forNoKeyUpdate().first('id')
        const burning = await trx('world_events')
            .where({ location_id: locationId, kind: 'skill' })
            .whereNull('ended_at').where('ends_at', '>', trx.fn.now())
            .where(function (this: any) { this.whereNotNull('kindled_by').orWhereRaw('LOWER(skill) = ?', [skill.toLowerCase()]) })
            .first('skill', 'kindled_by')
        if (burning?.kindled_by) throw new SpellAbort(`The light is already kindled at ${place}.`)
        if (burning) throw new SpellAbort(`${skill} at ${place} is already going further today. Kindle something else, or somewhere else.`)

        const me = await trx('players').where({ id: playerId }).first('username')
        const announcement = `${me?.username ?? 'Someone'} has kindled the light at ${place}. ${skill} goes further there for a while, for anyone who comes.`
        await trx('world_events').insert({
            type_id: null, name: 'Kindled Light', kind: 'skill', skill,
            location_id: locationId, xp_multiplier: KINDLE_MULTIPLIER,
            pool_total: KINDLE_POOL, pool_left: KINDLE_POOL, per_player_cap: KINDLE_SHARE,
            ends_at: new Date(Date.now() + KINDLE_MINUTES * 60_000),
            started_by: playerId, kindled_by: playerId, announcement,
        })
        afterCommit(trx, () => {
            eventsChanged()
                .then(() => announceServer(announcement))
                .catch(err => logger.error(`[spells] kindle announce failed: ${err}`))
        })
        return {
            message: `The ground at ${place} warms under your hands. ${skill} here goes further for ${KINDLE_MINUTES} minutes, ${KINDLE_SHARE} actions to a person. Bring people.`,
            detail: { skill, place },
        }
    },
}

/** Talar XP for a kindler, for `uses` boosted actions by others at their light (services/worldEvents.ts). */
export async function payKindler(kindlerId: number, uses: number): Promise<void> {
    const spell: SpellRow | undefined = await db('spells').where({ key: 'kindle' }).first()
    if (!spell || uses < 1) return
    const xp = activeXpForSeconds(spell.talar_level, KINDLE_REWARD_SECONDS) * uses
    // Paid for other people's work, not an action of the caster's: never raised by an event.
    await awardXp(kindlerId, 'Talar', xp, db, { eventBonus: false })
}

// ── Portal (§6) ──────────────────────────────────────────────────────────────
// A doorway from where the caster stands to anywhere on this island they have
// walked to (Daily Step's places and roads). Open for a few minutes to anyone
// at its near end, who steps through at once, leaving the way travel does.
// Priced on the road it skips. The caster is paid a little for each other
// person who goes through, up to five. A row in `portals` with its closing
// time; anything past it is ignored on read.

const PORTAL_RATE = 0.25
const PORTAL_MINUTES = 5
/** One minute more for every this many levels above the spell's. */
const PORTAL_LEVELS_PER_MINUTE = 4
const PORTAL_REWARD_SECONDS = 120
const PORTAL_PAID_RIDERS = 5

function portalCost(spell: SpellRow, seconds: number): number {
    return Math.round((Number(spell.cost) + PORTAL_RATE * seconds) * HUNDREDTHS) / HUNDREDTHS
}

const portal: SpellEffect = {
    targets: async (playerId, spell) => (await stepTargets(db, playerId)).targets
        .map(t => ({ label: t.name, cost: portalCost(spell, t.seconds), params: { locationId: t.locationId } })),
    cost: async (trx, playerId, spell, params) => portalCost(spell, (await stepTarget(trx, playerId, params)).seconds),
    cast: async (trx, playerId, spell, params) => {
        const me = await trx('players').where({ id: playerId }).forNoKeyUpdate().first('current_location_id')
        const target = await stepTarget(trx, playerId, params)
        const level = await playerSkillLevel(playerId, 'Talar')
        const minutes = PORTAL_MINUTES + Math.floor(Math.max(0, level - spell.talar_level) / PORTAL_LEVELS_PER_MINUTE)
        const from = Number(me.current_location_id)
        await trx('portals').insert({
            caster_id: playerId, from_location_id: from, to_location_id: target.locationId,
            closes_at: new Date(Date.now() + minutes * 60_000),
        })
        afterCommit(trx, () => pushToRoom(`location_${from}`, 'portals_changed', { locationId: from }))
        return {
            message: `A doorway opens beside you onto ${target.name}. It will hold for ${minutes} minutes, for anyone here.`,
            detail: { destination: target.name, minutes },
        }
    },
}

export interface PortalView { id: number; destination: string; caster: string; closesAt: string; mine: boolean }

/** The doorways open where this player stands. */
export async function portalsHere(playerId: number): Promise<PortalView[]> {
    const me = await db('players').where({ id: playerId }).first('current_location_id')
    if (!me?.current_location_id) return []
    const rows = await db('portals as p')
        .join('locations as l', 'l.id', 'p.to_location_id')
        .join('players as c', 'c.id', 'p.caster_id')
        .where('p.from_location_id', me.current_location_id)
        .where('p.closes_at', '>', db.fn.now())
        .orderBy('p.closes_at')
        .select('p.id', 'l.name as destination', 'c.username as caster', 'p.closes_at', 'p.caster_id')
    return rows.map((r: any) => ({
        id: r.id, destination: r.destination, caster: r.caster,
        closesAt: new Date(r.closes_at).toISOString(), mine: Number(r.caster_id) === playerId,
    }))
}

/** Step through an open doorway where the player stands. */
export async function stepThroughPortal(playerId: number, portalId: number): Promise<{ success: true; message: string } | { success: false; error: string }> {
    try {
        const id = Math.floor(Number(portalId))
        if (!Number.isFinite(id) || id <= 0) return { success: false, error: 'There is no such doorway.' }
        // A fight is settled first, as travel does; it runs its own transaction.
        await endFightIfAny(playerId)

        const out = await db.transaction(async trx => {
            const me = await trx('players').where({ id: playerId }).forNoKeyUpdate().first('current_location_id')
            const door = await trx('portals as p').join('locations as l', 'l.id', 'p.to_location_id')
                .where('p.id', id).first('p.id', 'p.caster_id', 'p.from_location_id', 'p.to_location_id', 'p.closes_at', 'l.name as destination')
            if (!door || new Date(door.closes_at).getTime() <= Date.now()) throw new SpellAbort('The doorway has closed.')
            if (Number(door.from_location_id) !== Number(me?.current_location_id)) throw new SpellAbort('That doorway is not here.')

            const left = await stepIntoWithin(trx, playerId, { locationId: Number(door.to_location_id), name: door.destination })

            // Paid once a rider, for up to five riders who are not the caster.
            const casterId = Number(door.caster_id)
            const added = await trx('portal_riders').insert({ portal_id: door.id, player_id: playerId })
                .onConflict(['portal_id', 'player_id']).ignore().returning('player_id')
            if (added.length && casterId !== playerId) {
                const others = await trx('portal_riders').where({ portal_id: door.id }).whereNot({ player_id: casterId }).count('* as c').first()
                if (Number(others?.c ?? 0) <= PORTAL_PAID_RIDERS) {
                    afterCommit(trx, () => {
                        payPortalCaster(casterId).catch(err => logger.error(`[spells] portal reward failed: ${err}`))
                    })
                }
            }
            return { left, destination: door.destination as string, from: Number(door.from_location_id) }
        })
        logger.info(`[spells] player ${playerId} stepped through portal ${id}`)
        return { success: true, message: `You step through the doorway, out of ${out.left} and into ${out.destination}.` }
    } catch (err) {
        if (err instanceof SpellAbort) return { success: false, error: err.message }
        logger.error(`stepThroughPortal error (player ${playerId}, portal ${portalId}): ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}

async function payPortalCaster(casterId: number): Promise<void> {
    const spell: SpellRow | undefined = await db('spells').where({ key: 'portal' }).first()
    if (!spell) return
    // Paid for someone else's journey, not an action of the caster's: never raised by an event.
    await awardXp(casterId, 'Talar', activeXpForSeconds(spell.talar_level, PORTAL_REWARD_SECONDS), db, { eventBonus: false })
}

const EFFECTS: Record<string, SpellEffect> = {
    wearsight,
    daily_step: dailyStep,
    tether,
    larder_ward: larderWard,
    sending,
    kindle,
    portal,
}

/** What a spell offers to cast at (Daily Step's destinations), or null for a spell that needs no choice. */
export async function spellTargets(playerId: number, key: string): Promise<{ success: true; targets: SpellTarget[] | null } | { success: false; error: string }> {
    try {
        const spell: SpellRow | undefined = await db('spells').where({ key: String(key), is_active: true }).first()
        const effect = spell ? EFFECTS[spell.key] : undefined
        if (!spell || !effect) return { success: false, error: 'There is no such working.' }
        return { success: true, targets: effect.targets ? await effect.targets(playerId, spell) : null }
    } catch (err) {
        if (err instanceof SpellAbort) return { success: false, error: err.message }
        logger.error(`spellTargets error (player ${playerId}, ${key}): ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}

// ── Words for a spell's price and wait (the Manual; services/manualQueries.ts) ──
// Spells priced by what they cover keep their rates in the code above, so the
// words are said here, beside them, and nowhere else.

export function spellCostWords(spell: Pick<SpellRow, 'key' | 'cost'>): string {
    const cost = Number(spell.cost)
    switch (spell.key) {
        case 'daily_step': return `${cost} Talar per second of road skipped`
        case 'larder_ward': return `${cost} Talar a head an hour`
        case 'portal': return `${cost} Talar and ${PORTAL_RATE} more per second of road`
        default: return `${cost} Talar`
    }
}

export function spellCooldownWords(spell: Pick<SpellRow, 'cooldown_kind' | 'cooldown_seconds'>): string {
    if (spell.cooldown_kind === 'daily') return 'once a day'
    if (spell.cooldown_kind === 'per_death') return 'once after each fall'
    const m = Math.round(Number(spell.cooldown_seconds ?? 0) / 60)
    return m >= 60 ? `every ${m / 60 === Math.round(m / 60) ? m / 60 : (m / 60).toFixed(1)} h` : `every ${m} min`
}

/** Only spells that do something are listed anywhere. */
export function spellIsLive(key: string): boolean {
    return !!EFFECTS[key]
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface SpellView {
    key: string
    name: string
    description: string | null
    level: number
    /** Base cost in Talar; for a rate (Daily Step, Larder Ward) the rate. */
    cost: number
    cooldownKind: string
    cooldownSeconds: number | null
    learned: boolean
    canLearn: boolean
    /** ISO time it is next ready, or null when ready now. */
    readyAt: string | null
    xp: number
    vigilMinutes: number
    offering: string | null
    writ: string | null
    /** Whether the pack holds the offering and the writ right now. */
    hasOffering: boolean
    hasWrit: boolean
}

/** Every spell, as this player stands with it. Only spells whose effect exists are offered. */
export async function listSpells(playerId: number): Promise<{ spells: SpellView[]; atChurch: boolean }> {
    const [rows, learned, level, church, carried] = await Promise.all([
        db('spells').where({ is_active: true }).orderBy([{ column: 'talar_level' }, { column: 'display_order' }]),
        db('player_spells').where({ player_id: playerId }).select('spell_id', 'ready_at'),
        playerSkillLevel(playerId, 'Talar'),
        churchHere(playerId),
        db('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
            .where('pi.player_id', playerId).where('pi.quantity', '>', 0).pluck('i.name'),
    ])
    const inPack = new Set<string>(carried)
    const mine = new Map(learned.map((l: any) => [Number(l.spell_id), l]))
    const now = Date.now()
    return {
        atChurch: !!church,
        spells: rows.filter((s: SpellRow) => EFFECTS[s.key]).map((s: SpellRow) => {
            const own: any = mine.get(s.id)
            const ready = own?.ready_at ? new Date(own.ready_at) : null
            return {
                key: s.key, name: s.name, description: s.description, level: s.talar_level,
                cost: Number(s.cost), cooldownKind: s.cooldown_kind, cooldownSeconds: s.cooldown_seconds,
                learned: !!own, canLearn: level >= s.talar_level,
                readyAt: ready && ready.getTime() > now ? ready.toISOString() : null,
                xp: castXp(s),
                vigilMinutes: Number(s.vigil_minutes),
                offering: s.offering_item_name, writ: s.writ_item_name,
                hasOffering: !s.offering_item_name || inPack.has(s.offering_item_name),
                hasWrit: !s.writ_item_name || inPack.has(s.writ_item_name),
            }
        }),
    }
}

// ── Learning: the vigil ──────────────────────────────────────────────────────
// A timed action at a church ('spell_vigil', resolved by the tick). Nothing is
// taken at the start: the offering and the writ are given up when the vigil
// ends, in one transaction with the learning, so leaving early costs nothing
// and nothing can be spent twice. The vigil pays the spell's band for its
// minutes, like any timed work.

/** What is wrong with keeping this vigil now, or null. Read-only; the resolve checks again under lock. */
async function vigilProblem(conn: any, playerId: number, spell: SpellRow): Promise<string | null> {
    if (!(await churchHere(playerId))) return 'Spells are taught in a church.'
    if ((await playerSkillLevel(playerId, 'Talar')) < spell.talar_level) {
        return `You need Talar level ${spell.talar_level} to learn ${spell.name}.`
    }
    if (await conn('player_spells').where({ player_id: playerId, spell_id: spell.id }).first()) return `You already know ${spell.name}.`
    for (const name of [spell.offering_item_name, spell.writ_item_name]) {
        if (!name) continue
        const held = await conn('player_inventory as pi').join('items as i', 'i.id', 'pi.item_id')
            .where('pi.player_id', playerId).where('i.name', name).where('pi.quantity', '>', 0).first()
        if (!held) return `To learn ${spell.name} you must bring ${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}.`
    }
    return null
}

async function learnableSpell(key: string): Promise<SpellRow | undefined> {
    const spell: SpellRow | undefined = await db('spells').where({ key: String(key), is_active: true }).first()
    return spell && EFFECTS[spell.key] ? spell : undefined
}

export async function startVigil(playerId: number, key: string): Promise<{ ok: true; timerSeconds: number; spell: string } | { ok: false; error: string; status: number }> {
    try {
        const spell = await learnableSpell(key)
        if (!spell) return { ok: false, status: 400, error: 'There is no such working to learn.' }
        const problem = await vigilProblem(db, playerId, spell)
        if (problem) return { ok: false, status: 400, error: problem }

        const seconds = Math.max(60, Number(spell.vigil_minutes) * 60)
        const player = await db('players').where({ id: playerId }).first('current_location_id')
        const now = new Date()
        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'spell_vigil',
            action_data: spell.key,
            location_id: player?.current_location_id ?? null,
            started_at: now,
            completes_at: new Date(now.getTime() + seconds * 1000),
            auto_restart: false,
            last_timer_seconds: seconds,
            last_bot_check: now,
            bot_check_pending: false,
        })
        return { ok: true, timerSeconds: seconds, spell: spell.name }
    } catch (err: any) {
        // The unique index on player_actions.player_id is the real guard (CLAUDE.md §9).
        if (err?.code === '23505') return { ok: false, status: 409, error: 'You are already performing an action' }
        logger.error(`startVigil error (player ${playerId}, ${key}): ${err}`)
        return { ok: false, status: 500, error: SERVER_ERROR }
    }
}

export interface VigilResult {
    success: boolean
    error?: string
    xpAwarded?: number
    skillName?: string
    message?: string
}

/** The end of a vigil, for the tick: give up the offering and the writ, learn the spell, pay the vigil. */
export async function resolveVigil(playerId: number, key: string | null): Promise<VigilResult> {
    try {
        const spell = await learnableSpell(String(key ?? ''))
        if (!spell) return { success: false, error: 'There is no such working to learn.' }
        if (!(await churchHere(playerId))) return { success: false, error: 'You left the church before the vigil was done.' }

        const xp = await db.transaction(async trx => {
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id')
            if ((await playerSkillLevel(playerId, 'Talar')) < spell.talar_level) {
                throw new SpellAbort(`You need Talar level ${spell.talar_level} to learn ${spell.name}.`)
            }
            // Completion is the gate: only the request that adds the row goes on.
            const added = await trx('player_spells').insert({ player_id: playerId, spell_id: spell.id })
                .onConflict(['player_id', 'spell_id']).ignore().returning('spell_id')
            if (!added.length) throw new SpellAbort(`You already know ${spell.name}.`)

            const giving = [spell.offering_item_name, spell.writ_item_name]
                .filter((n): n is string => !!n).map(name => ({ name, quantity: 1 }))
            if (giving.length) {
                const taken = await takeItemsWithin(trx, playerId, giving)
                if (!taken.ok) throw new SpellAbort(`You no longer have what ${spell.name} asks of you. The vigil is wasted.`)
            }

            const paid = activeXpForSeconds(spell.talar_level, Number(spell.vigil_minutes) * 60)
            await awardXp(playerId, 'Talar', paid, trx)
            return paid
        })

        notifyInventoryChanged(playerId)
        logger.info(`[spells] player ${playerId} learned ${spell.key}`)
        const gave = [spell.offering_item_name, spell.writ_item_name].filter(Boolean).join(' and the ')
        return {
            success: true, xpAwarded: xp, skillName: 'Talar',
            message: `The vigil ends${gave ? ` and the ${gave} ${spell.writ_item_name ? 'are' : 'is'} spent` : ''}. You know ${spell.name} now, and will not forget it.`,
        }
    } catch (err) {
        if (err instanceof SpellAbort) return { success: false, error: err.message }
        logger.error(`resolveVigil error (player ${playerId}, ${key}): ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}

// ── Casting ──────────────────────────────────────────────────────────────────

export async function castSpell(
    playerId: number,
    key: string,
    params: Record<string, unknown> = {},
): Promise<
    | { success: true; spell: string; message: string; detail?: unknown; talar: TalarState; xpAwarded: number; readyAt: string | null }
    | { success: false; error: string }
> {
    try {
        const spell: SpellRow | undefined = await db('spells').where({ key: String(key), is_active: true }).first()
        const effect = spell ? EFFECTS[spell.key] : undefined
        if (!spell || !effect) return { success: false, error: 'There is no such working.' }

        // A look before the transaction, for spells with work that cannot run
        // inside it (prepare): only go ahead with that work if the cast would.
        if (effect.prepare) {
            const own = await db('player_spells').where({ player_id: playerId, spell_id: spell.id }).first()
            if (own && !(own.ready_at && new Date(own.ready_at).getTime() > Date.now())) {
                const cost = await effect.cost(db, playerId, spell, params).catch(() => null)
                const res = await db('player_talar').where({ player_id: playerId }).first('hundredths')
                if (cost !== null && Number(res?.hundredths ?? 0) >= Math.round(cost * HUNDREDTHS)) await effect.prepare(playerId, spell, params)
            }
        }

        const now = new Date()
        const out = await db.transaction(async trx => {
            // The player's own row for this spell, locked: the cooldown is read
            // and written under it, so parallel casts land one at a time.
            const own = await trx('player_spells').where({ player_id: playerId, spell_id: spell.id }).forUpdate().first()
            if (!own) throw new SpellAbort(`You have not learned ${spell.name}.`)
            if (own.ready_at && new Date(own.ready_at).getTime() > now.getTime()) {
                const mins = Math.ceil((new Date(own.ready_at).getTime() - now.getTime()) / 60000)
                const wait = mins < 60 ? `${mins} more minute${mins === 1 ? '' : 's'}`
                    : `${Math.ceil(mins / 60)} more hour${Math.ceil(mins / 60) === 1 ? '' : 's'}`
                throw new SpellAbort(`${spell.name} will not answer again for ${wait}.`)
            }

            const cost = await effect.cost(trx, playerId, spell, params)
            const talar = await spendTalarWithin(trx, playerId, Math.round(cost * HUNDREDTHS))
            if (!talar) throw new SpellAbort(`${spell.name} takes ${Math.ceil(cost)} Talar, and you do not have it in you.`)

            const outcome = await effect.cast(trx, playerId, spell, params)

            const ready = nextReady(spell, now)
            await trx('player_spells').where({ player_id: playerId, spell_id: spell.id })
                .update({ ready_at: ready, last_cast_at: now })

            const xp = castXp(spell)
            await awardXp(playerId, 'Talar', xp, trx)
            return { outcome, talar, xp, ready }
        })

        logger.info(`[spells] player ${playerId} cast ${spell.key}`)
        return {
            success: true, spell: spell.name, message: out.outcome.message, detail: out.outcome.detail,
            talar: out.talar, xpAwarded: out.xp, readyAt: out.ready ? out.ready.toISOString() : null,
        }
    } catch (err) {
        if (err instanceof SpellAbort) return { success: false, error: err.message }
        logger.error(`castSpell error (player ${playerId}, ${key}): ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}
