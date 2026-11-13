import db from '../db'
import { logger } from '../lib/logger'
import { SERVER_ERROR } from '../lib/serviceResult'
import { takeItemsWithin, notifyInventoryChanged } from './inventory'
import { awardXp } from './xp'
import { incrementStats } from './stats'

// Opening things (migration 20261113100000_containers): a Bird Nest, a River
// Mussel. One at a time on a short timer, through the stack, as a processing
// job runs ('container_open' in services/gameTick.ts). Each opening:
//   - takes one from the pack and pays the row's XP, in one transaction;
//   - then, once that has committed, rolls what is inside (drop_table_entries
//     under 'open:<item name>', through rollSecondaryDrops) and any coins.
// The contents roll after the commit, as a kill's drops do: they are adds
// (atomic upserts) and a credit, and nothing can be taken twice because the
// container was taken first.

/** What a container holds this rarely or rarer sparkles and is told (1 in 50: Rough Quartz in a nest). */
const NOTABLE_ONE_IN = 50

export interface ContainerType {
    id: number
    item_id: number
    item_name: string
    key: string
    skill: string
    timer_seconds: number
    xp: number
    coin_one_in: number | null
    coin_min: number | null
    coin_max: number | null
    empty_text: string | null
}

/** The container row for an item, if the item can be opened. */
export async function containerFor(itemId: number): Promise<ContainerType | null> {
    const row = await db('container_types as c').join('items as i', 'i.id', 'c.item_id')
        .where({ 'c.item_id': itemId, 'c.is_active': true })
        .first('c.*', 'i.name as item_name')
    return row ?? null
}

/** Item ids that can be opened, for the pack (routes/inventory.ts). */
export async function openableItemIds(): Promise<Set<number>> {
    const rows = await db('container_types').where({ is_active: true }).select('item_id')
    return new Set(rows.map((r: any) => Number(r.item_id)))
}

async function held(playerId: number, itemId: number): Promise<number> {
    const row = await db('player_inventory').where({ player_id: playerId, item_id: itemId }).first('quantity')
    return Number(row?.quantity ?? 0)
}

/** Start opening a stack. The one-action-per-player index is the real gate (pg 23505). */
export async function startOpening(playerId: number, itemIdRaw: unknown): Promise<
    | { ok: true; timerSeconds: number; completesAt: Date; kind: string; itemName: string }
    | { ok: false; status: number; error: string }
> {
    const itemId = Math.floor(Number(itemIdRaw))
    if (!Number.isFinite(itemId) || itemId <= 0) return { ok: false, status: 400, error: 'Open what?' }
    const c = await containerFor(itemId)
    if (!c) return { ok: false, status: 400, error: 'That will not open.' }
    if ((await held(playerId, itemId)) < 1) return { ok: false, status: 400, error: `You have no ${c.item_name} to open.` }
    if (await db('player_actions').where({ player_id: playerId }).first('id')) {
        return { ok: false, status: 409, error: 'You are already performing an action' }
    }
    const player = await db('players').where({ id: playerId }).first('current_location_id')
    const now = new Date()
    const completesAt = new Date(now.getTime() + c.timer_seconds * 1000)
    try {
        await db('player_actions').insert({
            player_id: playerId,
            action_type: 'container_open',
            action_data: String(itemId),
            location_id: player?.current_location_id ?? null,
            started_at: now,
            completes_at: completesAt,
            last_timer_seconds: c.timer_seconds,
            auto_restart: true,
            last_bot_check: now,
            bot_check_pending: false,
        })
    } catch (err: any) {
        if (err?.code === '23505') return { ok: false, status: 409, error: 'You are already performing an action' }
        throw err
    }
    return { ok: true, timerSeconds: c.timer_seconds, completesAt, kind: c.key, itemName: c.item_name }
}

export interface OpenResult {
    success: boolean
    error?: string
    xp?: number
    skillName?: string
    message?: string
    drops?: { name: string; quantity: number; notable?: boolean; firstEver?: boolean }[]
    /** How many are left to open. */
    left?: number
    timerSeconds?: number
    kind?: string
}

/** Open one. Never throws: a fault is a SERVER_ERROR result. */
export async function resolveOpen(playerId: number, itemIdRaw: string | null): Promise<OpenResult> {
    try {
        const itemId = parseInt(itemIdRaw ?? '')
        const c = itemId ? await containerFor(itemId) : null
        if (!c) return { success: false, error: 'That will not open.' }

        const taken = await db.transaction(async trx => {
            const took = await takeItemsWithin(trx, playerId, [{ name: c.item_name, quantity: 1 }])
            if (!took.ok) return false
            await awardXp(playerId, c.skill, c.xp, trx)
            await incrementStats(playerId, { total_actions_completed: 1 }, trx)
            return true
        })
        if (!taken) return { success: false, error: `You have no ${c.item_name} left to open.` }

        const { rollSecondaryDrops } = await import('./drops')
        const drops: OpenResult['drops'] = await rollSecondaryDrops(playerId, `open:${c.item_name}`, c.skill)
        // A sparkle, and a line for the Chronicle, only for what is truly
        // rare in a container (NOTABLE_ONE_IN): seeds and feathers are what
        // nests are for, not news.
        const rare = new Set((await db('drop_table_entries as e').join('items as i', 'i.id', 'e.item_id')
            .where({ 'e.source_key': `open:${c.item_name}`, 'e.is_active': true }).where('e.chance_one_in', '>=', NOTABLE_ONE_IN)
            .pluck('i.name')) as string[])
        for (const d of drops) d.notable = rare.has(d.name)
        if (c.coin_one_in && c.coin_min && Math.random() * c.coin_one_in < 1) {
            const amount = c.coin_min + Math.floor(Math.random() * (Math.max(c.coin_min, c.coin_max ?? c.coin_min) - c.coin_min + 1))
            const { creditGold } = await import('./gold')
            const { GOLD_DROP_NAME } = await import('./goldFinds')
            await creditGold({ playerId, amount, reason: 'container_coins', refType: 'action', refId: null })
            drops.push({ name: GOLD_DROP_NAME, quantity: amount, notable: true })
        }
        notifyInventoryChanged(playerId)

        const listed = drops.map(d => `${d.quantity > 1 ? `${d.quantity} ` : ''}${d.name}`)
        const message = drops.length
            ? `Inside the ${c.item_name.toLowerCase()}: ${listed.length > 1 ? `${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1]}` : listed[0]}.`
            : (c.empty_text ?? 'Nothing inside.')
        return {
            success: true, xp: c.xp, skillName: c.skill, message, drops,
            left: await held(playerId, itemId), timerSeconds: c.timer_seconds, kind: c.key,
        }
    } catch (err) {
        logger.error(`resolveOpen error (player ${playerId}, ${itemIdRaw}): ${err}`)
        return { success: false, error: SERVER_ERROR }
    }
}
