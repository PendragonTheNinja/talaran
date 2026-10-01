// Combat formulas (docs/combat-spec.md). Pure: no database, no services.
//
// The simulator (scripts/combatSim.ts) and the live fight both run on this
// module, so a balance number measured in the sim is the number players get.
// A simulator that reimplements what it measures proves the arithmetic, not
// the game (see the header of scripts/simulateSkillRates.ts).
//
// Everything tunable is in COMBAT. Functions take a constants object so the
// simulator can sweep a value without touching the default.

export type Form = 'dual' | 'onehand' | 'twohand'
export type DamageType = 'pierce' | 'slash' | 'crush'
export type Stance = 'weak' | 'neutral' | 'resistant'
export type ArmourSet = 'early' | 'late'

export const COMBAT = {
    // §4 accuracy
    HIT_DIVISOR: 10,
    HIT_MIN: 1,
    HIT_MAX: 99,
    LEVEL_TERM_BASE: 20,
    LEVEL_TERM_PER_LEVEL: 1.9,
    GEAR_PER_TIER: 37.5,

    // §5 damage
    BAND_LOW: 25,
    BAND_HIGH: 75,
    ABSORPTION: 0.4,
    // Fitted against the §5 table (scripts/combatSim.ts acceptance). The pair
    // matters: 4.0s grunts reproduce the table at /15, 3.0s grunts at /11.
    // PROVISIONAL until the grunt swing is decided (combat-spec §12).
    ABSORPTION_DIVISOR: 11,

    // §6 weapons
    POWER_GROWTH: 1.221,

    // §7 armour, late set with shield at tier 1
    ARMOUR_LATE_BASE: 80,
    ARMOUR_EARLY_BASE: 54,
    SHIELD_SHARE_LATE: 15 / 80,
    SHIELD_SHARE_EARLY: 10 / 54,

    // §8 health and enemies
    HP_BASE: 100,
    HP_PER_CONSTITUTION: 10,
    ENEMY_BASE: 100,
    ENEMY_PER_LEVEL: 5.05,
    ENEMY_MAX_HIT_BASE: 6,
    ENEMY_MAX_HIT_PER_LEVEL: 0.46,
    ENEMY_HP_BASE: 140,
    ENEMY_HP_GROWTH_PER_TIER: 1.33,
    GRUNT_SWING_SECONDS: 3.0, // the v2 tables were measured at 4.0; see ABSORPTION_DIVISOR

    // §9 fight loop
    ENGAGE_DELAY_SECONDS: 10,
}

export type CombatConstants = typeof COMBAT

export const FORMS: Record<Form, { swingSeconds: number; shield: boolean }> = {
    dual: { swingSeconds: 2.4, shield: false },
    onehand: { swingSeconds: 3.0, shield: true },
    twohand: { swingSeconds: 3.6, shield: false },
}

/** Aim by damage type at tier 1 (§6). */
export const TYPE_AIM: Record<DamageType, number> = { pierce: 110, slash: 100, crush: 90 }

/** Tier 1 weapon power, compensated so the three types are equal at parity (§6). */
export const TIER1_POWER: Record<Form, Record<DamageType, number>> = {
    dual: { pierce: 33, slash: 34, crush: 35 },
    onehand: { pierce: 37, slash: 38, crush: 40 },
    twohand: { pierce: 49, slash: 51, crush: 53 },
}

export const STANCE_MULTIPLIER: Record<Stance, number> = { weak: 1.25, neutral: 1.0, resistant: 0.75 }

// ── Gear ─────────────────────────────────────────────────────────────────────

export function weaponAim(type: DamageType, tier: number, c: CombatConstants = COMBAT): number {
    return TYPE_AIM[type] + c.GEAR_PER_TIER * (tier - 1)
}

export function weaponPower(form: Form, type: DamageType, tier: number, c: CombatConstants = COMBAT): number {
    return TIER1_POWER[form][type] * Math.pow(c.POWER_GROWTH, tier - 1)
}

/** Total armour of a full set (§7). The shield is the offhand piece; forms without one lose it. */
export function armourPoints(tier: number, set: ArmourSet, withShield: boolean, c: CombatConstants = COMBAT): number {
    const base = set === 'late' ? c.ARMOUR_LATE_BASE : c.ARMOUR_EARLY_BASE
    const full = base + c.GEAR_PER_TIER * (tier - 1) * (base / c.ARMOUR_LATE_BASE)
    const shieldShare = set === 'late' ? c.SHIELD_SHARE_LATE : c.SHIELD_SHARE_EARLY
    return withShield ? full : full * (1 - shieldShare)
}

// ── Levels ───────────────────────────────────────────────────────────────────

/** The smaller, level-driven part of aim, defence and (SIM) max hit (§4). */
export function levelTerm(level: number, c: CombatConstants = COMBAT): number {
    return c.LEVEL_TERM_BASE + c.LEVEL_TERM_PER_LEVEL * (level - 1)
}

export function maxHp(constitution: number, c: CombatConstants = COMBAT): number {
    return c.HP_BASE + c.HP_PER_CONSTITUTION * (constitution - 1)
}

// ── Enemies ──────────────────────────────────────────────────────────────────

export interface Combatant {
    aim: number
    defence: number
    maxHit: number
    /** Flat damage taken off every hit that lands on this combatant. */
    absorb: number
    swingSeconds: number
    hp: number
}

/** Grunt stats from level (§8). HP grows ×1.33 per tier, applied smoothly across the levels. */
export function enemyStats(level: number, c: CombatConstants = COMBAT): Combatant {
    const accuracy = c.ENEMY_BASE + c.ENEMY_PER_LEVEL * (level - 1)
    return {
        aim: accuracy,
        defence: accuracy,
        maxHit: c.ENEMY_MAX_HIT_BASE + c.ENEMY_MAX_HIT_PER_LEVEL * level,
        absorb: 0,
        swingSeconds: c.GRUNT_SWING_SECONDS,
        hp: c.ENEMY_HP_BASE * Math.pow(c.ENEMY_HP_GROWTH_PER_TIER, (level - 1) / 12),
    }
}

/** Flat absorption from armour, on a damage scale (§5). */
export function absorption(armour: number, c: CombatConstants = COMBAT): number {
    return c.ABSORPTION * armour / c.ABSORPTION_DIVISOR
}

// ── Rolls ────────────────────────────────────────────────────────────────────

export type Rng = () => number

export function advantage(aim: number, defence: number, c: CombatConstants = COMBAT): number {
    return (aim - defence) / c.HIT_DIVISOR
}

export function hitChance(aim: number, defence: number, c: CombatConstants = COMBAT): number {
    const pct = 50 + advantage(aim, defence, c)
    return Math.min(c.HIT_MAX, Math.max(c.HIT_MIN, pct)) / 100
}

/** The damage band as fractions of max hit (§5). */
export function damageBand(aim: number, defence: number, c: CombatConstants = COMBAT): [number, number] {
    const adv = advantage(aim, defence, c)
    const clamp = (x: number) => Math.min(100, Math.max(0, x)) / 100
    return [clamp(c.BAND_LOW + adv), clamp(c.BAND_HIGH + adv)]
}

export interface SwingResult {
    hit: boolean
    /** What the swing would have done before armour. Rolled on a miss too: misses count toward Defense (§2). */
    rolled: number
    absorbed: number
    landed: number
}

/** One swing: the hit roll, then the band roll (§4, §5). `multiplier` is the stance multiplier. */
export function swing(rng: Rng, attacker: Combatant, defender: Combatant, multiplier = 1, c: CombatConstants = COMBAT): SwingResult {
    const hit = rng() < hitChance(attacker.aim, defender.defence, c)
    const [lo, hi] = damageBand(attacker.aim, defender.defence, c)
    const rolled = Math.round((lo + rng() * (hi - lo)) * attacker.maxHit * multiplier)
    if (!hit) return { hit, rolled, absorbed: 0, landed: 0 }
    const absorbed = Math.min(rolled, Math.round(defender.absorb))
    return { hit, rolled, absorbed, landed: rolled - absorbed }
}

// ── One kill ─────────────────────────────────────────────────────────────────

export interface KillResult {
    seconds: number
    playerDied: boolean
    playerHpLeft: number
    playerSwings: number
    enemySwings: number
    /** Defense's share of the ledger: misses plus absorbed (§2). */
    prevented: number
    /** Constitution's share of the ledger. */
    landed: number
}

/**
 * Fight one enemy to the end, from `playerHp`. The player swings first, at
 * t=0; the enemy first swings one full interval in (§9). On a tie the player
 * swings first. No eating: callers that model food heal between calls.
 */
export function fightOne(
    rng: Rng,
    player: Combatant,
    enemy: Combatant,
    playerHp: number,
    stanceMultiplier = 1,
    c: CombatConstants = COMBAT,
): KillResult {
    let enemyHp = enemy.hp
    let hp = playerHp
    let nextPlayer = 0
    let nextEnemy = enemy.swingSeconds
    const out: KillResult = { seconds: 0, playerDied: false, playerHpLeft: hp, playerSwings: 0, enemySwings: 0, prevented: 0, landed: 0 }
    for (;;) {
        if (nextPlayer <= nextEnemy) {
            const s = swing(rng, player, enemy, stanceMultiplier, c)
            out.playerSwings++
            enemyHp -= s.landed
            if (enemyHp <= 0) { out.seconds = nextPlayer; break }
            nextPlayer += player.swingSeconds
        } else {
            const s = swing(rng, enemy, player, 1, c)
            out.enemySwings++
            out.landed += s.landed
            out.prevented += s.hit ? s.absorbed : s.rolled
            hp -= s.landed
            if (hp <= 0) { out.seconds = nextEnemy; out.playerDied = true; break }
            nextEnemy += enemy.swingSeconds
        }
    }
    out.playerHpLeft = hp
    return out
}
