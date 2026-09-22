import db from '../db'
import { logger } from '../lib/logger'
import { equippedBuildTool, BUILD_MALLET } from './construction'
import {
    addItemToInventoryWithin,
    removeItemFromInventoryWithin,
    notifyInventoryChanged,
} from './inventory'
import { awardXp } from './xp'
import { incrementStats } from './stats'

// ── Workstations ──────────────────────────────────────────────────
//
// A workstation is one row per player, per location, per type. Tools are
// SOCKETED into named slots rather than checked off booleans, so a station type
// can declare any number of slots as data. The apiary is a workstation whose
// slots hold flowers.
//
// Two rules drive everything here:
//
//   1. A recipe declares the slots it needs in recipes.required_tools. A
//      campfire is a station with no slots, so it can only run recipes that
//      need none. This is what lets raw-to-cooked work anywhere while a
//      cauldron dish needs the cookhouse.
//
//   2. Speed comes from the TIER of the socketed tool against the tier of the
//      action, not from a binary have-a-station check. Working at your tool's
//      own tier is on band; above it is slower; three tiers above is refused.

export const NO_TOOLS: string[] = []

/** Tool tier vs action tier. Same tier is on band, above is slower, below is faster. */
export const MAX_TIER_STRETCH = 2 // cannot act more than 2 tiers above your tool

export function tierMultiplier(toolTier: number, actionTier: number): number | null {
    const gap = actionTier - toolTier
    if (gap > MAX_TIER_STRETCH) return null // refused
    if (gap > 0) return Math.pow(1.35, gap)
    return Math.pow(0.88, -gap)
}

/** Tier band of a level, matching the rungs in docs/xp-rebalance.md. */
const RUNGS = [1, 13, 25, 37, 50, 62, 75, 87, 100]
export function tierOfLevel(level: number): number {
    let tier = 1
    for (let i = 0; i < RUNGS.length; i++) if (level >= RUNGS[i]) tier = i + 1
    return tier
}

export interface SlotType {
    slot: string
    label: string
    capacity: number
    accepts_subtype: string | null
    accepts_names: string | null
    is_required: boolean
    display_order: number
}

export interface SocketedTool {
    slot: string
    slot_index: number
    item_name: string
    tier: number
}

export async function getSlotTypes(stationType: string): Promise<SlotType[]> {
    return db('workstation_slot_types')
        .where({ station_type: stationType })
        .orderBy('display_order')
}

/** A campfire burns out. A bench does not, but its fire does. */
export const CAMPFIRE_SECONDS = 30 * 60
export const CAMPFIRE_MULTIPLIER = 1.5

/** A banked hearth holds heat far longer than a fire in the open. */
export const HEARTH_FUEL_SECONDS = 2 * 60 * 60

/**
 * Logs per fire, by quality.
 *
 * A good dry log lights on its own; poor wood needs a heap of it. Any wood
 * works, so this never becomes a reason to hoard one species.
 */
export const LOG_COST: Record<string, number> = { excellent: 1, fine: 2, poor: 3 }

/**
 * Stations you build rather than assemble by socketing.
 *
 * A forge is an anvil on a stump: put the anvil down and you have one. A hearth
 * is mortared stone, so the bench cannot come into being by dropping a ladle on
 * the floor. For these, the row is created by the build action and socketTool
 * refuses until it exists.
 */
export const BUILT_STATIONS = new Set(['cooking'])

/** What a hearth costs. Four trades feed the one permanent thing in cooking. */
export const HEARTH_COST: { itemName: string; qty: number }[] = [
    { itemName: 'Granite Block', qty: 20 },
    { itemName: 'Lanai Planks', qty: 6 },
    { itemName: 'Ambren Nails', qty: 15 },
]

export const HEARTH_BUILD_SECONDS = 300
export const HEARTH_LOCATION = 'Phoenwick'

/** Every log in the pack that could feed a fire, worst wood first. */
async function burnableLogs(playerId: number, trx?: any) {
    return (trx ?? db)('player_inventory as pi')
        .join('items as i', 'i.id', 'pi.item_id')
        .where('pi.player_id', playerId)
        .where('pi.quantity', '>', 0)
        .whereIn('i.quality', Object.keys(LOG_COST))
        .whereLike('i.name', '%Log')
        // Poor first: nobody wants their excellent timber burned while there is
        // rubbish in the pack to shove in instead.
        .orderByRaw(`case i.quality when 'poor' then 0 when 'fine' then 1 else 2 end`)
        .select('pi.id as invId', 'pi.quantity as quantity', 'i.id as itemId', 'i.name as name', 'i.quality as quality')
}

export async function getWorkstation(
    playerId: number,
    locationId: number,
    type: string,
): Promise<any> {
    const row = await db('workstations')
        .where({ player_id: playerId, location_id: locationId, type })
        .first()
    if (!row) return undefined

    // Swept on read, like buffs. A campfire is only ever consulted when the
    // player tries to cook, so the row that matters is always the one being
    // looked at and a cron to tidy the rest would be work for nobody.
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        await db('workstations').where({ id: row.id }).delete()
        return undefined
    }
    return row
}

/** Temporary means a campfire: no tools, and slower than a real hearth. */
export function isTemporary(station: any): boolean {
    return !!station?.expires_at
}

export async function getSocketed(workstationId: number): Promise<SocketedTool[]> {
    return db('workstation_slots as ws')
        .leftJoin('items as i', 'i.name', 'ws.item_name')
        .where('ws.workstation_id', workstationId)
        .select<SocketedTool[]>(
            'ws.slot',
            'ws.slot_index',
            'ws.item_name',
            db.raw('COALESCE(i.tier, 1) as tier'),
        )
}

/**
 * The full picture of one station for the paper doll: every slot it can have,
 * what is in each, and whether the station is functional.
 */
export async function describeStation(playerId: number, locationId: number, type: string) {
    const [station, slotTypes] = await Promise.all([
        getWorkstation(playerId, locationId, type),
        getSlotTypes(type),
    ])
    const socketed = station ? await getSocketed(station.id) : []

    const slots = slotTypes.map(st => ({
        slot: st.slot,
        label: st.label,
        capacity: st.capacity,
        isRequired: st.is_required,
        filled: socketed
            .filter(s => s.slot === st.slot)
            .sort((a, b) => a.slot_index - b.slot_index)
            .map(s => ({ index: s.slot_index, itemName: s.item_name, tier: s.tier })),
    }))

    const missingRequired = slots.filter(s => s.isRequired && s.filled.length === 0).map(s => s.label)

    return {
        exists: !!station,
        stationId: station?.id ?? null,
        type,
        slots,
        isActive: !!station && missingRequired.length === 0,
        missingRequired,
        // A campfire needs to appear in the location menu while it burns and
        // vanish when it does not, so the client needs both the flag and the
        // time left rather than inferring either.
        isTemporary: isTemporary(station),
        // The fire, for the indicator: when it goes out, and what is in the
        // pack to feed it. Both read-only.
        fuelUntil: station?.fuel_until ? new Date(station.fuel_until).toISOString() : null,
        fuelSecondsLeft: station?.fuel_until
            ? Math.max(0, Math.round((new Date(station.fuel_until).getTime() - Date.now()) / 1000))
            : 0,
        fuelMaxSeconds: isTemporary(station) ? CAMPFIRE_SECONDS : HEARTH_FUEL_SECONDS,
        nextFuel: await nextFuelFor(playerId),
        secondsLeft: station?.expires_at
            ? Math.max(0, Math.round((new Date(station.expires_at).getTime() - Date.now()) / 1000))
            : null,
    }
}

/** Which items in the player's pack may go into this slot. */
export async function eligibleForSlot(
    playerId: number,
    stationType: string,
    slot: string,
): Promise<{ itemId: number; itemName: string; tier: number; quantity: number }[]> {
    const def = await db('workstation_slot_types').where({ station_type: stationType, slot }).first()
    if (!def) return []

    const q = db('player_inventory as pi')
        .join('items as i', 'i.id', 'pi.item_id')
        .where('pi.player_id', playerId)
        .where('pi.quantity', '>', 0)
        .select<{ itemId: number; itemName: string; tier: number; quantity: number }[]>(
            'i.id as itemId',
            'i.name as itemName',
            'i.tier as tier',
            'pi.quantity as quantity',
        )

    if (def.accepts_subtype) return q.where('i.subtype', def.accepts_subtype)

    if (def.accepts_names) {
        let names: string[] = []
        try { names = JSON.parse(def.accepts_names) } catch { names = [] }
        if (!names.length) return []
        return q.whereIn('i.name', names)
    }
    return []
}

/**
 * Move one item from the pack into a slot. Creates the workstation row on the
 * first socket, so there is no separate "set up your workstation" step: putting
 * the first tool down IS setting it up.
 */
export async function socketTool(
    playerId: number,
    locationId: number,
    stationType: string,
    slot: string,
    itemName: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const def = await db('workstation_slot_types')
            .where({ station_type: stationType, slot })
            .first()
        if (!def) return { success: false, error: 'That station has no such slot.' }

        const existing = await getWorkstation(playerId, locationId, stationType)
        if (isTemporary(existing)) {
            return { success: false, error: 'There is nowhere on a campfire to set that.' }
        }

        const item = await db('items').where({ name: itemName }).first()
        if (!item) return { success: false, error: 'Unknown item.' }

        // Eligibility: subtype first, explicit names as the fallback.
        if (def.accepts_subtype) {
            if (item.subtype !== def.accepts_subtype) {
                return { success: false, error: `A ${itemName} does not fit the ${def.label.toLowerCase()} slot.` }
            }
        } else if (def.accepts_names) {
            let names: string[] = []
            try { names = JSON.parse(def.accepts_names) } catch { names = [] }
            if (!names.includes(itemName)) {
                return { success: false, error: `A ${itemName} does not fit the ${def.label.toLowerCase()} slot.` }
            }
        } else {
            return { success: false, error: 'That slot accepts nothing.' }
        }

        await db.transaction(async trx => {
            let station = await trx('workstations')
                .where({ player_id: playerId, location_id: locationId, type: stationType })
                .forUpdate()
                .first()

            if (!station && BUILT_STATIONS.has(stationType)) {
                throw new Error('NO_STRUCTURE')
            }

            if (!station) {
                const [id] = await trx('workstations')
                    .insert({
                        player_id: playerId,
                        location_id: locationId,
                        type: stationType,
                        tier: item.tier ?? 1,
                        is_active: false,
                    })
                    .returning('id')
                station = { id: typeof id === 'object' ? (id as any).id : id }
            }

            const used = await trx('workstation_slots')
                .where({ workstation_id: station.id, slot })
                .forUpdate()
            if (used.length >= def.capacity) {
                throw new Error(`The ${def.label.toLowerCase()} slot is full.`)
            }

            const taken = await removeItemFromInventoryWithin(trx, playerId, item.id, 1)
            if (!taken) throw new Error(`You do not have a ${itemName}.`)

            const usedIndexes = new Set(used.map((u: any) => u.slot_index))
            let index = 0
            while (usedIndexes.has(index)) index++

            await trx('workstation_slots').insert({
                workstation_id: station.id,
                slot,
                slot_index: index,
                item_name: itemName,
            })

            await refreshActiveWithin(trx, station.id, stationType)
        })

        notifyInventoryChanged(playerId)
        return { success: true }
    } catch (err: any) {
        const msg = String(err?.message ?? err)
        if (msg === 'NO_STRUCTURE') {
            return { success: false, error: 'You have no hearth here to set that beside.' }
        }
        if (msg.includes('slot is full') || msg.includes('You do not have')) {
            return { success: false, error: msg }
        }
        logger.error(`socketTool error: ${err}`)
        return { success: false, error: 'Server error' }
    }
}

/** Take a tool back out. It returns to the pack intact and stacks normally. */
export async function unsocketTool(
    playerId: number,
    locationId: number,
    stationType: string,
    slot: string,
    slotIndex: number,
): Promise<{ success: boolean; error?: string }> {
    try {
        await db.transaction(async trx => {
            const station = await trx('workstations')
                .where({ player_id: playerId, location_id: locationId, type: stationType })
                .forUpdate()
                .first()
            if (!station) throw new Error('You have no workstation here.')

            const row = await trx('workstation_slots')
                .where({ workstation_id: station.id, slot, slot_index: slotIndex })
                .forUpdate()
                .first()
            if (!row) throw new Error('That slot is empty.')

            const item = await trx('items').where({ name: row.item_name }).first()
            if (!item) throw new Error('Unknown item.')

            await trx('workstation_slots').where({ id: row.id }).delete()
            await addItemToInventoryWithin(trx, playerId, item.id, 1)
            await refreshActiveWithin(trx, station.id, stationType)
        })

        notifyInventoryChanged(playerId)
        return { success: true }
    } catch (err: any) {
        const msg = String(err?.message ?? err)
        if (msg.includes('workstation here') || msg.includes('slot is empty')) {
            return { success: false, error: msg }
        }
        logger.error(`unsocketTool error: ${err}`)
        return { success: false, error: 'Server error' }
    }
}

/** is_active stays truthful so older callers reading it keep working. */
async function refreshActiveWithin(trx: any, stationId: number, stationType: string): Promise<void> {
    const required = await trx('workstation_slot_types')
        .where({ station_type: stationType, is_required: true })
        .select('slot')
    const filled = await trx('workstation_slots').where({ workstation_id: stationId }).select('slot')
    const have = new Set(filled.map((f: any) => f.slot))
    const active = required.every((r: any) => have.has(r.slot))
    await trx('workstations').where({ id: stationId }).update({ is_active: active })
}

/**
 * Light a campfire where you stand.
 *
 * Instant, like equipping. Building a bench is a timed job because it is a
 * building; setting light to a bundle of kindling is not.
 *
 * Refused where you already have a real cookhouse, because a campfire there
 * would be strictly worse and the only thing it could do is confuse. Refused
 * on top of a burning one too, so a player cannot stack the timer by lighting
 * a second bundle.
 */
/**
 * Queue a timed action.
 *
 * A local copy: husbandry, farming and shops each carry their own private one,
 * so this follows the house pattern rather than reaching into another service
 * for a helper it does not export.
 */
async function startAction(playerId: number, type: string, seconds: number, data: string | null, locationId: number | null) {
    const now = new Date()
    await db('player_actions').insert({
        player_id: playerId,
        action_type: type,
        action_data: data,
        location_id: locationId,
        started_at: now,
        completes_at: new Date(now.getTime() + seconds * 1000),
        // Set on the initial insert, not only on restarts, or the client has no
        // timer length to render after a refresh.
        last_timer_seconds: seconds,
        auto_restart: false,
        last_bot_check: now,
        bot_check_pending: false,
    })
    return seconds
}

/**
 * Start building a hearth.
 *
 * A timed job, like raising a pen, because it is the same kind of work: stone
 * set in mortar and left to go off. Crafting rather than Carpentry, since
 * Crafting already dresses stone (Cut Granite Block) and this is mostly stone.
 */
export async function startBuildHearth(
    playerId: number,
): Promise<{ ok: boolean; error?: string; timerSeconds?: number }> {
    try {
        const player = await db('players').where({ id: playerId }).first()
        if (!player) return { ok: false, error: 'Server error' }

        const location = await db('locations').where({ id: player.current_location_id }).first()
        if (location?.name !== HEARTH_LOCATION) {
            return { ok: false, error: `A hearth of your own is built at ${HEARTH_LOCATION}.` }
        }

        const existing = await getWorkstation(playerId, player.current_location_id, 'cooking')
        if (existing && !isTemporary(existing)) {
            return { ok: false, error: 'You have a hearth here already.' }
        }

        // player_actions is unique per player, so starting this while something
        // else runs threw a raw constraint violation and surfaced as "Server
        // error". Checked here so the refusal says what is actually wrong.
        const busy = await db('player_actions').where({ player_id: playerId }).first()
        if (busy) {
            return { ok: false, error: 'You are already busy with something else.' }
        }

        // A mallet, not the mallet AND saw that timber work wants. Dressing
        // stone is mallet work; there is no sawing in a hearth.
        if (!(await equippedBuildTool(playerId, BUILD_MALLET.subtype))) {
            return { ok: false, error: `You need a ${BUILD_MALLET.itemName} equipped to build.` }
        }

        for (const need of HEARTH_COST) {
            const item = await db('items').where({ name: need.itemName }).first()
            const held = item ? await db('player_inventory')
                .where({ player_id: playerId, item_id: item.id }).first() : null
            if (!held || held.quantity < need.qty) {
                return { ok: false, error: `You need ${need.qty} ${need.itemName.toLowerCase()}.` }
            }
        }

        await startAction(playerId, 'cooking_build_hearth', HEARTH_BUILD_SECONDS, '', player.current_location_id)
        return { ok: true, timerSeconds: HEARTH_BUILD_SECONDS }
    } catch (err) {
        logger.error(`startBuildHearth error: ${err}`)
        return { ok: false, error: 'Server error' }
    }
}

/** Finish it: take the materials, and the bench exists from here on. */
export async function resolveBuildHearth(playerId: number): Promise<any> {
    try {
        const player = await db('players').where({ id: playerId }).first()
        if (!player) return { success: false, error: 'Server error' }

        await db.transaction(async trx => {
            for (const need of HEARTH_COST) {
                const item = await trx('items').where({ name: need.itemName }).first()
                if (!item) throw new Error('MISSING')
                const taken = await removeItemFromInventoryWithin(trx, playerId, item.id, need.qty)
                if (!taken) throw new Error('MISSING')
            }

            // A campfire at the same spot is replaced: the row is unique per
            // player, location and type, and a stone hearth supersedes it.
            await trx('workstations')
                .where({ player_id: playerId, location_id: player.current_location_id, type: 'cooking' })
                .delete()

            await trx('workstations').insert({
                player_id: playerId,
                location_id: player.current_location_id,
                type: 'cooking',
                tier: 1,
                is_active: true,
            })
        })

        notifyInventoryChanged(playerId)

        const xp = Math.round(1.8 * 1.10 * 2000 * HEARTH_BUILD_SECONDS / 3600)
        await awardCraftingXp(playerId, xp)

        return {
            success: true, xp, skillName: 'Crafting',
            message: 'The last course is set and the flue drawn straight. It is a cold hearth until you light it, and it is yours.',
        }
    } catch (err: any) {
        if (String(err?.message) === 'MISSING') {
            return { success: false, error: 'You are short of materials.' }
        }
        logger.error(`resolveBuildHearth error: ${err}`)
        return { success: false, error: 'Server error' }
    }
}

/**
 * Building a workstation is a Crafting action, and it counted as none: no XP
 * total, no action tallied. The XP write is the shared one in services/xp.ts.
 */
async function awardCraftingXp(playerId: number, xp: number): Promise<void> {
    await awardXp(playerId, 'Crafting', xp)
    await incrementStats(playerId, {
        total_actions_completed: 1,
        total_items_crafted: 1,
    })
}

/**
 * The wood that would go on the fire next, and how much of it is left.
 *
 * Worst first, matching what the refuel actually burns, so the count beside the
 * fire is the count that is about to go down.
 */
export async function nextFuelFor(playerId: number): Promise<{ itemName: string; held: number; cost: number } | null> {
    for (const stack of await burnableLogs(playerId)) {
        const cost = LOG_COST[stack.quality]
        if (cost && stack.quantity >= cost) {
            return { itemName: stack.name, held: stack.quantity, cost }
        }
    }
    return null
}

/** What lighting this log would cost, or null if it is not firewood. */
export async function fuelCostFor(itemName: string): Promise<number | null> {
    const item = await db('items').where({ name: itemName }).first()
    if (!item?.quality) return null
    return LOG_COST[item.quality] ?? null
}

/** A tinderbox in the main hand. Nothing lights without one. */
async function heldTinderbox(playerId: number, trx?: any): Promise<any> {
    const eq = await (trx ?? db)('player_equipment').where({ player_id: playerId }).first()
    if (!eq?.mainhand_item_id) return null
    return (trx ?? db)('items').where({ id: eq.mainhand_item_id, subtype: 'tinderbox' }).first()
}

/**
 * Light a campfire from a stack of logs.
 *
 * Instant. Building a bench is a timed job because it is a building; striking a
 * spark into kindling is not.
 *
 * Refused where a real cookhouse already stands, because a campfire there would
 * be strictly worse, and refused on top of one already burning, so the timer
 * cannot be stacked by lighting a second.
 */
export async function lightCampfire(
    playerId: number,
    locationId: number,
    logName: string,
): Promise<{ ok: boolean; error?: string; secondsLeft?: number; used?: number }> {
    try {
        if (!(await heldTinderbox(playerId))) {
            return { ok: false, error: 'You need a tinderbox in hand to light anything.' }
        }

        const existing = await getWorkstation(playerId, locationId, 'cooking')
        if (existing && !isTemporary(existing)) {
            return { ok: false, error: 'You have a hearth of your own here already.' }
        }
        if (existing) return { ok: false, error: 'Your campfire is still burning.' }

        const log = await db('items').where({ name: logName }).first()
        if (!log?.quality) return { ok: false, error: 'That will not burn.' }
        const cost = LOG_COST[log.quality]
        if (!cost) return { ok: false, error: 'That will not burn.' }

        await db.transaction(async trx => {
            const taken = await removeItemFromInventoryWithin(trx, playerId, log.id, cost)
            if (!taken) throw new Error(`NEED:${cost}`)

            await trx('workstations').insert({
                player_id: playerId,
                location_id: locationId,
                type: 'cooking',
                tier: 1,
                is_active: true,
                expires_at: new Date(Date.now() + CAMPFIRE_SECONDS * 1000),
                fuel_until: new Date(Date.now() + CAMPFIRE_SECONDS * 1000),
            })
        })

        notifyInventoryChanged(playerId)
        return { ok: true, secondsLeft: CAMPFIRE_SECONDS, used: cost }
    } catch (err: any) {
        const m = String(err?.message ?? '')
        if (m.startsWith('NEED:')) {
            const n = m.slice(5)
            return { ok: false, error: `You need ${n} of those to get a fire going.` }
        }
        logger.error(`lightCampfire error: ${err}`)
        return { ok: false, error: 'Server error' }
    }
}

/**
 * Keep a hearth alight, feeding it from the pack if it has gone out.
 *
 * Fuel buys time rather than being spent per dish, so this is one decision at
 * the start of a session instead of a check on every fish. A cook carrying wood
 * never notices it happened.
 *
 * Returns false only when the fire is out AND there is nothing to burn.
 */
async function ensureHearthFuel(
    playerId: number,
    station: any,
    spend = true,
): Promise<'lit' | 'no-wood' | 'no-tinderbox'> {
    if (isTemporary(station)) {
        // A campfire's fuel and its lifetime are the same thing.
        return 'lit'
    }
    const lit = station.fuel_until && new Date(station.fuel_until).getTime() > Date.now()
    if (lit) return 'lit'

    // A read asks "could you cook here", not "is it burning". Answering the
    // second blocked every recipe the moment a fire went out, because the list
    // marked them unavailable and the player could never reach the code that
    // would light one.
    //
    // So a read looks ahead: hold a tinderbox and carry wood you can afford to
    // burn, and the answer is yes. Starting the job lights it for real.
    if (!spend) {
        if (!(await heldTinderbox(playerId))) return 'no-tinderbox'
        for (const stack of await burnableLogs(playerId)) {
            const cost = LOG_COST[stack.quality]
            if (cost && stack.quantity >= cost) return 'lit'
        }
        return 'no-wood'
    }

    // Relighting a cold hearth is lighting a fire, and that wants the same
    // tinderbox a campfire does. Once it is going you may put your hatchet back
    // in your hand and cook all afternoon.
    if (!(await heldTinderbox(playerId))) return 'no-tinderbox'

    let fed = false
    await db.transaction(async trx => {
        // Re-read the row INSIDE the transaction, locked. Two jobs starting at
        // once would otherwise both see a cold hearth and both pay for it.
        const fresh = await trx('workstations').where({ id: station.id }).forUpdate().first()
        if (fresh?.fuel_until && new Date(fresh.fuel_until).getTime() > Date.now()) {
            fed = true
            return
        }

        const logs = await burnableLogs(playerId, trx)
        for (const stack of logs) {
            const cost = LOG_COST[stack.quality]
            if (!cost || stack.quantity < cost) continue
            const taken = await removeItemFromInventoryWithin(trx, playerId, stack.itemId, cost)
            if (!taken) continue
            await trx('workstations').where({ id: station.id }).update({
                fuel_until: new Date(Date.now() + HEARTH_FUEL_SECONDS * 1000),
            })
            fed = true
            break
        }
    })

    if (fed) notifyInventoryChanged(playerId)
    return fed ? 'lit' : 'no-wood'
}

// ── Recipe gating and speed ───────────────────────────────────────

export function parseRequiredTools(recipe: any): string[] {
    if (!recipe?.required_tools) return NO_TOOLS
    try {
        const parsed = JSON.parse(recipe.required_tools)
        return Array.isArray(parsed) ? parsed : NO_TOOLS
    } catch {
        return NO_TOOLS
    }
}

/**
 * A public station is the NPC's: his fire, his tools, at half speed.
 *
 * It permits smelting, and it permits making anything that GOES INTO a
 * workstation. That second part is not a special case list, it is derived: a
 * recipe is allowed here when its output's subtype matches one of this station
 * type's slot subtypes. So the forge lends you an anvil, a hammer and tongs;
 * the workshop lends you a saw, a plane and a sawhorse.
 *
 * Without it the circularity rule (CLAUDE.md section 4) bites: an anvil needs
 * hammer and tongs, a hammer needs anvil and tongs, so a smelting-only public
 * forge means nobody ever makes a first set. It also keeps tool breakage safe
 * to ship later, since a player who breaks their last anvil can always forge
 * another at Emberra.
 */
export async function publicStationAllows(stationType: string, recipe: any): Promise<boolean> {
    // A job needing no tools only needs the bench, and a public bench is a
    // bench. This is what lets a new cook roast fish at Geomima's hearth before
    // owning a single pot, and it is how the tutorial is meant to work: you
    // cook slowly on hers, then build your own to go faster.
    //
    // The earlier rule checked the OUTPUT's subtype against the station's slot
    // subtypes, which is right for a forge lending you an anvil and wrong for
    // everything else. A cooked fish is not a cookhouse tool, so it refused the
    // whole skill.
    if (parseRequiredTools(recipe).length === 0) return true

    const output = recipe?.output_item_name
    if (!output) return true

    const item = await db('items').where({ name: output }).first()
    if (!item?.subtype) return false

    const slot = await db('workstation_slot_types')
        .where({ station_type: stationType, accepts_subtype: item.subtype })
        .first()
    return !!slot
}

export interface StationCheck {
    ok: boolean
    error?: string
    multiplier: number
    missingTools: string[]
    /** True when working at the NPC's bench rather than your own. */
    usingPublic: boolean
}

/**
 * Can this player run this recipe where they stand, and how fast?
 *
 * No station and no tools needed  -> full speed, works anywhere (campfire case).
 * No station but tools needed     -> refused, naming what is missing.
 * Station present                 -> speed from the lowest-tier required tool.
 *
 * The lowest tier is what counts: a gold anvil does not compensate for a
 * rusted hammer.
 */
/**
 * Can this player make this recipe here, and how fast?
 *
 * `spend` decides whether a cold hearth is allowed to BUY fuel. The recipe list
 * annotates every recipe with this, so with spend left on, opening the cookhouse
 * bought a fire once per recipe: seventy-eight concurrent calls, each seeing an
 * unlit hearth, each paying. One player lost 220 logs opening a menu.
 *
 * Reads pass false. Only actually starting a job passes true.
 */
export async function checkStation(playerId: number, recipe: any, spend = true): Promise<StationCheck> {
    const rawNeeded = parseRequiredTools(recipe)

    /**
     * 'hearth' is no longer a socketable tool, it is the bench itself.
     *
     * Eighteen baking recipes still name it, and they should: a cottage loaf
     * wants an oven, not a fire in the open. So it is not matched against a
     * slot (there is none) but it does mean a campfire will not do.
     *
     * Stripping it from the recipes instead would have made every bread
     * campfire-cookable, which is worse than the bug it fixed.
     */
    const needsRealHearth = rawNeeded.includes('hearth')
    const needed = rawNeeded.filter(t => t !== 'hearth')

    if (!recipe.station) {
        return { ok: true, multiplier: 1, missingTools: [], usingPublic: false }
    }

    const player = await db('players').where({ id: playerId }).first()
    if (!player) {
        return { ok: false, error: 'Server error', multiplier: 1, missingTools: [], usingPublic: false }
    }

    // Look for a campfire that has just gone out, BEFORE getWorkstation sweeps
    // it. Without this the player is told they have no workstation here, which
    // is true and unhelpful: they had one thirty seconds ago and it burnt out.
    const burntOut = await db('workstations')
        .where({ player_id: playerId, location_id: player.current_location_id, type: recipe.station })
        .whereNotNull('expires_at')
        .where('expires_at', '<=', new Date())
        .first()
    if (burntOut) {
        await db('workstations').where({ id: burntOut.id }).delete()
        return {
            ok: false,
            error: 'Your campfire burnt out.',
            multiplier: 1,
            missingTools: [],
            usingPublic: false,
        }
    }

    const station = await getWorkstation(playerId, player.current_location_id, recipe.station)
    const socketed = station ? await getSocketed(station.id) : []
    const bySlot = new Map(socketed.map(s => [s.slot, s]))
    const missing = needed.filter(slot => !bySlot.has(slot))

    // A campfire is enough of a fire to cook a fish over and no more. Anything
    // naming a tool is refused outright rather than run slowly, because there
    // is nowhere on a campfire to put a cauldron.
    if (station && isTemporary(station)) {
        if (needsRealHearth) {
            return {
                ok: false,
                error: 'That wants an oven, not a fire in the open.',
                multiplier: 1,
                // Empty on purpose: there is no tool to go and fetch, so the
                // card shows this sentence rather than "Needs Hearth".
                missingTools: [],
                usingPublic: false,
            }
        }
        if (needed.length > 0) {
            return {
                ok: false,
                error: 'A campfire will not do for that. You need a proper hearth.',
                multiplier: 1,
                missingTools: needed,
                usingPublic: false,
            }
        }
        return { ok: true, multiplier: CAMPFIRE_MULTIPLIER, missingTools: [], usingPublic: false }
    }

    // 1. Your own bench, carrying what this job needs.
    if (station && missing.length === 0) {
        // A cold hearth cooks nothing. Refuelled from the pack if it can be,
        // so this only ever refuses a cook who has run out of wood.
        if (recipe.station === 'cooking') {
            const fire = await ensureHearthFuel(playerId, station, spend)
            if (fire !== 'lit') {
                return {
                    ok: false,
                    error: fire === 'no-tinderbox'
                        ? 'Your hearth has gone cold, and you have nothing to strike a spark with.'
                        : 'Your hearth has gone cold. You have no wood to feed it.',
                    multiplier: 1,
                    missingTools: [],
                    usingPublic: false,
                }
            }
        }
        if (needed.length === 0) {
            return { ok: true, multiplier: 1, missingTools: [], usingPublic: false }
        }
        const actionTier = tierOfLevel(recipe.required_level ?? 1)
        const lowestToolTier = Math.min(...needed.map(slot => bySlot.get(slot)!.tier ?? 1))
        const mult = tierMultiplier(lowestToolTier, actionTier)
        if (mult === null) {
            return {
                ok: false,
                error: 'Your tools are far too crude for that.',
                multiplier: 1,
                missingTools: [],
                usingPublic: false,
            }
        }
        return { ok: true, multiplier: mult, missingTools: [], usingPublic: false }
    }

    // 2. Fall back to the public bench, if this location has one and it covers
    //    this recipe. Half speed, his tools. An incomplete bench of your own is
    //    not "slow", it simply is not used.
    const hasPublic = await locationHasPublicStation(playerId, player.current_location_id, recipe.station)
    if (hasPublic && await publicStationAllows(recipe.station, recipe)) {
        return { ok: true, multiplier: 2, missingTools: [], usingPublic: true }
    }

    // 3. Nothing here can do it.
    if (station && missing.length) {
        const labels = await db('workstation_slot_types')
            .where({ station_type: recipe.station })
            .whereIn('slot', missing)
            .select('label')
        const names = labels.map((l: any) => l.label.toLowerCase())
        return {
            ok: false,
            error: `Your workstation is missing: ${names.join(', ')}.`,
            multiplier: 1,
            missingTools: missing,
            usingPublic: false,
        }
    }
    // No bench of your own, and either no public one here or you have not been
    // granted it. Say which: "you need your own workstation" is misleading when
    // the truth is you never asked the smith.
    const stationLabel = recipe.station === 'cooking' ? 'hearth'
        : recipe.station === 'smithing' ? 'forge'
        : recipe.station === 'carpentry' ? 'workshop'
        : 'workstation'
    const owner = PUBLIC_STATIONS[recipe.station]
    if (owner) {
        // Two different problems wear the same shape here, and telling them
        // apart is the whole point: either you have never been offered the
        // keeper's bench, or you have it and it simply will not do this job.
        const error = hasPublic
            ? `${owner.keeper} will not lend those tools for that. You need a ${stationLabel} of your own.`
            : `Speak to ${owner.keeper} for the use of the ${stationLabel} here.`
        return { ok: false, error, multiplier: 1, missingTools: needed, usingPublic: false }
    }
    return {
        ok: false,
        error: `You need your own ${stationLabel} here for that.`,
        multiplier: 1,
        missingTools: needed,
        usingPublic: false,
    }
}

/**
 * Does this location offer a public bench of this type?
 *
 * Emberra's forge and Verdale's workshop are gated behind their tutorial
 * quests, so "is there one here" also means "have you been given the run of
 * it". Kept as one function so a second island can add public benches by
 * adding rows rather than by editing this.
 */
const PUBLIC_STATIONS: Record<string, { location: string; quest: string; keeper: string }> = {
    smithing: { location: 'Emberra', quest: "The Blacksmith's Bargain", keeper: 'Geoffrey' },
    carpentry: { location: 'Verdale', quest: "The Carpenter's Commission", keeper: 'Geossica' },
    cooking: { location: 'Phoenwick', quest: "The Cook's Conundrum", keeper: 'Geomima' },
}

export async function locationHasPublicStation(playerId: number, locationId: number, stationType: string): Promise<boolean> {
    const def = PUBLIC_STATIONS[stationType]
    if (!def) return false

    const location = await db('locations').where({ id: locationId }).first()
    if (!location || location.name !== def.location) return false

    const quest = await db('quests').where({ name: def.quest }).first()
    if (!quest) return true // no quest row means the bench is simply open

    const playerQuestOpen = await db('player_quests')
        .where({ player_id: playerId, quest_id: quest.id })
        .whereIn('status', ['active', 'completed'])
        .first()
    return !!playerQuestOpen
}

/** Effective timer for a recipe, station and tool tier included. */
export async function recipeTimerWithTools(playerId: number, recipe: any): Promise<number> {
    // A timer calculation, not a decision to cook. Never buys fuel.
    const check = await checkStation(playerId, recipe, false)
    return Math.max(1, Math.round(recipe.timer_seconds * check.multiplier))
}
