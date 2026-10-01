/**
 * Combat simulator (docs/combat-spec.md §16). Runs fights on lib/combatMath.ts,
 * the module the live fight will use, so what it measures is what ships.
 *
 *   npx ts-node --transpile-only src/scripts/combatSim.ts calibrate
 *   npx ts-node --transpile-only src/scripts/combatSim.ts acceptance [swing] [divisor] [minutes]
 *   npx ts-node --transpile-only src/scripts/combatSim.ts lowlevel [swing] [divisor]
 *
 * calibrate   reproduces the spec's §11 tables (the v2 unabsorbed model) to
 *             pin down the kit the original sim used, which v2 never recorded.
 * acceptance  sweeps the absorption constant against the §5 table.
 * lowlevel    combat 1–12 against Ambren kit: Taiar, the first release.
 *
 * Read-only: no database.
 */

import {
    COMBAT, CombatConstants, Combatant, DamageType, Form, FORMS, Rng,
    absorption, armourPoints, enemyStats, fightOne, hitChance, levelTerm, maxHp, weaponAim, weaponPower,
} from '../lib/combatMath'
import { levelFromXp, xpForLevel } from '../services/xp'

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
        const c: CombatConstants = { ...COMBAT, ABSORPTION: 0, GRUNT_SWING_SECONDS: enemySwing }
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
            const c: CombatConstants = { ...COMBAT, ABSORPTION: k, ABSORPTION_DIVISOR: divisor, GRUNT_SWING_SECONDS: enemySwing }
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

/**
 * A one-form player at a combat level, with that level's XP shared out:
 * the offensive half by form (§2), the defensive half by `defenseShare`.
 * Variant A's level terms (Attack for aim, Defense for defence).
 */
function kitAt(combatLevel: number, form: Form, type: DamageType, tier: number, defenseShare: number, c: CombatConstants): Kit {
    const total = xpForLevel(combatLevel)
    const offense = total / 2
    const attack = levelFromXp(form === 'twohand' ? 0 : form === 'dual' ? offense : offense / 2)
    const defense = levelFromXp(total / 2 * defenseShare)
    const constitution = levelFromXp(total / 2 * (1 - defenseShare))
    const shield = FORMS[form].shield
    const armour = armourPoints(tier, 'late', shield, c)
    const hp = maxHp(constitution, c)
    return {
        label: `C${combatLevel} ${form} ${type} T${tier} (Att ${attack}, Def ${defense}, Con ${constitution})`,
        combatLevel,
        maxHp: hp,
        foodHeal: 0,
        player: {
            aim: weaponAim(type, tier, c) + levelTerm(attack, c),
            defence: armour + levelTerm(defense, c),
            maxHit: weaponPower(form, type, tier, c),
            absorb: absorption(armour, c),
            swingSeconds: FORMS[form].swingSeconds,
            hp,
        },
    }
}

function lowlevel(): void {
    const c: CombatConstants = {
        ...COMBAT,
        GRUNT_SWING_SECONDS: Number(process.argv[3] ?? COMBAT.GRUNT_SWING_SECONDS),
        ABSORPTION_DIVISOR: Number(process.argv[4] ?? COMBAT.ABSORPTION_DIVISOR),
    }
    console.log(`\nTaiar: Ambren kit (one-hand spear, late set with shield), grunt ${c.GRUNT_SWING_SECONDS}s, armour × ${c.ABSORPTION} / ${c.ABSORPTION_DIVISOR}.`)
    console.log('Defensive XP split evenly between Defense and Constitution for the levels. Dishes/hr at 20 and 40 heal.')
    const rng = mulberry32(12)
    const rows: (string | number)[][] = []
    for (const level of [3, 6, 9, 12]) {
        const kit = kitAt(level, 'onehand', 'pierce', 1, 0.5, c)
        for (const foe of [...new Set([level, Math.max(1, level - 3), 1])]) {
            const enemy = enemyStats(foe, c)
            let prevented = 0
            let landed = 0
            for (let i = 0; i < 2000; i++) {
                const r = fightOne(rng, kit.player, enemy, 1e9, 1, c)
                prevented += r.prevented
                landed += r.landed
            }
            const m = measure(rng, kit, enemy, 2000, c)
            rows.push([
                level, foe, kit.maxHp, f1(m.killSeconds), f1(m.damagePerKill),
                Math.round(m.damagePerHour / 20), Math.round(m.damagePerHour / 40),
                Math.round(m.unattendedMinutes), pct(prevented / (prevented + landed)),
            ])
        }
    }
    table(['combat', 'foe', 'max HP', 'kill s', 'dmg/kill', 'dishes/hr @20', '@40', 'unattended min', 'Defense share'], rows)
}

// ── main ─────────────────────────────────────────────────────────────────────

const commands: Record<string, () => void> = { calibrate, acceptance, lowlevel }
const cmd = process.argv[2] ?? 'calibrate'
if (!commands[cmd]) {
    console.error(`Unknown command "${cmd}". One of: ${Object.keys(commands).join(', ')}`)
    process.exit(1)
}
commands[cmd]()
