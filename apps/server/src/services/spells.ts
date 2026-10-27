import db from '../db'
import { logger } from '../lib/logger'
import { SERVER_ERROR } from '../lib/serviceResult'
import { nextGameMidnight } from '../lib/gameTime'
import { activeXpForSeconds } from './farming'
import { awardXp, playerSkillLevel } from './xp'
import { HUNDREDTHS, spendTalarWithin, type TalarState } from './talar'
import { churchHere } from './church'
import { loadDurabilityTiers, durabilityRule } from './durability'

// Spells (docs/talar-spec.md §5 to §7). A spell is a row (services' nouns);
// what it does is an entry in EFFECTS below (verbs are code).
//
// Common rules, all enforced in castSpell:
//  - Learned at a church, from the spell's Talar level (Nathan, 2026-10-27).
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

interface SpellEffect {
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

const EFFECTS: Record<string, SpellEffect> = {
    wearsight,
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
}

/** Every spell, as this player stands with it. Only spells whose effect exists are offered. */
export async function listSpells(playerId: number): Promise<{ spells: SpellView[]; atChurch: boolean }> {
    const [rows, learned, level, church] = await Promise.all([
        db('spells').where({ is_active: true }).orderBy([{ column: 'talar_level' }, { column: 'display_order' }]),
        db('player_spells').where({ player_id: playerId }).select('spell_id', 'ready_at'),
        playerSkillLevel(playerId, 'Talar'),
        churchHere(playerId),
    ])
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
            }
        }),
    }
}

// ── Learning ─────────────────────────────────────────────────────────────────

export async function learnSpell(playerId: number, key: string): Promise<{ success: true; name: string } | { success: false; error: string }> {
    try {
        const spell: SpellRow | undefined = await db('spells').where({ key: String(key), is_active: true }).first()
        if (!spell || !EFFECTS[spell.key]) return { success: false, error: 'There is no such working to learn.' }
        if (!(await churchHere(playerId))) return { success: false, error: 'Spells are taught in a church.' }
        if ((await playerSkillLevel(playerId, 'Talar')) < spell.talar_level) {
            return { success: false, error: `You need Talar level ${spell.talar_level} to learn ${spell.name}.` }
        }
        await db('player_spells').insert({ player_id: playerId, spell_id: spell.id }).onConflict(['player_id', 'spell_id']).ignore()
        return { success: true, name: spell.name }
    } catch (err) {
        logger.error(`learnSpell error (player ${playerId}, ${key}): ${err}`)
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

        const now = new Date()
        const out = await db.transaction(async trx => {
            // The player's own row for this spell, locked: the cooldown is read
            // and written under it, so parallel casts land one at a time.
            const own = await trx('player_spells').where({ player_id: playerId, spell_id: spell.id }).forUpdate().first()
            if (!own) throw new SpellAbort(`You have not learned ${spell.name}.`)
            if (own.ready_at && new Date(own.ready_at).getTime() > now.getTime()) {
                const mins = Math.ceil((new Date(own.ready_at).getTime() - now.getTime()) / 60000)
                throw new SpellAbort(`${spell.name} will not answer again for ${mins} more minute${mins === 1 ? '' : 's'}.`)
            }

            const cost = await effect.cost(trx, playerId, spell, params)
            const talar = await spendTalarWithin(trx, playerId, cost * HUNDREDTHS)
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
