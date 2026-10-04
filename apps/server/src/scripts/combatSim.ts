/**
 * Combat simulator (docs/combat-spec.md §16). Runs fights on lib/combatMath.ts,
 * the module the live fight will use, so what it measures is what ships.
 *
 *   npx ts-node --transpile-only src/scripts/combatSim.ts <command> [args]
 *
 * Needs JWT_SECRET in the environment (the band rate comes from
 * services/farming.ts, which loads the auth config); any value will do.
 *
 * History (the measurements the spec's decisions rest on):
 *   calibrate   reproduces the v2 §11 tables to recover the kit the original
 *               sim used (it also showed the v2 grunts swung every 4.0s).
 *   acceptance  [swing] [divisor] [minutes] sweeps the absorption constant
 *               against the §5 table, on the v2 model.
 *
 * The current model (Melee, Defense, Constitution at a normal skill's pace,
 * clean rung gates, the one-piece-per-Defense-level armour ladder):
 *   levels      combat level against each skill's level, per form.
 *   pacing      hours to each rung per skill, against a gatherer on the band.
 *   ledger      Defense's share of the defensive XP, per form and gap.
 *   fit         enemy HP base and growth for ~40s / ~99s level-matched kills.
 *   forms       per form: kills/hr, HP lost/hr, AFK band, against the §5 targets.
 *   afk         [maxTier] [maxFoe]  toughest foe you can leave for 20 minutes.
 *               Taiar is `afk 1 12`.
 *   gap         [levels]  HP lost and kills per hour against foes below you, Ambren gear.
 *
 * Read-only: no database.
 */

import {
    COMBAT, CombatConstants, CombatLevels, Combatant, DamageType, Form, FORMS, Rng,
    absorption, armourForDefense, combatLevel, defenseShare, enemyStats, fightOne, hitChance, levelTerm, maxHp,
    playerMaxHit, swing, weaponAim, weaponPower,
} from '../lib/combatMath'
import { tierOfLevel } from '../lib/tiers'
import { xpForLevel } from '../services/xp'
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
const hrs = (h: number | undefined) => (h === undefined ? '—' : h < 10 ? h.toFixed(1) : String(Math.round(h)))

function table(header: string[], rows: (string | number)[][]): void {
    const cells = [header, ...rows.map(r => r.map(String))]
    const widths = header.map((_, i) => Math.max(...cells.map(r => r[i].length)))
    const line = (r: string[]) => '  ' + r.map((v, i) => v.padStart(widths[i])).join('  ')
    console.log(line(header))
    console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '))
    for (const r of cells.slice(1)) console.log(line(r))
}

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

const FORM_LIST: Form[] = ['onehand', 'twohand', 'dual']
const FORM_LABEL: Record<Form, string> = { onehand: 'one-hand + shield', twohand: 'two-hand', dual: 'dual' }

// ── Progression (option 3b) ──────────────────────────────────────────────────

/**
 * Defense's share of the defensive XP while fighting even foes, measured by
 * `ledger` on this model. Feeds the progression, so re-measure after a change.
 */
const DEFENSE_SHARE: Record<Form, number> = { onehand: 0.5, twohand: 0.33, dual: 0.33 }

interface Snapshot { hours: number; levels: CombatLevels }

/**
 * A one-form player fighting on the band (§2 Pacing): Melee earns a normal
 * skill's rate at the fight's level, and the defensive side earns
 * DEFENSIVE_XP_MULTIPLE × that, split by the ledger.
 * Returns the skill levels at the moment each combat level is first reached.
 */
const progressionCache = new Map<string, Snapshot[]>()
function progression(form: Form, c: CombatConstants = COMBAT): Snapshot[] {
    const key = `${form}:${c.DEFENSIVE_XP_MULTIPLE}`
    const hit = progressionCache.get(key)
    if (hit) return hit
    const xp: CombatLevels = { melee: 0, defense: 0, constitution: 0 }
    const levels = (): CombatLevels => ({
        melee: fastLevel(xp.melee), defense: fastLevel(xp.defense), constitution: fastLevel(xp.constitution),
    })
    const out: Snapshot[] = []
    out[1] = { hours: 0, levels: levels() }
    const step = 0.1
    for (let h = 0; h < 20000 && out.length <= 120; h += step) {
        const rate = band(combatLevel(levels())) * step
        xp.melee += rate
        const defensive = c.DEFENSIVE_XP_MULTIPLE * rate
        xp.defense += defensive * DEFENSE_SHARE[form]
        xp.constitution += defensive * (1 - DEFENSE_SHARE[form])
        const now = levels()
        const cl = combatLevel(now)
        for (let l = 2; l <= cl; l++) if (!out[l]) out[l] = { hours: h + step, levels: now }
    }
    progressionCache.set(key, out)
    return out
}

// ── Kits ─────────────────────────────────────────────────────────────────────

/** A player as the fight sees them, plus what the sim needs around the fight. */
interface Kit {
    label: string
    combatLevel: number
    player: Combatant
    maxHp: number
    /** For food per hour: v2 assumed food healing about 45% of max HP. */
    foodHeal: number
}

/**
 * A one-form player at a combat level on the current model: levels from the
 * progression, the best weapon tier their gate skill allows, the best armour
 * their Defense allows, capped at `maxTier` (an island's metal).
 */
function kitAt(combatLevelWanted: number, form: Form, type: DamageType, c: CombatConstants = COMBAT, maxTier = 9): Kit {
    const { levels: l } = progression(form)[combatLevelWanted]
    const tier = Math.min(maxTier, tierOfLevel(l.melee))
    const offense = l.melee
    const armour = armourForDefense(l.defense, FORMS[form].shield, maxTier, c)
    const hp = maxHp(l.constitution, c)
    return {
        label: `C${combatLevelWanted} ${form} T${tier} (Melee ${l.melee} Def ${l.defense} Con ${l.constitution}, armour ${Math.round(armour)})`,
        combatLevel: combatLevelWanted,
        maxHp: hp,
        foodHeal: 0.45 * hp,
        player: {
            aim: weaponAim(type, tier, c) + levelTerm(offense, c),
            defence: armour + levelTerm(l.defense, c),
            maxHit: playerMaxHit(weaponPower(form, type, tier, c), offense, FORMS[form].swingSeconds, c),
            absorb: absorption(armour, c),
            swingSeconds: FORMS[form].swingSeconds,
            hp,
        },
    }
}

/**
 * The kit the v2 tables were produced with, reverse-engineered from their own
 * figures (hit chances fix aim and defence; kill times fix max hit; damage per
 * kill fixes the enemy's swing):
 *   - one-hand Spear (pierce, aim 110, the balanced form's 3.0s and 38 base power)
 *   - weapon and late armour with shield at the player's combat tier
 *   - aim level 41 / 86, defence level 36 / 81
 *   - max HP 440 / 790, food heals 198 / 356
 */
function v2Kit(level: 50 | 100, c: CombatConstants): Kit {
    const tier = level === 50 ? 5 : 9
    const attack = level === 50 ? 41 : 86
    const defense = level === 50 ? 36 : 81
    const armour = 80 + 37.5 * (tier - 1)
    const hp = level === 50 ? 440 : 790
    return {
        label: `C${level} v2 kit`,
        combatLevel: level,
        maxHp: hp,
        foodHeal: level === 50 ? 198 : 356,
        player: {
            aim: 110 + 37.5 * (tier - 1) + levelTerm(attack, c),
            defence: armour + levelTerm(defense, c),
            maxHit: 38 * Math.pow(c.POWER_GROWTH, tier - 1),
            absorb: absorption(armour, c),
            swingSeconds: 3.0,
            hp,
        },
    }
}

/** The v2 model's enemy HP, which the v2 tables and the §5 acceptance table were measured with. */
const V2: Partial<CombatConstants> = { ENEMY_HP_BASE: 140, ENEMY_HP_GROWTH_PER_TIER: 1.33 }

// ── Measurements ─────────────────────────────────────────────────────────────

interface Matchup {
    youHit: number
    theyHit: number
    killSeconds: number
    damagePerKill: number
    /** Damage per hour of continuous fighting, engage delay included. */
    damagePerHour: number
    killsPerHour: number
    /** Max HP over the damage rate, in minutes: the v2 tables' "Unattended". */
    unattendedMinutes: number
}

function measure(rng: Rng, kit: Kit, enemy: Combatant, fights: number, c: CombatConstants): Matchup {
    let seconds = 0
    let damage = 0
    for (let i = 0; i < fights; i++) {
        // Effectively unkillable, so death never cuts a fight short.
        const r = fightOne(rng, kit.player, enemy, 1e9, 1, c)
        seconds += r.seconds
        damage += r.landed
    }
    const killSeconds = seconds / fights
    const damagePerKill = damage / fights
    const cycle = killSeconds + c.ENGAGE_DELAY_SECONDS
    const damagePerHour = damagePerKill * 3600 / cycle
    return {
        youHit: hitChance(kit.player.aim, enemy.defence, c),
        theyHit: hitChance(enemy.aim, kit.player.defence, c),
        killSeconds,
        damagePerKill,
        damagePerHour,
        killsPerHour: 3600 / cycle,
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

// ── calibrate (history) ──────────────────────────────────────────────────────

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

// ── acceptance (history) ─────────────────────────────────────────────────────

/** The §5 table: constant, C50 AFK % below, C100 AFK % below, C100 parity survival min, food/hr at parity. */
const ACCEPTANCE: [number, number, number, number, number][] = [
    [0.0, 58, 40, 3.6, 37],
    [0.4, 26, 24, 5.7, 23],
    [0.6, 12, 15, 7.9, 17],
    [0.8, 0, 7, 12.3, 11],
    [1.0, 0, 0, 21.8, 6],
]
const TARGET = { c50Afk: 26, c100Afk: 24, c100Survival: 5.7, foodPerHour: 23 }

function acceptance(): void {
    const enemySwing = Number(process.argv[3] ?? COMBAT.GRUNT_SWING_SECONDS)
    const divisor = Number(process.argv[4] ?? COMBAT.ABSORPTION_DIVISOR)
    const minutes = Number(process.argv[5] ?? 20)
    console.log(`\nv2 model. Enemy swing ${enemySwing}s, absorbed = constant × armour / ${divisor}, AFK stretch ${minutes} min.`)
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

// ── levels ───────────────────────────────────────────────────────────────────

function levels(): void {
    console.log('\nSkill levels at the moment each combat level is reached (Melee / Defense / Constitution), and hours of play.')
    const rows: (string | number)[][] = []
    for (const cl of [5, 12, 25, 50, 75, 100]) {
        rows.push([cl, ...FORM_LIST.map(form => {
            const s = progression(form)[cl]
            if (!s) return '—'
            const l = s.levels
            return `${l.melee}/${l.defense}/${l.constitution} (${hrs(s.hours)}h)`
        })])
    }
    table(['combat', ...FORM_LIST.map(f => FORM_LABEL[f])], rows)
}

// ── pacing ───────────────────────────────────────────────────────────────────

function pacing(): void {
    const rungs = [13, 25, 50, 100]
    const gatherer: Record<number, number> = {}
    let xp = 0
    for (let h = 0.1; Object.keys(gatherer).length < rungs.length; h += 0.1) {
        xp += band(fastLevel(xp)) * 0.1
        for (const r of rungs) if (fastLevel(xp) >= r && gatherer[r] === undefined) gatherer[r] = h
    }
    console.log(`\nHours of on-band fighting until each skill first reaches each rung.`)
    console.log(`A gatherer on the band: ${rungs.map(r => `${r} in ${hrs(gatherer[r])}h`).join(', ')}.`)
    const rows: (string | number)[][] = []
    for (const form of FORM_LIST) {
        const snaps = progression(form).filter(Boolean)
        const first = (pick: (l: CombatLevels) => number, r: number) => snaps.find(s => pick(s.levels) >= r)?.hours
        for (const r of rungs) {
            rows.push([
                FORM_LABEL[form], r,
                hrs(first(l => l.melee, r)),
                hrs(first(l => l.defense, r)),
                hrs(first(l => l.constitution, r)),
                hrs(snaps.find((s, i) => i >= r)?.hours),
                hrs(gatherer[r]),
            ])
        }
    }
    table(['form', 'rung', 'Melee', 'Defense', 'Constitution', 'combat level', 'gatherer'], rows)
}

// ── ledger ───────────────────────────────────────────────────────────────────

/** Defense's share of the defensive XP (defenseShare: weighted absorbed against landed), per form, level and gap. */
function ledger(): void {
    const c = COMBAT
    const rows: (string | number)[][] = []
    for (const level of [3, 12, 25, 50, 100]) {
        for (const form of FORM_LIST) {
            const kit = kitAt(level, form, 'slash', c)
            const cells: string[] = []
            for (const below of [0, 25]) {
                const enemy = enemyStats(Math.max(1, Math.round(level * (1 - below / 100))), c)
                const rng = mulberry32(level * 31 + below)
                let absorbed = 0
                let landed = 0
                for (let i = 0; i < 4000; i++) {
                    const s = swing(rng, enemy, kit.player, 1, c)
                    absorbed += s.absorbed
                    landed += s.landed
                }
                cells.push(pct(defenseShare(absorbed, landed, c)))
            }
            rows.push([level, FORM_LABEL[form], ...cells, `${pct(DEFENSE_SHARE[form])}`])
        }
    }
    table(['combat', 'form', 'even foe', 'foe 25% below', 'progression assumes'], rows)
}

// ── fit ──────────────────────────────────────────────────────────────────────

const KILL_SECONDS_C1 = 40
const KILL_SECONDS_C100 = 99

/** Mean seconds to kill a level-matched grunt: one-hand slash, the reference player. */
function parityKillSeconds(level: number, c: CombatConstants): number {
    return measure(mulberry32(level), kitAt(level, 'onehand', 'slash', c), enemyStats(level, c), 4000, c).killSeconds
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
    console.log(`\nCOMBAT holds ENEMY_HP_BASE ${COMBAT.ENEMY_HP_BASE}, ENEMY_HP_GROWTH_PER_TIER ${COMBAT.ENEMY_HP_GROWTH_PER_TIER}.`)
    console.log(`Fitted: ENEMY_HP_BASE ${c.ENEMY_HP_BASE.toFixed(1)}, ENEMY_HP_GROWTH_PER_TIER ${c.ENEMY_HP_GROWTH_PER_TIER.toFixed(4)}. Reference: one-hand slash, even foe.`)
    table(['combat', 'kill s (fitted)', 'kill s (COMBAT)', 'enemy HP (fitted)', 'player max hit'], [1, 12, 25, 50, 75, 100].map(level => [
        level, f1(parityKillSeconds(level, c)), f1(parityKillSeconds(level, COMBAT)), Math.round(enemyStats(level, c).hp),
        f1(kitAt(level, 'onehand', 'slash', c).player.maxHit),
    ]))
}

// ── forms ────────────────────────────────────────────────────────────────────

function forms(): void {
    const c = COMBAT
    const levelsWanted = (process.argv[3] ?? '12,25,50,100').split(',').map(Number)
    console.log('\nSlash in every form. Even foe unless stated. Food at 45% of max HP per item, as v2 assumed.')
    for (const level of levelsWanted) {
        console.log(`\nCombat ${level}`)
        const rows: (string | number)[][] = []
        const ref = measure(mulberry32(level), kitAt(level, 'onehand', 'slash', c), enemyStats(level, c), 3000, c)
        for (const form of FORM_LIST) {
            const kit = kitAt(level, form, 'slash', c)
            const m = measure(mulberry32(level), kit, enemyStats(level, c), 3000, c)
            rows.push([
                FORM_LABEL[form], kit.label.replace(/^C\d+ \w+ /, ''),
                `${f1(m.killsPerHour)} (${pct(m.killsPerHour / ref.killsPerHour)})`,
                Math.round(m.damagePerHour), Math.round(m.damagePerHour / kit.foodHeal),
                f1(m.unattendedMinutes), `${afkBand(kit, c, 20, 'mean')}%`,
            ])
        }
        table(['form', 'kit', 'kills/hr', 'HP lost/hr', 'food/hr', 'parity min', 'AFK band'], rows)
    }
    console.log(`\n§5 targets (one-hand): C50 AFK ${TARGET.c50Afk}%, C100 AFK ${TARGET.c100Afk}%, C100 parity ${TARGET.c100Survival} min, food ${TARGET.foodPerHour}/hr.`)
}

// ── afk ──────────────────────────────────────────────────────────────────────

function unattended(kit: Kit, foe: number, c: CombatConstants): number {
    return measure(mulberry32(kit.combatLevel * 1000 + foe), kit, enemyStats(foe, c), 1500, c).unattendedMinutes
}

function afk(): void {
    const c = COMBAT
    const maxTier = Number(process.argv[3] ?? 9)
    const maxFoe = Number(process.argv[4] ?? 999)
    const minutes = 20
    console.log(`\nToughest foe you can leave for ${minutes} min, no food. Gear capped at tier ${maxTier}, foes at level ${maxFoe}.`)
    console.log('Each cell: foe level (unattended minutes against it) [minutes against a level 1]. "none" = not even a level 1.')
    const rows: (string | number)[][] = []
    for (const level of [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 40]) {
        const row: (string | number)[] = [level]
        for (const form of FORM_LIST) {
            const kit = kitAt(level, form, 'slash', c, maxTier)
            let best = 0
            let bestMin = 0
            for (let foe = Math.min(level, maxFoe); foe >= 1; foe--) {
                const m = unattended(kit, foe, c)
                if (m >= minutes) { best = foe; bestMin = m; break }
            }
            const vsOne = unattended(kit, 1, c)
            row.push(`${best ? `${best} (${Math.round(bestMin)})` : 'none'} [${vsOne > 600 ? '10h+' : Math.round(vsOne)}]`)
        }
        rows.push(row)
    }
    table(['combat', ...FORM_LIST.map(f => FORM_LABEL[f])], rows)
}

// ── gap ──────────────────────────────────────────────────────────────────────

/** HP lost per hour against foes below you: what food a fighter actually needs. */
function gap(): void {
    const c = COMBAT
    const levelsWanted = (process.argv[3] ?? '6,12').split(',').map(Number)
    for (const level of levelsWanted) {
        console.log(`\nCombat ${level}, Ambren gear. HP lost per hour of fighting (kills/hr in brackets).`)
        const foes = [...new Set([level, Math.round(level * 0.75), Math.round(level * 0.5), 1].map(f => Math.max(1, f)))]
        table(['form', ...foes.map(f => `foe ${f}`)], FORM_LIST.map(form => {
            const kit = kitAt(level, form, 'slash', c, 1)
            return [FORM_LABEL[form], ...foes.map(f => {
                const m = measure(mulberry32(level * 100 + f), kit, enemyStats(f, c), 3000, c)
                return `${Math.round(m.damagePerHour)} (${Math.round(m.killsPerHour)})`
            })]
        }))
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

const commands: Record<string, () => void> = { calibrate, acceptance, levels, pacing, ledger, fit, forms, afk, gap }
const cmd = process.argv[2] ?? 'forms'
if (!commands[cmd]) {
    console.error(`Unknown command "${cmd}". One of: ${Object.keys(commands).join(', ')}`)
    process.exit(1)
}
commands[cmd]()
