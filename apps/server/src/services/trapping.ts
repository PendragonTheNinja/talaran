import db from '../db'
import { levelFromXp } from './xp'
import { logger } from '../lib/logger'

// ── Trapping (docs/trapping-spec.md) ──────────────────────────────
// Passive hunting mode. Traps are independent of player_actions: they run
// while the player does anything else. Placement is gated by Hunting level;
// the tick sweep (processTrapTicks) rolls catches and scavenger events.
// States: 'set' → 'sprung' → ('scavenged' if neglected) → collected.

// Slot count by Hunting level: +1 per gathering-tier boundary, capped at 4.
const SLOT_THRESHOLDS: { level: number; slots: number }[] = [
    { level: 37, slots: 4 },
    { level: 25, slots: 3 },
    { level: 12, slots: 2 },
    { level: 1, slots: 1 },
]

export function trapSlotsForLevel(level: number): number {
    for (const t of SLOT_THRESHOLDS) if (level >= t.level) return t.slots
    return 0
}

interface TrapDropEntry { itemName: string; min: number; max: number; chance: number; notable?: boolean; perishable?: boolean }

/** Roll a catch's drop table. Scavenged catches lose their perishable entries. */
export function rollTrapDrops(dropTableJson: string, scavenged: boolean): { itemName: string; quantity: number; notable: boolean }[] {
    let table: TrapDropEntry[]
    try { table = JSON.parse(dropTableJson) } catch { return [] }
    const drops: { itemName: string; quantity: number; notable: boolean }[] = []
    for (const d of table) {
        if (scavenged && d.perishable) continue
        if (Math.random() * 100 < d.chance) {
            const qty = d.min + Math.floor(Math.random() * (d.max - d.min + 1))
            if (qty > 0) drops.push({ itemName: d.itemName, quantity: qty, notable: d.notable === true })
        }
    }
    return drops
}

async function huntingLevel(playerId: number): Promise<number> {
    const skill = await db('skills').where({ name: 'Hunting' }).first()
    if (!skill) return 1
    const ps = await db('player_skills').where({ player_id: playerId, skill_id: skill.id }).first()
    return ps ? levelFromXp(parseInt(ps.xp)) : 1
}

/** Weighted pick from the location's catch pool. */
function pickTarget(targets: { id: number; weight: number }[]): number | null {
    const total = targets.reduce((s, t) => s + t.weight, 0)
    if (total <= 0) return null
    let roll = Math.random() * total
    for (const t of targets) {
        roll -= t.weight
        if (roll < 0) return t.id
    }
    return targets[targets.length - 1].id
}

export async function canPlaceTrap(playerId: number, trapTypeId: number, locationId: number): Promise<{ allowed: boolean; reason?: string }> {
    const trapType = await db('trap_types').where({ id: trapTypeId, is_active: true }).first()
    if (!trapType) return { allowed: false, reason: 'That trap cannot be placed.' }

    const level = await huntingLevel(playerId)
    if (level < trapType.required_level) {
        return { allowed: false, reason: `You need Hunting level ${trapType.required_level} to place a ${trapType.name}.` }
    }

    const slots = trapSlotsForLevel(level)
    const placedRow = await db('player_traps').where({ player_id: playerId }).count('id as count').first()
    const placed = placedRow ? parseInt(String(placedRow.count)) : 0
    if (placed >= slots) {
        return { allowed: false, reason: `All your trap slots are in use (${placed}/${slots}).` }
    }

    const item = await db('items').where({ name: trapType.item_name }).first()
    const inv = item
        ? await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first()
        : null
    if (!inv || inv.quantity < 1) {
        return { allowed: false, reason: `You need a ${trapType.item_name} in your inventory.` }
    }

    const targets = await db('trap_targets')
        .where({ location_id: locationId, is_active: true })
        .where(function () { this.where({ trap_type_id: trapTypeId }).orWhereNull('trap_type_id') })
    if (targets.length === 0) return { allowed: false, reason: 'There is nothing to trap here.' }

    return { allowed: true }
}

/** Place a trap: consumes the trap item, creates the row. Transactional. */
export async function placeTrap(playerId: number, trapTypeId: number, locationId: number): Promise<{ success: boolean; error?: string }> {
    try {
        const check = await canPlaceTrap(playerId, trapTypeId, locationId)
        if (!check.allowed) return { success: false, error: check.reason }

        const trapType = await db('trap_types').where({ id: trapTypeId }).first()
        const item = await db('items').where({ name: trapType.item_name }).first()

        await db.transaction(async (trx) => {
            const inv = await trx('player_inventory')
                .where({ player_id: playerId, item_id: item.id }).forUpdate().first()
            if (!inv || inv.quantity < 1) throw new Error('NO_TRAP_ITEM')
            if (inv.quantity === 1) {
                await trx('player_inventory').where({ id: inv.id }).delete()
            } else {
                await trx('player_inventory').where({ id: inv.id }).update({ quantity: inv.quantity - 1 })
            }

            const now = new Date()
            await trx('player_traps').insert({
                player_id: playerId,
                trap_type_id: trapTypeId,
                location_id: locationId,
                state: 'set',
                next_roll_at: new Date(now.getTime() + trapType.roll_interval_seconds * 1000),
                placed_at: now,
            })
        })

        return { success: true }
    } catch (err: any) {
        if (err.message === 'NO_TRAP_ITEM') return { success: false, error: 'You need that trap in your inventory.' }
        logger.error('placeTrap error: ' + err)
        return { success: false, error: 'Server error' }
    }
}

/** Collect a sprung trap: the reveal. Rolls drops, awards XP, rolls break chance. Transactional + row-locked (no double-collect). */
export async function collectTrap(playerId: number, trapId: number): Promise<{
    success: boolean
    error?: string
    species?: string
    xpAwarded?: number
    drops?: { itemName: string; quantity: number; notable: boolean }[]
    broke?: boolean
    scavenged?: boolean
}> {
    try {
        let result: any = null

        await db.transaction(async (trx) => {
            const trap = await trx('player_traps')
                .where({ id: trapId, player_id: playerId }).forUpdate().first()
            if (!trap) throw new Error('NOT_YOURS')
            if (trap.state === 'set') throw new Error('NOTHING_CAUGHT')

            const target = await trx('trap_targets').where({ id: trap.caught_target_id }).first()
            const trapType = await trx('trap_types').where({ id: trap.trap_type_id }).first()
            if (!target || !trapType) {
                // Content was removed out from under a live catch: reset the trap quietly.
                await trx('player_traps').where({ id: trap.id }).update({
                    state: 'set', caught_target_id: null, caught_at: null, last_scavenge_check: null,
                    next_roll_at: new Date(Date.now() + (trapType?.roll_interval_seconds ?? 1800) * 1000),
                })
                throw new Error('NOTHING_CAUGHT')
            }

            const scavenged = trap.state === 'scavenged'
            const drops = rollTrapDrops(target.drop_table, scavenged)

            for (const d of drops) {
                const item = await trx('items').where({ name: d.itemName }).first()
                if (!item) continue
                const existing = await trx('player_inventory')
                    .where({ player_id: playerId, item_id: item.id }).first()
                if (existing) {
                    await trx('player_inventory').where({ id: existing.id }).increment('quantity', d.quantity)
                } else {
                    await trx('player_inventory').insert({ player_id: playerId, item_id: item.id, quantity: d.quantity })
                }
            }

            const huntingSkill = await trx('skills').where({ name: 'Hunting' }).first()
            if (huntingSkill) {
                await trx('player_skills')
                    .where({ player_id: playerId, skill_id: huntingSkill.id })
                    .increment('xp', target.xp)
            }

            const broke = Math.random() * 100 < trapType.break_chance
            if (broke) {
                await trx('player_traps').where({ id: trap.id }).delete()
            } else {
                await trx('player_traps').where({ id: trap.id }).update({
                    state: 'set', caught_target_id: null, caught_at: null, last_scavenge_check: null,
                    next_roll_at: new Date(Date.now() + trapType.roll_interval_seconds * 1000),
                })
            }

            result = { success: true, species: target.name, xpAwarded: target.xp, drops, broke, scavenged }
        })

        return result
    } catch (err: any) {
        if (err.message === 'NOT_YOURS') return { success: false, error: 'That trap is not yours to check.' }
        if (err.message === 'NOTHING_CAUGHT') return { success: false, error: 'Nothing has been caught yet.' }
        logger.error('collectTrap error: ' + err)
        return { success: false, error: 'Server error' }
    }
}

/** Dismantle a set (empty) trap: returns the trap item. Sprung traps must be collected first. */
export async function dismantleTrap(playerId: number, trapId: number): Promise<{ success: boolean; error?: string; itemName?: string }> {
    try {
        let itemName = ''
        await db.transaction(async (trx) => {
            const trap = await trx('player_traps')
                .where({ id: trapId, player_id: playerId }).forUpdate().first()
            if (!trap) throw new Error('NOT_YOURS')
            if (trap.state !== 'set') throw new Error('COLLECT_FIRST')

            const trapType = await trx('trap_types').where({ id: trap.trap_type_id }).first()
            const item = await trx('items').where({ name: trapType.item_name }).first()
            if (item) {
                const existing = await trx('player_inventory')
                    .where({ player_id: playerId, item_id: item.id }).first()
                if (existing) {
                    await trx('player_inventory').where({ id: existing.id }).increment('quantity', 1)
                } else {
                    await trx('player_inventory').insert({ player_id: playerId, item_id: item.id, quantity: 1 })
                }
            }
            itemName = trapType.item_name
            await trx('player_traps').where({ id: trap.id }).delete()
        })
        return { success: true, itemName }
    } catch (err: any) {
        if (err.message === 'NOT_YOURS') return { success: false, error: 'That trap is not yours.' }
        if (err.message === 'COLLECT_FIRST') return { success: false, error: 'Collect the catch before dismantling.' }
        logger.error('dismantleTrap error: ' + err)
        return { success: false, error: 'Server error' }
    }
}

/** The player's traps at a location. Species of a sprung trap is NEVER exposed — the reveal happens at collect. */
export async function getPlayerTraps(playerId: number, locationId: number) {
    const traps = await db('player_traps')
        .join('trap_types', 'player_traps.trap_type_id', 'trap_types.id')
        .where({ 'player_traps.player_id': playerId, 'player_traps.location_id': locationId })
        .select('player_traps.id', 'trap_types.name as trapName', 'player_traps.state', 'player_traps.placed_at')
    return traps.map((t: any) => ({
        id: t.id,
        trapName: t.trapName,
        sprung: t.state !== 'set',   // 'sprung' and 'scavenged' both read as "something's caught!"
        placedAt: t.placed_at,
    }))
}

/**
 * Tick sweep: roll catches on due traps (with offline catch-up) and age
 * sprung traps toward scavenging. Returns sprung events for the caller to emit.
 */
export async function processTrapTicks(now: Date): Promise<{ sprung: { playerId: number; trapId: number }[] }> {
    const sprungEvents: { playerId: number; trapId: number }[] = []
    try {
        const types = await db('trap_types')
        const typeById = new Map<number, any>(types.map((t: any) => [t.id, t]))

        // ── Catch rolls ──
        const due = await db('player_traps').where('state', 'set').where('next_roll_at', '<=', now)
        for (const trap of due) {
            const type = typeById.get(trap.trap_type_id)
            if (!type) continue
            const targets = await db('trap_targets')
                .where({ location_id: trap.location_id, is_active: true })
                .where(function () { this.where({ trap_type_id: trap.trap_type_id }).orWhereNull('trap_type_id') })
            if (targets.length === 0) continue

            const intervalMs = type.roll_interval_seconds * 1000
            let rollAt = new Date(trap.next_roll_at).getTime()
            let caughtTargetId: number | null = null
            let caughtAt: Date | null = null

            // Offline catch-up: one roll per elapsed interval until a catch or we're current
            while (rollAt <= now.getTime()) {
                if (Math.random() * 100 < type.catch_chance) {
                    caughtTargetId = pickTarget(targets)
                    caughtAt = new Date(rollAt)
                    break
                }
                rollAt += intervalMs
            }

            if (caughtTargetId) {
                await db('player_traps').where({ id: trap.id }).update({
                    state: 'sprung', caught_target_id: caughtTargetId, caught_at: caughtAt,
                })
                sprungEvents.push({ playerId: trap.player_id, trapId: trap.id })
            } else {
                await db('player_traps').where({ id: trap.id }).update({ next_roll_at: new Date(rollAt) })
            }
        }

        // ── Scavenger aging ──
        const sprung = await db('player_traps').where('state', 'sprung')
        for (const trap of sprung) {
            const type = typeById.get(trap.trap_type_id)
            if (!type) continue
            const safeUntil = new Date(trap.caught_at).getTime() + type.scavenger_safe_hours * 3600000
            const checkFrom = trap.last_scavenge_check
                ? new Date(trap.last_scavenge_check).getTime()
                : safeUntil
            const pendingHours = Math.floor((now.getTime() - checkFrom) / 3600000)
            if (pendingHours <= 0) continue

            let scavenged = false
            for (let i = 0; i < pendingHours; i++) {
                if (Math.random() * 100 < type.scavenger_hourly_chance) { scavenged = true; break }
            }
            await db('player_traps').where({ id: trap.id }).update({
                state: scavenged ? 'scavenged' : 'sprung',
                last_scavenge_check: new Date(checkFrom + pendingHours * 3600000),
            })
        }
    } catch (err) {
        logger.error('processTrapTicks error: ' + err)
    }
    return { sprung: sprungEvents }
}