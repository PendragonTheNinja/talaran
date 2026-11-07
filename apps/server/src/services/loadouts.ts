import type { Knex } from 'knex'
import db from '../db'
import { logger } from '../lib/logger'
import { readText } from '../lib/textLimits'
import { SERVER_ERROR } from '../lib/serviceResult'
import { VALID_SLOTS, ensureEquipmentRow, equipLevelRefusal, wearFromPackWithin } from './equipment'

// ── Loadouts (Nathan, 2026-11-07) ───────────────────────────────────────────
// A few named snapshots of what a player wears. Saving copies every worn slot;
// wearing puts each saved piece back on from the pack through
// wearFromPackWithin, the equip button's own swap, so the same locks hold
// (equipment row first, then the pack) and nothing can be doubled or lost.
// Whatever is not in the pack, or is above the player's level now, is named
// in the reply and skipped; the rest still goes on.

export const LOADOUTS_MAX = 5
export const LOADOUT_NAME_MAX = 30

class LoadoutRefusal extends Error {}
type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

function fail(err: unknown, what: string): { ok: false; error: string } {
    if (err instanceof LoadoutRefusal) return { ok: false, error: err.message }
    logger.error(`loadouts ${what}: ${err}`)
    return { ok: false, error: SERVER_ERROR }
}

export interface LoadoutPiece { slot: string; itemId: number; name: string }
export interface Loadout { id: number; name: string; pieces: LoadoutPiece[] }

function slotsOf(raw: unknown): Record<string, number> {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {})
    const out: Record<string, number> = {}
    for (const slot of VALID_SLOTS) if (Number.isInteger(obj[slot])) out[slot] = obj[slot]
    return out
}

async function shape(rows: any[], x: Knex | Knex.Transaction = db): Promise<Loadout[]> {
    const ids = [...new Set(rows.flatMap(r => Object.values(slotsOf(r.slots))))]
    const names = new Map<number, string>()
    if (ids.length) for (const i of await x('items').whereIn('id', ids).select('id', 'name')) names.set(Number(i.id), i.name)
    return rows.map(r => ({
        id: Number(r.id),
        name: r.name,
        pieces: VALID_SLOTS.filter(s => slotsOf(r.slots)[s] !== undefined)
            .map(s => ({ slot: s, itemId: slotsOf(r.slots)[s], name: names.get(slotsOf(r.slots)[s]) ?? 'Unknown item' })),
    }))
}

export async function listLoadouts(playerId: number): Promise<Loadout[]> {
    return shape(await db('player_loadouts').where({ player_id: playerId }).orderBy('id', 'asc'))
}

function readName(raw: unknown): string {
    const r = readText(raw, { label: 'A loadout name', max: LOADOUT_NAME_MAX, singleLine: true })
    if (!r.ok) throw new LoadoutRefusal(r.error)
    return r.value!
}

/** What the player wears now, as a slots map. */
async function wornNow(playerId: number, x: Knex | Knex.Transaction): Promise<Record<string, number>> {
    const eq = await x('player_equipment').where({ player_id: playerId }).first()
    const out: Record<string, number> = {}
    for (const slot of VALID_SLOTS) {
        const id = eq?.[`${slot}_item_id`]
        if (id) out[slot] = Number(id)
    }
    return out
}

/** Saves what is worn now as a new loadout. */
export async function saveLoadout(playerId: number, nameRaw: unknown): Promise<Result<{ loadouts: Loadout[] }>> {
    try {
        const name = readName(nameRaw)
        await db.transaction(async (trx) => {
            // The player row first, so two saves at once cannot both pass the count.
            await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id')
            const [{ n }] = await trx('player_loadouts').where({ player_id: playerId }).count({ n: '*' })
            if (Number(n) >= LOADOUTS_MAX) throw new LoadoutRefusal(`You can keep ${LOADOUTS_MAX} loadouts. Delete one to make room.`)
            const slots = await wornNow(playerId, trx)
            if (!Object.keys(slots).length) throw new LoadoutRefusal('You are not wearing anything to save.')
            const [row] = await trx('player_loadouts').insert({ player_id: playerId, name, slots: JSON.stringify(slots) })
                .onConflict(['player_id', 'name']).ignore().returning('id')
            if (!row) throw new LoadoutRefusal('You already have a loadout by that name.')
        })
        return { ok: true, loadouts: await listLoadouts(playerId) }
    } catch (err) {
        return fail(err, 'save')
    }
}

/** Replaces a loadout's pieces with what is worn now, and optionally renames it. */
export async function updateLoadout(playerId: number, idRaw: unknown, input: any): Promise<Result<{ loadouts: Loadout[] }>> {
    try {
        const id = Math.floor(Number(idRaw))
        const patch: Record<string, unknown> = { updated_at: db.fn.now() }
        if (input?.name !== undefined) patch.name = readName(input.name)
        if (input?.resnapshot) {
            const slots = await wornNow(playerId, db)
            if (!Object.keys(slots).length) throw new LoadoutRefusal('You are not wearing anything to save.')
            patch.slots = JSON.stringify(slots)
        }
        const n = Number.isFinite(id) ? await db('player_loadouts').where({ id, player_id: playerId }).update(patch)
            .catch((e: any) => { if (e?.code === '23505') throw new LoadoutRefusal('You already have a loadout by that name.'); throw e }) : 0
        if (!n) throw new LoadoutRefusal('There is no such loadout.')
        return { ok: true, loadouts: await listLoadouts(playerId) }
    } catch (err) {
        return fail(err, 'update')
    }
}

export async function deleteLoadout(playerId: number, idRaw: unknown): Promise<Result<{ loadouts: Loadout[] }>> {
    try {
        const id = Math.floor(Number(idRaw))
        const n = Number.isFinite(id) ? await db('player_loadouts').where({ id, player_id: playerId }).delete() : 0
        if (!n) throw new LoadoutRefusal('There is no such loadout.')
        return { ok: true, loadouts: await listLoadouts(playerId) }
    } catch (err) {
        return fail(err, 'delete')
    }
}

export interface WearReport {
    worn: string[]
    alreadyOn: string[]
    missing: string[]
    refused: { name: string; reason: string }[]
}

/**
 * Puts a loadout on, from the pack, in one transaction. The main hand goes
 * first, so a one-hander and a shield both land, and the offhand after it.
 */
export async function wearLoadout(playerId: number, idRaw: unknown): Promise<Result<{ report: WearReport }>> {
    try {
        const id = Math.floor(Number(idRaw))
        const row = Number.isFinite(id) ? await db('player_loadouts').where({ id, player_id: playerId }).first() : null
        if (!row) throw new LoadoutRefusal('There is no such loadout.')
        const slots = slotsOf(row.slots)
        const order = (s: string) => (s === 'mainhand' ? 0 : s === 'offhand' ? 1 : 2)
        await ensureEquipmentRow(playerId)
        const report: WearReport = { worn: [], alreadyOn: [], missing: [], refused: [] }
        await db.transaction(async (trx) => {
            // Equipment first, as every equip does (services/equipment.ts).
            await trx('player_equipment').where({ player_id: playerId }).forUpdate().first()
            for (const slot of Object.keys(slots).sort((a, b) => order(a) - order(b))) {
                const item = await trx('items').where({ id: slots[slot] }).first()
                if (!item || item.slot !== slot) { report.missing.push(item?.name ?? 'An item that no longer exists'); continue }
                const refusal = await equipLevelRefusal(playerId, item, trx)
                if (refusal) { report.refused.push({ name: item.name, reason: refusal }); continue }
                const worn = await wearFromPackWithin(trx, playerId, item)
                if (worn.status === 'missing') report.missing.push(item.name)
                else if (worn.status === 'unchanged') report.alreadyOn.push(item.name)
                else report.worn.push(item.name)
            }
        })
        return { ok: true, report }
    } catch (err) {
        return fail(err, 'wear')
    }
}
