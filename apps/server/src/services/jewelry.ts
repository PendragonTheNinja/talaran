import type { Knex } from 'knex'
import db from '../db'
import { afterCommit } from '../lib/afterCommit'
import { aidStrength, DRAW_HUNDREDTHS, type JewelryAid } from '../lib/jewelry'
import { spendTalarWithin } from './talar'

// Jewelry (docs/talar-spec.md §8): the one place that decides whether a worn
// piece helps an action. Each system asks here at its one decision point
// (jewelryAid); no system reads finger_item_id or neck_item_id itself.
//
// A piece draws on its wearer's reservoir for EVERY action it helps with, not
// only when its chance comes up, so the cost is steady and predictable. The
// help is given only if the draw succeeds: an empty reservoir means no draw and
// no help, never a debt. The draw runs in the caller's transaction where there
// is one, else in its own.

export interface JewelryHelp {
    /** The piece's name, for the line that says what it did. */
    name: string
    /** How much it helps (lib/jewelry.ts). */
    strength: number
}

const WORN_COLUMNS = ['finger_item_id', 'neck_item_id']

function inTransaction(x: Knex | Knex.Transaction): x is Knex.Transaction {
    return !!(x as Knex.Transaction).isTransaction
}

/**
 * The worn piece that helps with `aid`, having drawn its Talar, or null when
 * none is worn or the reservoir is too low to pay. The caller rolls the chance
 * with the returned strength. `actions` draws for several helped actions at
 * once (a walk's minutes of road): all of them or, when short, none.
 */
export async function jewelryAid(x: Knex | Knex.Transaction, playerId: number, aid: JewelryAid, actions = 1): Promise<JewelryHelp | null> {
    const worn = await x('player_equipment').where({ player_id: playerId }).first(...WORN_COLUMNS)
    const ids = WORN_COLUMNS.map(c => worn?.[c]).filter((id): id is number => !!id)
    if (!ids.length) return null
    const piece = await x('items').whereIn('id', ids).where({ jewelry_aid: aid }).first('name', 'tier')
    if (!piece) return null

    const draw = DRAW_HUNDREDTHS * Math.max(1, Math.floor(actions))
    const paid = inTransaction(x)
        ? await spendTalarWithin(x, playerId, draw)
        : await db.transaction(trx => spendTalarWithin(trx, playerId, draw))
    if (!paid) return null
    return { name: piece.name, strength: aidStrength(aid, Number(piece.tier) || 1) }
}

// ── What the result card is told ──────────────────────────────────────────
//
// A piece that does something says so (Nathan, 2026-10-28: "announce saves"),
// on the card of the action it helped. Noted once the work commits, taken by
// the tick's one emit point (emitActionComplete), the same way a world event's
// bonus reaches the card. Short-lived, so a line never lands on a later card.

const NOTE_TTL_MS = 60_000
const notes = new Map<number, { lines: string[]; at: number }>()

export function noteJewelry(x: Knex | Knex.Transaction, playerId: number, line: string): void {
    afterCommit(x, () => {
        const prev = notes.get(playerId)
        const fresh = prev && Date.now() - prev.at < NOTE_TTL_MS
        notes.set(playerId, { lines: [...(fresh ? prev.lines : []), line], at: Date.now() })
    })
}

/** The lines noted for this player since their last card, once. */
export function takeJewelryNotes(playerId: number): string[] {
    const note = notes.get(playerId)
    if (!note) return []
    notes.delete(playerId)
    return Date.now() - note.at < NOTE_TTL_MS ? note.lines : []
}
