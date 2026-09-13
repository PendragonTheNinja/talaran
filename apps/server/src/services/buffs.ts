import db from '../db'
import { logger } from '../lib/logger'
import { removeItemFromInventoryWithin, notifyInventoryChanged } from './inventory'

// ── Buffs ─────────────────────────────────────────────────────────
//
// One active buff per player. Small effect, long duration: something you top up
// between sessions rather than juggle during one.
//
// Every consumer goes through the four helpers at the bottom. They all fall back
// to no effect when nothing is active, so a caller that forgets to check still
// behaves correctly rather than throwing.

export const EFFECTS = {
    /**
     * PERCENT off an action timer, rounded up, so it is never less than a
     * second.
     *
     * Was a flat second, which sounded even and was not: a second off a 20s
     * chop is five percent, and off a 300s craft it is a third of one. The
     * short actions got a real buff and the long ones got nothing.
     *
     * Rounding up is what keeps it honest at the small end. One percent of 20
     * seconds is a fifth of a second, which would round away to nothing, so it
     * becomes a full second instead. At 101 seconds it is two.
     */
    TIMER: 'timer',
    /**
     * PERCENT INCREASE to a drop chance, not percentage points.
     *
     * Points would warp rare drops out of shape: +1.5 points turns a 1-in-650
     * wild hive into 1 in 60. A multiplier is worth the same proportionally
     * whether the drop is common or the rarest thing in the game.
     */
    RARE: 'rare',
    /** Percent chance an action yields twice. */
    DOUBLE: 'double',
    /** Percent off travel time. Larger than the others: travel is fully active. */
    TRAVEL: 'travel',
} as const

export interface ActiveBuff {
    sourceItem: string
    effectType: string
    skill: string | null
    magnitude: number
    expiresAt: Date
    secondsLeft: number
}

/**
 * The player's live buff, or null.
 *
 * Expired rows are deleted on read rather than swept by a job. A buff is only
 * ever consulted when the player acts, so the row that matters is always the
 * one being looked at, and a cron to tidy the rest would be work for nobody.
 */
export async function activeBuff(playerId: number): Promise<ActiveBuff | null> {
    const row = await db('player_buffs').where({ player_id: playerId }).first()
    if (!row) return null

    const expires = new Date(row.expires_at)
    if (expires.getTime() <= Date.now()) {
        await db('player_buffs').where({ id: row.id }).delete()
        return null
    }

    return {
        sourceItem: row.source_item,
        effectType: row.effect_type,
        skill: row.skill,
        magnitude: Number(row.magnitude),
        expiresAt: expires,
        secondsLeft: Math.round((expires.getTime() - Date.now()) / 1000),
    }
}

/** Does the live buff apply to this skill? A null skill on the buff means all. */
function appliesTo(buff: ActiveBuff | null, effect: string, skill?: string): boolean {
    if (!buff || buff.effectType !== effect) return false
    if (!buff.skill) return true
    if (!skill) return false
    return buff.skill.toLowerCase() === skill.toLowerCase()
}

/**
 * Eat a buff dish.
 *
 * Replaces whatever was running, deliberately: one at a time is what makes
 * choosing a trade to favour cost anything. The old buff is not refunded or
 * banked, and the player is told what they displaced.
 */
export async function applyBuffFromItem(
    playerId: number,
    itemName: string,
): Promise<{ ok: boolean; error?: string; replaced?: string; secondsLeft?: number }> {
    try {
        const item = await db('items').where({ name: itemName }).first()
        if (!item) return { ok: false, error: 'Unknown item.' }
        if (!item.buff_effect || !item.buff_seconds) {
            return { ok: false, error: `A ${itemName.toLowerCase()} does nothing but fill you up.` }
        }

        const previous = await activeBuff(playerId)

        await db.transaction(async trx => {
            const taken = await removeItemFromInventoryWithin(trx, playerId, item.id, 1)
            if (!taken) throw new Error('NONE')

            const expiresAt = new Date(Date.now() + item.buff_seconds * 1000)
            await trx('player_buffs')
                .insert({
                    player_id: playerId,
                    source_item: item.name,
                    effect_type: item.buff_effect,
                    skill: item.buff_skill ?? null,
                    magnitude: item.buff_magnitude ?? 0,
                    expires_at: expiresAt,
                })
                .onConflict('player_id')
                .merge(['source_item', 'effect_type', 'skill', 'magnitude', 'expires_at', 'created_at'])
        })

        notifyInventoryChanged(playerId)
        return {
            ok: true,
            // Reported even when it is the same dish. Eating a second Miner's
            // Pasty restarts the four hours, it does not add to them, and a
            // player topping one up needs to know that rather than assume the
            // timer stacked.
            replaced: previous ? previous.sourceItem : undefined,
            secondsLeft: item.buff_seconds,
        }
    } catch (err: any) {
        if (String(err?.message) === 'NONE') {
            return { ok: false, error: `You have no ${itemName.toLowerCase()}.` }
        }
        logger.error(`applyBuffFromItem error: ${err}`)
        return { ok: false, error: 'Server error' }
    }
}

// ── What the rest of the game asks ────────────────────────────────

/** Percent off an action timer. See EFFECTS.TIMER. */
export async function buffTimerBonus(playerId: number, skill?: string): Promise<number> {
    const buff = await activeBuff(playerId)
    return appliesTo(buff, EFFECTS.TIMER, skill) ? buff!.magnitude : 0
}

/**
 * Seconds to take off a timer, given the buff percentage.
 *
 * One place, so the recipe bench and the resource nodes cannot drift apart.
 * Rounded UP, never below one second when a buff is running at all.
 */
export function timerCut(seconds: number, percent: number): number {
    if (percent <= 0 || seconds <= 0) return 0
    return Math.max(1, Math.ceil(seconds * percent / 100))
}

/** Percent increase to a drop chance. See EFFECTS.RARE. */
export async function buffRareBonus(playerId: number, skill?: string): Promise<number> {
    const buff = await activeBuff(playerId)
    return appliesTo(buff, EFFECTS.RARE, skill) ? buff!.magnitude : 0
}

/** Percent chance this action yields twice. */
export async function buffDoubleChance(playerId: number, skill?: string): Promise<number> {
    const buff = await activeBuff(playerId)
    return appliesTo(buff, EFFECTS.DOUBLE, skill) ? buff!.magnitude : 0
}

/** Percent off travel time. */
export async function buffTravelBonus(playerId: number): Promise<number> {
    const buff = await activeBuff(playerId)
    return appliesTo(buff, EFFECTS.TRAVEL) ? buff!.magnitude : 0
}
