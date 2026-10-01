/**
 * Combat simulator (docs/combat-spec.md §16). Runs fights on lib/combatMath.ts,
 * the module the live fight will use, so what it measures is what ships.
 *
 *   npx ts-node --transpile-only src/scripts/combatSim.ts calibrate
 *   npx ts-node --transpile-only src/scripts/combatSim.ts acceptance [swing] [divisor] [minutes]
 *   npx ts-node --transpile-only src/scripts/combatSim.ts lowlevel [swing] [divisor]
 *   npx ts-node --transpile-only src/scripts/combatSim.ts ledger
 *   npx ts-node --transpile-only src/scripts/combatSim.ts fit
 *   npx ts-node --transpile-only src/scripts/combatSim.ts variants [levels]
 *   npx ts-node --transpile-only src/scripts/combatSim.ts afk [maxTier] [maxFoe]
 *   npx ts-node --transpile-only src/scripts/combatSim.ts pacing
 *
 * calibrate   reproduces the spec's §11 tables (the v2 unabsorbed model) to
 *             pin down the kit the original sim used, which v2 never recorded.
 * acceptance  sweeps the absorption constant against the §5 table.
 * lowlevel    combat 1–12 against Ambren kit: Taiar, the first release.
 * ledger      Defense's share of the defensive half under each way of counting.
 * fit         enemy HP base and growth that keep level-matched kills at ~40s
 *             (combat 1) and ~99s (combat 100) once max hit has a level term.
 * variants    level-term variants A, B, C (§2) per form: kills, damage taken, AFK.
 * afk         per form and combat level: the toughest foe you can leave for 20
 *             minutes. maxTier/maxFoe model an island (Taiar: 1 and 12).
 * pacing      hours of fighting to reach each rung in each combat skill, under
 *             the spec's shared XP and under option 3 (each skill at a normal
 *             skill's pace), against a gatherer on the band.
 *
 * Read-only: no database.
 */

import {
    COMBAT, CombatConstants, Combatant, DamageType, Form, FORMS, LevelVariant, Rng,
    absorption, armourPoints, enemyStats, fightOne, hitChance, levelTerm, maxHp, offenseLevels,
    playerMaxHit, swing, weaponAim, weaponPower,
} from '../lib/combatMath'
import { levelFromXp, xpForLevel } from '../services/xp'
import { tierOfLevel } from '../services/workstations'
import { activeXpForSeconds } from '../services/farming'

// ── Plumbing ─────────────────────────────────────────────────────────────────

/** Seeded so a table reads the same twice. */
function mulberry32(seed: number): Rng {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const f1 = (x: number) => x.toFixed(1)

function table(header: string[], rows: (string | number)[][]): void {
    const cells = [header, ...rows.map(r => r.map(String))]
    const widths = header.map((_, i) => Math.max(...cells.map(r => r[i].length)))
    const line = (r: string[]) => '  ' + r.map((v, i) => v.padStart(widths[i])).join('  ')
    console.log(line(header))
    console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '))
    for (const r of cells.slice(1)) console.log(line(r))
}

// ── Kits ─────────────────────────────────────────────────────────────────────

/** A player as the fight sees them, plus what the sim needs around the fight. */
interface Kit {
    label: string
    combatLevel: number
    player: Combatant
    maxHp: number
    foodHeal: number
}

/**
 * The kit the v2 tables were produced with, reverse-engineered from their own
 * figures (hit chances fix aim and defence; kill times fix max hit; damage per
 * kill fixes the enemy's swing):
 *   - one-hand Spear (pierce, aim 110, the balanced form's 3.0s and 38 base power)
 *   - weapon and late armour with shield at the player's combat tier
 *   - aim level 41 / 86, defence level 36 / 81 (about half and a third of combat XP)
 *   - max HP 440 / 790, food heals 198 / 356
 */
function v2Kit(combatLevel: 50 | 100, c: CombatConstants): Kit {
    const tier = combatLevel === 50 ? 5 : 9
    const attack = combatLevel === 50 ? 41 : 86
    const defense = combatLevel === 50 ? 36 : 81
    const armour = 80 + 37.5 * (tier - 1)
    return {
        label: `C${combatLevel} v2 kit`,
        combatLevel,
        maxHp: combatLevel === 50 ? 440 : 790,
        foodHeal: combatLevel === 50 ? 198 : 356,
        player: {
            aim: 110 + 37.5 * (tier - 1) + levelTerm(attack, c),
            defence: armour + levelTerm(defense, c),
            maxHit: 38 * Math.pow(c.POWER_GROWTH, tier - 1),
            absorb: absorption(armour, c),
            swingSeconds: 3.0,
            hp: combatLevel === 50 ? 440 : 790,
        },
    }
}

/** The v2 model's enemy HP, which the v2 tables and the §5 acceptance table were measured with. */
const V2: Partial<CombatConstants> = { ENEMY_HP_BASE: 140, ENEMY_HP_GROWTH_PER_TIER: 1.33 }

/**
 * A one-form player at a combat level, holding that level's tier (the curve
 * gates make it the same tier for every form, §2), with the level's XP shared
 * out: the offensive half by form, the defensive half by `defenseShare`
 * (measured about half and half at parity with a shield, §2).
 */
function kitAt(
    combatLevel: number, form: Form, type: DamageType, variant: LevelVariant,
    c: CombatConstants, defenseShare = 0.5, maxTier = 9,
): Kit {
    const tier = Math.min(maxTier, tierOfLevel(combatLevel))
    const total = xpForLevel(combatLevel)
    const offense = total / 2
    const attackXp = form === 'twohand' ? 0 : form === 'dual' ? offense : offense / 2
    const strengthXp = offense - attackXp
    const { aimLevel, hitLevel } = offenseLevels(variant, form, attackXp, strengthXp, levelFromXp)
    const defense = levelFromXp(total / 2 * defenseShare)
    const constitution = levelFromXp(total / 2 * (1 - defenseShare))
    const armour = armourPoints(tier, 'late', FORMS[form].shield, c)
    const hp = maxHp(constitution, c)
    return {
        label: `C${combatLevel} ${form} ${type} T${tier} ${variant} (aim lvl ${aimLevel}, hit lvl ${hitLevel}, Def ${defense}, Con ${constitution})`,
        combatLevel,
        maxHp: hp,
        foodHeal: 0,
        player: {
            aim: weaponAim(type, tier, c) + levelTerm(aimLevel, c),
            defence: armour + levelTerm(defense, c),
            maxHit: playerMaxHit(weaponPower(form, type, tier, c), hitLevel, FORMS[form].swingSeconds, c),
            absorb: absorption(armour, c),
            swingSeconds: FORMS[form].swingSeconds,
            hp,
        },
    }
}

// ── Measurements ─────────────────────────────────────────────────────────────

interface Matchup {
    youHit: number
    theyHit: number
    killSeconds: number
    damagePerKill: number
    /** Damage per hour of continuous fighting, engage delay included. */
    damagePerHour: number
    /** Max HP over the damage rate, in minutes: the v2 tables' "Unattended". */
    unattendedMinutes: number
}

function measure(rng: Rng, kit: Kit, enemy: Combatant, fights: number, c: CombatConstants): Matchup {
    let seconds = 0
    let damage = 0
    for (let i = 0; i < fights; i++) {
        // Fresh HP each fight and effectively unkillable, so death never cuts a fight short.
        const r = fightOne(rng, kit.player, enemy, 1e9, 1, c)
        seconds += r.seconds
        damage += r.landed
    }
    const killSeconds = seconds / fights
    const damagePerKill = damage / fights
    const damagePerHour = damagePerKill * 3600 / (killSeconds + c.ENGAGE_DELAY_SECONDS)
    return {
        youHit: hitChance(kit.player.aim, enemy.defence, c),
        theyHit: hitChance(enemy.aim, kit.player.defence, c),
        killSeconds,
        damagePerKill,
        damagePerHour,
        unattendedMinutes: damagePerHour > 0 ? kit.maxHp / damagePerHour * 60 : Infinity,
    }
}

/** Minutes of unattended fighting (no food) before death, one run, capped. */
function timeToDeath(rng: Rng, kit: Kit, enemy: Combatant, capMinutes: number, c: CombatConstants): number {
    let hp = kit.maxHp
    let t = 0
    const cap = capMinutes * 60
    while (t < cap) {
        const r = fightOne(rng, kit.player, enemy, hp, 1, c)
        t += r.seconds
        if (r.playerDied) return t / 60
        hp = r.playerHpLeft
        t += c.ENGAGE_DELAY_SECONDS
    }
    return capMinutes
}

// ── calibrate ────────────────────────────────────────────────────────────────

const V2_TABLES: Record<50 | 100, [number, number, number, number, number, number][]> = {
    // foe, you hit %, they hit %, kill s, damage/kill, unattended min
    50: [
        [50, 51, 53, 61.8, 117, 4], [45, 54, 50, 49.4, 78, 6], [40, 56, 47, 40.0, 51, 7],
        [35, 59, 45, 32.3, 33, 10], [30, 61, 42, 26.3, 21, 13], [25, 64, 40, 21.6, 13, 18],
        [20, 66, 37, 17.6, 8, 26],
    ],
    100: [
        [100, 49, 55, 99.2, 385, 4], [90, 54, 50, 64.1, 183, 5], [80, 59, 45, 42.0, 85, 8],
        [70, 64, 40, 27.8, 38, 13], [60, 69, 35, 18.6, 16, 23], [50, 74, 30, 12.5, 6, 47],
        [40, 79, 25, 8.6, 2, 112],
    ],
}

function calibrate(): void {
    for (const enemySwing of [3.0, 4.0]) {
        const c: CombatConstants = { ...COMBAT, ...V2, ABSORPTION: 0, GRUNT_SWING_SECONDS: enemySwing }
        console.log(`\nEnemy swing ${enemySwing}s, no absorption. Each cell: simulated / v2 table.`)
        for (const level of [50, 100] as const) {
            const kit = v2Kit(level, c)
            const rng = mulberry32(level)
            console.log(`\n${kit.label}`)
            table(
                ['foe', 'you hit', 'they hit', 'kill s', 'dmg/kill', 'unattended'],
                V2_TABLES[level].map(([foe, yh, th, ks, dk, un]) => {
                    const m = measure(rng, kit, enemyStats(foe, c), 2500, c)
                    return [
                        foe,
                        `${pct(m.youHit)} / ${yh}%`,
                        `${pct(m.theyHit)} / ${th}%`,
                        `${f1(m.killSeconds)} / ${ks}`,
                        `${Math.round(m.damagePerKill)} / ${dk}`,
                        `${Math.round(m.unattendedMinutes)} / ${un}`,
                    ]
                }),
            )
        }
    }
}

// ── acceptance ───────────────────────────────────────────────────────────────

const ACCEPTANCE: [number, number, number, number, number][] = [
    // constant, C50 AFK % below, C100 AFK % below, C100 parity survival min, food/hr at parity
    [0.0, 58, 40, 3.6, 37],
    [0.4, 26, 24, 5.7, 23],
    [0.6, 12, 15, 7.9, 17],
    [0.8, 0, 7, 12.3, 11],
    [1.0, 0, 0, 21.8, 6],
]

/**
 * The AFK band: how far below combat level a foe must be to last `minutes`
 * unattended. `rule` decides what "last" means: the mean of HP over damage
 * rate (as the v2 Unattended column), or the share of real runs that survive.
 */
function afkBand(kit: Kit, c: CombatConstants, minutes: number, rule: 'mean' | number): number {
    const rng = mulberry32(kit.combatLevel * 7)
    for (let below = 0; below <= 99; below++) {
        const foe = Math.max(1, Math.round(kit.combatLevel * (1 - below / 100)))
        const enemy = enemyStats(foe, c)
        if (rule === 'mean') {
            if (measure(rng, kit, enemy, 600, c).unattendedMinutes >= minutes) return below
        } else {
            const runs = 300
            let survived = 0
            for (let i = 0; i < runs; i++) if (timeToDeath(rng, kit, enemy, minutes, c) >= minutes) survived++
            if (survived / runs >= rule) return below
        }
    }
    return 100
}

function acceptance(): void {
    const enemySwing = Number(process.argv[3] ?? COMBAT.GRUNT_SWING_SECONDS)
    const divisor = Number(process.argv[4] ?? COMBAT.ABSORPTION_DIVISOR)
    const minutes = Number(process.argv[5] ?? 20)
    console.log(`\nEnemy swing ${enemySwing}s, absorbed = constant × armour / ${divisor}, AFK stretch ${minutes} min.`)
    console.log('Each cell: simulated / §5 table. AFK under three rules: mean, 50% of runs survive, 90% survive.')
    table(
        ['const', 'C50 AFK mean|50%|90%', 'C100 AFK mean|50%|90%', 'C100 parity min', 'food/hr'],
        ACCEPTANCE.map(([k, c50, c100, surv, food]) => {
            const c: CombatConstants = { ...COMBAT, ...V2, ABSORPTION: k, ABSORPTION_DIVISOR: divisor, GRUNT_SWING_SECONDS: enemySwing }
            const k50 = v2Kit(50, c)
            const k100 = v2Kit(100, c)
            const parity = measure(mulberry32(1), k100, enemyStats(100, c), 2500, c)
            const bands = (kit: Kit) => [afkBand(kit, c, minutes, 'mean'), afkBand(kit, c, minutes, 0.5), afkBand(kit, c, minutes, 0.9)].join('|')
            return [
                k,
                `${bands(k50)} / ${c50}`,
                `${bands(k100)} / ${c100}`,
                `${f1(parity.unattendedMinutes)} / ${surv}`,
                `${Math.round(parity.damagePerHour / k100.foodHeal)} / ${food}`,
            ]
        }),
    )
}

// ── lowlevel ─────────────────────────────────────────────────────────────────

function lowlevel(): void {
    const c: CombatConstants = {
        ...COMBAT,
        GRUNT_SWING_SECONDS: Number(process.argv[3] ?? COMBAT.GRUNT_SWING_SECONDS),
        ABSORPTION_DIVISOR: Number(process.argv[4] ?? COMBAT.ABSORPTION_DIVISOR),
    }
    console.log(`\nTaiar: Ambren kit (one-hand spear, late set with shield), grunt ${c.GRUNT_SWING_SECONDS}s, armour × ${c.ABSORPTION} / ${c.ABSORPTION_DIVISOR}.`)
    console.log('Variant B levels, defensive XP split evenly. Food items/hr at 20 and 40 heal.')
    const rng = mulberry32(12)
    const rows: (string | number)[][] = []
    for (const level of [3, 6, 9, 12]) {
        const kit = kitAt(level, 'onehand', 'pierce', 'B', c)
        for (const foe of [...new Set([level, Math.max(1, level - 3), 1])]) {
            const enemy = enemyStats(foe, c)
            let absorbed = 0
            let landed = 0
            for (let i = 0; i < 2000; i++) {
                const r = fightOne(rng, kit.player, enemy, 1e9, 1, c)
                absorbed += r.absorbed
                landed += r.landed
            }
            const m = measure(rng, kit, enemy, 2000, c)
            rows.push([
                level, foe, kit.maxHp, f1(m.killSeconds), f1(m.damagePerKill),
                Math.round(m.damagePerHour / 20), Math.round(m.damagePerHour / 40),
                Math.round(m.unattendedMinutes), pct(absorbed / (absorbed + landed)),
            ])
        }
    }
    table(['combat', 'foe', 'max HP', 'kill s', 'dmg/kill', 'food/hr @20', '@40', 'unattended min', 'Defense share'], rows)
}

// ── ledger ───────────────────────────────────────────────────────────────────

/**
 * How the defensive half would split between Defense and Constitution, per
 * way of counting a swing that came at you:
 *   misses+absorbed  v3: a miss counts what it would have done, absorbed counts
 *   absorbed only    misses count for nobody
 *   misses at half   a miss counts half what it would have done
 * Uses the kill's swing-by-swing ledger through the real swing() roll.
 */
function ledger(): void {
    const c = COMBAT
    const rows: (string | number)[][] = []
    for (const level of [3, 12, 25, 50, 100]) {
        for (const form of ['onehand', 'twohand'] as Form[]) {
            const kit = kitAt(level, form, 'slash', 'B', c)
            for (const below of [0, 25]) {
                const enemy = enemyStats(Math.max(1, Math.round(level * (1 - below / 100))), c)
                const rng = mulberry32(level * 31 + below)
                let missed = 0, absorbed = 0, landed = 0
                for (let i = 0; i < 4000; i++) {
                    const s = swing(rng, enemy, kit.player, 1, c)
                    if (s.hit) { absorbed += s.absorbed; landed += s.landed } else missed += s.rolled
                }
                const share = (prev: number) => pct(prev / (prev + landed))
                rows.push([level, form, `${below}%`, share(missed + absorbed), share(absorbed), share(missed / 2 + absorbed)])
            }
        }
    }
    table(['combat', 'form', 'foe below', 'misses+absorbed (v3)', 'absorbed only', 'misses at half'], rows)
}

// ── fit ──────────────────────────────────────────────────────────────────────

const KILL_SECONDS_C1 = 40
const KILL_SECONDS_C100 = 99

/** Mean seconds to kill a level-matched grunt: one-hand slash, variant B, the reference player. */
function parityKillSeconds(level: number, c: CombatConstants): number {
    return measure(mulberry32(level), kitAt(level, 'onehand', 'slash', 'B', c), enemyStats(level, c), 4000, c).killSeconds
}

/**
 * Kill time is close to proportional to enemy HP, so scale the base to fix
 * combat 1 and the growth to fix combat 100, and repeat until both hold.
 */
function fitEnemyHp(c: CombatConstants): CombatConstants {
    let fitted = { ...c }
    for (let i = 0; i < 6; i++) {
        fitted = { ...fitted, ENEMY_HP_BASE: fitted.ENEMY_HP_BASE * KILL_SECONDS_C1 / parityKillSeconds(1, fitted) }
        const ratio = KILL_SECONDS_C100 / parityKillSeconds(100, fitted)
        fitted = { ...fitted, ENEMY_HP_GROWTH_PER_TIER: fitted.ENEMY_HP_GROWTH_PER_TIER * Math.pow(ratio, 12 / 99) }
    }
    return fitted
}

function fit(): void {
    const c = fitEnemyHp(COMBAT)
    console.log(`\nCOMBAT now holds ENEMY_HP_BASE ${COMBAT.ENEMY_HP_BASE}, ENEMY_HP_GROWTH_PER_TIER ${COMBAT.ENEMY_HP_GROWTH_PER_TIER}.`)
    console.log(`\nMax hit = power + ${c.MAX_HIT_PER_LEVEL_TERM} × level term. Reference: one-hand slash, variant B, even foe.`)
    console.log(`Fitted ENEMY_HP_BASE ${c.ENEMY_HP_BASE.toFixed(1)}, ENEMY_HP_GROWTH_PER_TIER ${c.ENEMY_HP_GROWTH_PER_TIER.toFixed(4)} (v2: 140, 1.33)`)
    table(['combat', 'kill s', 'enemy HP', 'player max hit'], [1, 12, 25, 50, 75, 100].map(level => [
        level, f1(parityKillSeconds(level, c)), Math.round(enemyStats(level, c).hp),
        f1(kitAt(level, 'onehand', 'slash', 'B', c).player.maxHit),
    ]))
}

// ── variants ─────────────────────────────────────────────────────────────────

function variants(): void {
    const c = COMBAT
    const levels = (process.argv[3] ?? '12,25,50,100').split(',').map(Number)
    console.log(`\nSlash in every form (types are equal at parity, §6).`)
    console.log('kills/hr against an even foe, relative to one-hand under the same variant | HP lost per hour | AFK band (mean rule, 20 min)')
    for (const level of levels) {
        console.log(`\nCombat ${level}`)
        const rows: (string | number)[][] = []
        for (const form of ['onehand', 'twohand', 'dual'] as Form[]) {
            const row: (string | number)[] = [form]
            for (const variant of ['A', 'B', 'C'] as LevelVariant[]) {
                const kit = kitAt(level, form, 'slash', variant, c)
                const ref = kitAt(level, 'onehand', 'slash', variant, c)
                const enemy = enemyStats(level, c)
                const m = measure(mulberry32(level), kit, enemy, 3000, c)
                const r = measure(mulberry32(level), ref, enemy, 3000, c)
                const killsPerHour = (x: Matchup) => 3600 / (x.killSeconds + c.ENGAGE_DELAY_SECONDS)
                row.push(`${killsPerHour(m).toFixed(1)} (${pct(killsPerHour(m) / killsPerHour(r))})`)
                row.push(Math.round(m.damagePerHour))
                row.push(`${afkBand(kit, c, 20, 'mean')}%`)
            }
            rows.push(row)
        }
        table(['form', 'A kills/hr', 'A HP/hr', 'A AFK', 'B kills/hr', 'B HP/hr', 'B AFK', 'C kills/hr', 'C HP/hr', 'C AFK'], rows)
    }
}

// ── afk ──────────────────────────────────────────────────────────────────────

/**
 * Unattended minutes (mean rule: max HP over damage per hour) for a player
 * fighting one foe level continuously with no food.
 */
function unattended(kit: Kit, foe: number, c: CombatConstants): number {
    return measure(mulberry32(kit.combatLevel * 1000 + foe), kit, enemyStats(foe, c), 1500, c).unattendedMinutes
}

function afk(): void {
    const c = COMBAT
    const maxTier = Number(process.argv[3] ?? 9)
    const maxFoe = Number(process.argv[4] ?? 999)
    const minutes = 20
    console.log(`\nToughest foe you can leave for ${minutes} min, no food. Gear capped at tier ${maxTier}, foes at level ${maxFoe}.`)
    console.log('Each cell: foe level (unattended minutes against it). "none" = not even a level 1. Unattended vs level 1 in brackets after.')
    const rows: (string | number)[][] = []
    for (const level of [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 40]) {
        const row: (string | number)[] = [level]
        for (const form of ['onehand', 'twohand', 'dual'] as Form[]) {
            const kit = kitAt(level, form, 'slash', 'B', c, 0.5, maxTier)
            let best = 0
            let bestMin = 0
            for (let foe = Math.min(level, maxFoe); foe >= 1; foe--) {
                const m = unattended(kit, foe, c)
                if (m >= minutes) { best = foe; bestMin = m; break }
            }
            const vsOne = unattended(kit, 1, c)
            const cell = best ? `${best} (${Math.round(bestMin)})` : 'none'
            row.push(`${cell} [${vsOne > 600 ? '10h+' : Math.round(vsOne)}]`)
            if (form === 'onehand') row.splice(1, 0, kit.maxHp)
        }
        rows.push(row)
    }
    table(['combat', 'max HP', 'one-hand + shield', 'two-hand', 'dual'], rows)
}

// ── pacing ───────────────────────────────────────────────────────────────────

/** Level from XP by binary search over the real curve (levelFromXp is too slow for hour-by-hour stepping). */
const CURVE: number[] = Array.from({ length: 161 }, (_, l) => (l < 1 ? 0 : xpForLevel(l)))
function fastLevel(xp: number): number {
    let lo = 1
    let hi = 160
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (CURVE[mid] <= xp) lo = mid
        else hi = mid - 1
    }
    return lo
}

/** A normal skill's on-band XP per hour at a level: the rate every rung is placed against. */
const band = (level: number) => activeXpForSeconds(level, 3600)

type Skill = 'attack' | 'strength' | 'defense' | 'constitution'

interface PacingScheme {
    label: string
    /** XP per hour into each skill, as multiples of the band at the fight's level. */
    rates: (form: Form, defenseShare: number) => Record<Skill, number>
    /** The level the fight (and so the band) runs at. */
    combatLevel: (xp: Record<Skill, number>) => number
}

const PACING: PacingScheme[] = [
    {
        label: 'Spec now: one skill × 1.5, shared four ways',
        rates: (form, d) => ({
            attack: form === 'twohand' ? 0 : form === 'dual' ? 0.75 : 0.375,
            strength: form === 'dual' ? 0 : form === 'twohand' ? 0.75 : 0.375,
            defense: 0.75 * d,
            constitution: 0.75 * (1 - d),
        }),
        combatLevel: xp => fastLevel(xp.attack + xp.strength + xp.defense + xp.constitution),
    },
    {
        label: 'Option 4a: spec pool, but one-hand pays the offensive 0.75 to BOTH skills',
        rates: (form, d) => ({
            attack: form === 'twohand' ? 0 : 0.75,
            strength: form === 'dual' ? 0 : 0.75,
            defense: 0.75 * d,
            constitution: 0.75 * (1 - d),
        }),
        combatLevel: xp => fastLevel(xp.attack + xp.strength + xp.defense + xp.constitution),
    },
    {
        label: 'Option 4b: as 4a, and the defensive pool doubled to 1.5, split by the ledger',
        rates: (form, d) => ({
            attack: form === 'twohand' ? 0 : 0.75,
            strength: form === 'dual' ? 0 : 0.75,
            defense: 1.5 * d,
            constitution: 1.5 * (1 - d),
        }),
        combatLevel: xp => fastLevel(xp.attack + xp.strength + xp.defense + xp.constitution),
    },
    {
        label: 'Option 3a: form skill(s) × 1.0 each, defensive × 1.0 split by the ledger',
        rates: (form, d) => ({
            attack: form === 'twohand' ? 0 : 1,
            strength: form === 'dual' ? 0 : 1,
            defense: d,
            constitution: 1 - d,
        }),
        combatLevel: optionThreeCombatLevel,
    },
    {
        label: 'Option 3b: form skill(s) × 1.0 each, defensive × 2.0 split by the ledger',
        rates: (form, d) => ({
            attack: form === 'twohand' ? 0 : 1,
            strength: form === 'dual' ? 0 : 1,
            defense: 2 * d,
            constitution: 2 * (1 - d),
        }),
        combatLevel: optionThreeCombatLevel,
    },
]

/** Option 3's combat level: the average of your better offensive and better defensive skill. */
function optionThreeCombatLevel(xp: Record<Skill, number>): number {
    const offense = fastLevel(Math.max(xp.attack, xp.strength))
    const defense = fastLevel(Math.max(xp.defense, xp.constitution))
    return Math.round((offense + defense) / 2)
}

/** Hours until each skill (and combat level) first reaches each rung. */
function hoursToRungs(scheme: PacingScheme, form: Form, defenseShare: number, rungs: number[]) {
    const rates = scheme.rates(form, defenseShare)
    const xp: Record<Skill, number> = { attack: 0, strength: 0, defense: 0, constitution: 0 }
    const reached: Record<string, Record<number, number>> = { weapon: {}, defense: {}, constitution: {}, combat: {} }
    const weaponLevel = () => form === 'twohand' ? fastLevel(xp.strength)
        : form === 'dual' ? fastLevel(xp.attack)
        : Math.min(fastLevel(xp.attack), fastLevel(xp.strength))
    const step = 0.25
    let combatXpPerHourAt50 = 0
    for (let h = 0; h < 40000; h += step) {
        const level = scheme.combatLevel(xp)
        const b = band(level)
        if (level === 50 && !combatXpPerHourAt50) combatXpPerHourAt50 = (rates.attack + rates.strength + rates.defense + rates.constitution)
        for (const k of Object.keys(xp) as Skill[]) xp[k] += rates[k] * b * step
        const now = { weapon: weaponLevel(), defense: fastLevel(xp.defense), constitution: fastLevel(xp.constitution), combat: scheme.combatLevel(xp) }
        for (const key of Object.keys(now) as (keyof typeof now)[]) {
            for (const r of rungs) if (now[key] >= r && reached[key][r] === undefined) reached[key][r] = h + step
        }
        if (rungs.every(r => reached.weapon[r] !== undefined && reached.defense[r] !== undefined)) break
    }
    return { reached, totalMultiple: rates.attack + rates.strength + rates.defense + rates.constitution }
}

function pacing(): void {
    const rungs = [13, 25, 50, 100]
    const fmt = (h: number | undefined) => (h === undefined ? '—' : h < 10 ? h.toFixed(1) : String(Math.round(h)))
    const gatherer: Record<number, number> = {}
    {
        let xp = 0
        for (let h = 0.25; h < 40000 && Object.keys(gatherer).length < rungs.length; h += 0.25) {
            xp += band(fastLevel(xp)) * 0.25
            for (const r of rungs) if (fastLevel(xp) >= r && gatherer[r] === undefined) gatherer[r] = h
        }
    }
    console.log(`\nHours of on-band play to reach each rung. Gatherer on the band: ${rungs.map(r => `${r}: ${fmt(gatherer[r])}h`).join(', ')}.`)
    console.log('Defense share of the defensive XP: 50% with a shield, 33% without (combatSim.ts ledger).')
    for (const scheme of PACING) {
        console.log(`\n${scheme.label}`)
        const rows: (string | number)[][] = []
        for (const [form, share] of [['twohand', 1 / 3], ['onehand', 0.5]] as [Form, number][]) {
            const { reached, totalMultiple } = hoursToRungs(scheme, form, share, rungs)
            const label = form === 'twohand' ? 'two-hand / dual' : 'one-hand + shield'
            rows.push([
                label, `${totalMultiple.toFixed(2)}×`,
                ...rungs.map(r => `${fmt(reached.weapon[r])} | ${fmt(reached.defense[r])} | ${fmt(reached.constitution[r])} | ${fmt(reached.combat[r])}`),
            ])
        }
        table(['form', 'XP vs gatherer', ...rungs.map(r => `rung ${r}: weapon | Def | Con | CL`)], rows)
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

const commands: Record<string, () => void> = { calibrate, acceptance, lowlevel, ledger, fit, variants, afk, pacing }
const cmd = process.argv[2] ?? 'calibrate'
if (!commands[cmd]) {
    console.error(`Unknown command "${cmd}". One of: ${Object.keys(commands).join(', ')}`)
    process.exit(1)
}
commands[cmd]()
