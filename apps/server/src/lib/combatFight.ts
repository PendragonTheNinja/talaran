// One fight, played forward in time (docs/combat-spec.md §9). Pure: no database,
// no clock of its own. services/combat.ts keeps the state in combat_fights and
// calls this to catch a fight up to a moment; the simulator's fightOne runs
// the same swings from lib/combatMath.ts.
//
// Times are epoch milliseconds. The player swings first, at the moment the
// creature closes in; the creature's first swing lands one interval later. On
// a tie the player swings first.

import { COMBAT, CombatConstants, Combatant, Rng, swing } from './combatMath'

/** Where a fight stands: the creature's HP, when each side swings next, this kill's ledger. */
export interface FightClock {
    enemyHp: number
    /** When the current creature closes in. No swings before it. */
    engageAt: number
    playerNextAt: number
    enemyNextAt: number
    /** This kill's ledger (§2): what armour stopped, what got through, and what missed. */
    absorbed: number
    landed: number
    dodged: number
}

export interface SwingEvent {
    at: number
    by: 'player' | 'enemy'
    hit: boolean
    /** HP taken off the target. */
    damage: number
    /** What armour stopped, on the creature's hits. */
    absorbed: number
}

export interface SettleResult {
    clock: FightClock
    playerHp: number
    /** How far the fight has been played: `until`, or the moment of a kill or a death. */
    settledTo: number
    events: SwingEvent[]
    /** The creature fell at this moment; the caller pays the kill and engages the next. */
    killedAt: number | null
    /** The player fell at this moment. */
    diedAt: number | null
}

/** A fresh creature closing in at `at`. */
export function engage(enemy: Combatant, at: number): FightClock {
    return {
        enemyHp: enemy.hp,
        engageAt: at,
        playerNextAt: at,
        enemyNextAt: at + enemy.swingSeconds * 1000,
        absorbed: 0,
        landed: 0,
        dodged: 0,
    }
}

/** When this fight next needs settling: the next swing on either side. */
export function nextEventAt(clock: FightClock): number {
    return Math.min(clock.playerNextAt, clock.enemyNextAt)
}

/**
 * Play every swing due up to `until`, in order, stopping at the first kill or
 * death so the caller can pay it out before going on. `player.swingSeconds`
 * and `enemy.swingSeconds` space the swings; `stanceMultiplier` is the
 * creature's stance against the player's damage type.
 */
export function settle(
    rng: Rng,
    clock: FightClock,
    playerHp: number,
    player: Combatant,
    enemy: Combatant,
    stanceMultiplier: number,
    until: number,
    c: CombatConstants = COMBAT,
): SettleResult {
    const out: FightClock = { ...clock }
    const events: SwingEvent[] = []
    let hp = playerHp
    for (;;) {
        const playerTurn = out.playerNextAt <= out.enemyNextAt
        const at = playerTurn ? out.playerNextAt : out.enemyNextAt
        if (at > until) break
        if (playerTurn) {
            const s = swing(rng, player, enemy, stanceMultiplier, c)
            out.enemyHp -= s.landed
            events.push({ at, by: 'player', hit: s.hit, damage: s.landed, absorbed: 0 })
            out.playerNextAt = at + player.swingSeconds * 1000
            if (out.enemyHp <= 0) {
                return { clock: out, playerHp: hp, settledTo: at, events, killedAt: at, diedAt: null }
            }
        } else {
            const s = swing(rng, enemy, player, 1, c)
            hp -= s.landed
            out.absorbed += s.absorbed
            out.landed += s.landed
            if (!s.hit) out.dodged += s.rolled
            events.push({ at, by: 'enemy', hit: s.hit, damage: s.landed, absorbed: s.absorbed })
            out.enemyNextAt = at + enemy.swingSeconds * 1000
            if (hp <= 0) {
                return { clock: out, playerHp: 0, settledTo: at, events, killedAt: null, diedAt: at }
            }
        }
    }
    return { clock: out, playerHp: hp, settledTo: until, events, killedAt: null, diedAt: null }
}

/** Draw the next creature at a drawn spot, by weight. */
export function drawByWeight<T extends { weight: number }>(rng: Rng, pool: T[]): T {
    const total = pool.reduce((sum, p) => sum + Math.max(0, p.weight), 0)
    let roll = rng() * total
    for (const p of pool) {
        roll -= Math.max(0, p.weight)
        if (roll < 0) return p
    }
    return pool[pool.length - 1]
}
