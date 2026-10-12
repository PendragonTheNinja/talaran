// Fights (docs/combat-spec.md §9, §10; docs/combat-build-plan.md step 4).
//
// A fight is a 'combat' player_actions row plus its combat_fights row
// (migration 20261012120000). Swings are SETTLED ON READ: the row says how far
// the fight has been played (settled_at) and when each side swings next, and
// anything that touches the fight first plays every swing due up to now, in
// order, with lib/combatFight.ts. The tick does it when the next swing is due
// and pushes the swings; an eat, a flee, travel, the Stop button and the state
// read do it before acting. Nothing lives only in a timer, so a restart loses
// nothing.
//
// Locking: every path takes the action row, then the fight row, then the
// player row, FOR UPDATE, in that order, so an eat and the tick, or two eats,
// run one after the other and the second sees what the first left. Writes are
// relative to those locked reads. Side effects that write through the plain
// connection (drops, coins, the loot log, pushes, bot checks) run after the
// commit, from the report the transaction returns (CLAUDE.md §4 rule 18).
//
// Death (spec §14): at 0 HP the fight ends, everything carried and worn but the
// trophy goes on the ground where they fell (theirs alone for 15 minutes,
// services/groundItems.ts dropEverythingWithin), and they wake in Talador at
// full HP with their gold.

import type { Knex } from 'knex'
import type { Server } from 'socket.io'
import db from '../db'
import { logger } from '../lib/logger'
import {
    COMBAT, CombatLevels, Combatant, DamageType, STANCE_MULTIPLIER, Stance, creatureProfileOf, enemyStats, killXp, maxHp,
} from '../lib/combatMath'
import { FightClock, SwingEvent, drawByWeight, engage, nextEventAt, settle } from '../lib/combatFight'
import { COMBAT_SKILLS, WornCombatItem, combatLevels, playerCombatant } from './combat'
import { awardXp, levelFromXp, xpForLevel, xpToNextLevel } from './xp'
import { incrementStats } from './stats'
import { takeItemsWithin } from './inventory'
import { isBotCheckDue, issueBotCheck } from './botCheck'
import { isPlayerOnline, RESTART_GRACE_MS, serverStartedAt, shouldCancelForAbsence } from '../lib/presence'
import { DEATH_PILE_PRIVATE_MINUTES, dropEverythingWithin } from './groundItems'
import { notifyInventoryChanged } from './inventory'
import { WearableItem, loadDurabilityTiers, wearItem } from './durability'
import { armourSlotsWorn } from '../lib/combatMath'
import { BESTIARY_STEPS, Stances, killsOf, stancesOf } from './bestiary'
import { pushToPlayer } from '../lib/realtime'
import { SERVER_ERROR } from '../lib/serviceResult'

/** Where a fallen fighter wakes (spec §14). */
const RESPAWN_LOCATION = 'Talador'

/**
 * A fight whose next swing is overdue by more than this was not being run: the
 * server was down, or a tick died holding its lease. The gap is skipped, not
 * played, so a restart never lands a minute of unanswered blows on anyone. The
 * tick settles every fight within a couple of seconds of its next swing.
 */
const STALL_MS = 15_000

/** Enough for any honest catch-up; a guard against a loop, not a limit anyone meets. */
const MAX_SEGMENTS = 200

type Executor = Knex | Knex.Transaction

/** A refusal before anything was written (the transaction rolls back). */
export class CombatAbort extends Error {
    constructor(message: string, public status = 400) {
        super(message)
    }
}

// ── Reading the world ────────────────────────────────────────────────────────

const ms = (t: Date | string | number) => new Date(t).getTime()

function creatureCombatant(row: any): Combatant {
    return enemyStats(row.level, COMBAT, creatureProfileOf(row))
}

function stanceMultiplier(creature: any, type: DamageType): number {
    const stance = (creature[`stance_${type}`] ?? 'neutral') as Stance
    return STANCE_MULTIPLIER[stance] ?? 1
}

/** A worn item as a fight reads it: its combat columns and its durability. */
type WornGear = WornCombatItem & WearableItem

/** What the player wears, slot by slot, with the columns a fight reads. */
async function loadWorn(x: Executor, playerId: number): Promise<Record<string, WornGear>> {
    const row = await x('player_equipment').where({ player_id: playerId }).first()
    if (!row) return {}
    const slots = Object.entries(row).filter(([k, v]) => k.endsWith('_item_id') && v) as [string, number][]
    if (!slots.length) return {}
    const items = await x('items').whereIn('id', slots.map(([, id]) => id))
        .select('id', 'name', 'weapon_form', 'damage_type', 'aim', 'power', 'armour', 'tier', 'durability_uses', 'durability_break_pct')
    const byId = new Map(items.map((i: any) => [i.id, i]))
    const out: Record<string, WornGear> = {}
    for (const [column, id] of slots) {
        const item = byId.get(id)
        if (item) out[column.replace(/_item_id$/, '')] = item
    }
    return out
}

/** The creatures a spot holds, with their draw weights. */
async function spotPool(x: Executor, spotId: number): Promise<any[]> {
    return x('fighting_spot_creatures')
        .join('creatures', 'creatures.id', 'fighting_spot_creatures.creature_id')
        .where('fighting_spot_creatures.spot_id', spotId)
        .andWhere('creatures.is_active', true)
        .select('creatures.*', 'fighting_spot_creatures.weight')
}

async function skillXps(x: Executor, playerId: number): Promise<Record<string, number>> {
    const rows = await x('player_skills')
        .join('skills', 'skills.id', 'player_skills.skill_id')
        .where('player_skills.player_id', playerId)
        .whereIn('skills.name', Object.values(COMBAT_SKILLS))
        .select<{ name: string; xp: string | number }[]>('skills.name', 'player_skills.xp')
    const out: Record<string, number> = {}
    for (const r of rows) out[r.name] = Number(r.xp) || 0
    return out
}

/** Food for a fight: anything that heals and does nothing else. Buff dishes are not combat food (Nathan, 2026-10-12). */
function isFightFood(item: any): boolean {
    return Number(item?.heal_amount) > 0 && !item?.buff_effect
}

// ── What a settle reports ────────────────────────────────────────────────────

export interface FightView {
    spot: { id: number; key: string; name: string; kind: string }
    creature: { id: number; name: string; level: number }
    enemyHp: number
    enemyMaxHp: number
    /** ISO time the current creature closes in; in the future while it approaches. */
    engageAt: string
    kills: number
    /** Waiting on a bot check answer, between kills. */
    frozen: boolean
    weapon: string
    /** What this creature is weak to and shrugs off, once the Bestiary tells it (10 kills). */
    stances: Stances | null
    /** The player's side of the face-off: their name and forum avatar, if they have one. */
    you: { name: string; avatarUrl: string | null }
}

interface KillReport {
    creatureKey: string
    creatureName: string
    spotKey: string
    xp: CombatLevels
    xpAfter: Record<string, number>
    /** Gear that broke on this kill (§13). */
    broken: string[]
    /** Where it fell, for a vein it may open. */
    locationId: number
    /** People carry coins (creatures.coin_*). */
    coins: { oneIn: number; min: number; max: number } | null
    /** A kill that may open a vein (creatures.vein_*). */
    vein: { oneIn: number; ore: string; min: number; max: number } | null
    /** The first of its kind this player has killed: a Bestiary entry, and Exploration XP. */
    firstKill: boolean
    explorationXp: number
    /** This kill passed a Bestiary step past the first (10, 50, 250, 1,000). */
    bestiaryStep: boolean
}

interface FightReport {
    playerId: number
    locationId: number | null
    events: (SwingEvent & { creature: string })[]
    kills: KillReport[]
    /** How the fight ended in this settle, if it did. */
    ended: 'died' | 'fled' | 'disconnected' | 'absent' | 'replaced' | 'broke' | null
    froze: boolean
    hp: { current: number; max: number }
    view: FightView | null
    /** Where a death left the pile, for the message. */
    pile: { place: string; stacks: number } | null
}

// ── The settle ───────────────────────────────────────────────────────────────

/** 'replaced': another action is taking the fight's place (travel, Stop, a vein); the client already knows. */
type EndMode = null | 'fled' | 'disconnected' | 'absent' | 'replaced' | 'broke'

/**
 * Lock the player's fight and play it up to `until`, inside `trx`. With
 * `end`, the fight then ends (a flee: HP kept, the kill in progress pays
 * nothing). Returns null when the player has no fight.
 */
async function settleWithin(trx: Knex.Transaction, playerId: number, until: number, end: EndMode): Promise<FightReport | null> {
    const action = await trx('player_actions').where({ player_id: playerId, action_type: 'combat' }).forUpdate().first()
    if (!action) return null
    const fight = await trx('combat_fights').where({ action_id: action.id }).forUpdate().first()
    // FOR NO KEY UPDATE, not FOR UPDATE: every write here leaves the key
    // alone, and FOR UPDATE also blocks the KEY SHARE lock that any insert
    // referencing this player takes for its foreign key. An equip or a pickup
    // holds its own rows and inserts into the pack; with FOR UPDATE here it
    // waited on us while we waited on its equipment row, a deadlock (race:check
    // "fight", equip during a break, showed it as a 500).
    const player = await trx('players').where({ id: playerId }).forNoKeyUpdate().first()
    if (!fight || !player) {
        // An action with no fight behind it cannot be played; clear it.
        await trx('player_actions').where({ id: action.id }).delete()
        return null
    }

    const spot = await trx('fighting_spots').where({ id: fight.spot_id }).first()
    const pool = await spotPool(trx, fight.spot_id)
    let creature = pool.find(c => c.id === fight.creature_id)
        ?? await trx('creatures').where({ id: fight.creature_id }).first()

    let clock: FightClock = {
        enemyHp: Number(fight.enemy_hp),
        engageAt: ms(fight.engage_at),
        playerNextAt: ms(fight.player_next_at),
        enemyNextAt: ms(fight.enemy_next_at),
        absorbed: fight.kill_absorbed,
        landed: fight.kill_landed,
    }
    let settledAt = ms(fight.settled_at)
    let frozen: boolean = fight.frozen
    const shift = (by: number) => {
        clock = { ...clock, engageAt: clock.engageAt + by, playerNextAt: clock.playerNextAt + by, enemyNextAt: clock.enemyNextAt + by }
        settledAt += by
    }

    // Answered the bot check: the clock restarts from now, so the time spent
    // answering is not played as a minute of free blows for the creature.
    if (frozen && !action.bot_check_pending) {
        shift(Math.max(0, until - settledAt))
        frozen = false
    }
    // Nobody was running this fight (a restart): skip the gap.
    const overdue = until - nextEventAt(clock)
    if (!frozen && overdue > STALL_MS) shift(overdue)
    until = Math.max(until, settledAt)

    let levels = await combatLevels(playerId, trx)
    // Locked with the rest: a break takes the piece out of its slot, so an
    // equip landing mid-settle must wait rather than swap the breaking piece
    // back into the pack (race:check "fight", equip during a break).
    await trx('player_equipment').where({ player_id: playerId }).forUpdate().first()
    const worn = await loadWorn(trx, playerId)
    const tiers = await loadDurabilityTiers(trx)
    let missing = Math.max(0, Number(player.hp_missing) || 0)
    const events: FightReport['events'] = []
    const kills: KillReport[] = []
    let died = false
    let froze = false
    let killCount: number = fight.kills
    let weapon = ''

    if (!frozen) {
        for (let segment = 0; segment < MAX_SEGMENTS; segment++) {
            const max = maxHp(levels.constitution)
            const me = playerCombatant(levels, worn, max - missing)
            weapon = me.weaponName
            const foe = creatureCombatant(creature)
            const r = settle(Math.random, clock, max - missing, me.combatant, foe, stanceMultiplier(creature, me.damageType), until)
            for (const e of r.events) events.push({ ...e, creature: creature.name })
            missing = max - r.playerHp
            clock = r.clock
            settledAt = r.settledTo
            if (r.diedAt !== null) { died = true; break }
            if (r.killedAt === null) break

            // The kill (§2): Melee the creature's XP; the defensive side twice
            // that, split by what armour stopped against what got through.
            const split = killXp(creature.xp_per_kill, clock.absorbed, clock.landed)
            const xp: CombatLevels = {
                melee: Math.round(split.melee), defense: Math.round(split.defense), constitution: Math.round(split.constitution),
            }
            await awardXp(playerId, COMBAT_SKILLS.melee, xp.melee, trx)
            await awardXp(playerId, COMBAT_SKILLS.defense, xp.defense, trx)
            await awardXp(playerId, COMBAT_SKILLS.constitution, xp.constitution, trx)
            killCount++

            // The Bestiary counts every kill (services/bestiary.ts). The first
            // of a kind is a find, and finds pay a little Exploration, as a
            // first resource node does (level x 5).
            const [counted] = await trx('player_creature_kills')
                .insert({ player_id: playerId, creature_id: creature.id, kills: 1 })
                .onConflict(['player_id', 'creature_id'])
                .merge({ kills: trx.raw('player_creature_kills.kills + 1') })
                .returning('kills')
            const killsOfKind = Number(counted?.kills ?? 1)
            const firstKill = killsOfKind === 1
            const explorationXp = firstKill ? creature.level * 5 : 0
            if (explorationXp) await awardXp(playerId, 'Exploration', explorationXp, trx, { eventBonus: false })
            const bestiaryStep = !firstKill && (Object.values(BESTIARY_STEPS) as number[]).includes(killsOfKind)

            // Wear (§13): the weapon every kill, and ARMOUR_PIECES_WORN_PER_KILL
            // of the armour pieces worn, at random. A piece past its
            // guarantee may break; a broken piece is gone from its slot.
            const wearing: string[] = []
            if (worn.mainhand?.weapon_form) wearing.push('mainhand')
            const armourSlots = Object.keys(worn).filter(slot => Number(worn[slot]?.armour) > 0)
            wearing.push(...armourSlotsWorn(Math.random, armourSlots))
            const broken: string[] = []
            for (const slot of wearing) {
                const piece = worn[slot]
                if (!piece || !(await wearItem(trx, playerId, piece, tiers, Math.random))) continue
                await trx('player_equipment').where({ player_id: playerId }).update({ [`${slot}_item_id`]: null })
                broken.push(piece.name)
                delete worn[slot]
            }
            if (broken.length) await incrementStats(playerId, { total_gear_broken: broken.length }, trx)

            kills.push({
                creatureKey: creature.key, creatureName: creature.name, spotKey: spot.key, xp,
                xpAfter: await skillXps(trx, playerId),
                broken,
                locationId: spot.location_id,
                coins: creature.coin_chance_one_in
                    ? { oneIn: creature.coin_chance_one_in, min: creature.coin_min ?? 1, max: creature.coin_max ?? creature.coin_min ?? 1 }
                    : null,
                vein: creature.vein_chance_one_in && creature.vein_ore_name
                    ? { oneIn: creature.vein_chance_one_in, ore: creature.vein_ore_name, min: creature.vein_min ?? 1, max: creature.vein_max ?? creature.vein_min ?? 1 }
                    : null,
                firstKill,
                explorationXp,
                bestiaryStep,
            })

            // Something broke: the kill stands, and the fight waits for the
            // player to equip a replacement (§13).
            if (broken.length) {
                end = end ?? 'broke'
                break
            }

            // The next one closes in after the engage delay: drawn by weight,
            // or the one the player chose.
            const next = spot.kind === 'chosen'
                ? pool.find(c => c.id === fight.chosen_creature_id)
                : (pool.length ? drawByWeight(Math.random, pool) : null)
            if (!next) {
                // The spot emptied (a creature switched off mid-fight). End
                // here; the kill is already paid.
                end = end ?? 'fled'
                break
            }
            creature = next
            clock = engage(creatureCombatant(creature), r.killedAt + COMBAT.ENGAGE_DELAY_SECONDS * 1000)
            levels = await combatLevels(playerId, trx)

            // Bot checks only ever fall between kills (§9).
            if (!end && isBotCheckDue(player, new Date(r.killedAt))) { froze = true; break }
        }
    }

    const max = maxHp(levels.constitution)
    if (kills.length) {
        await incrementStats(playerId, { total_creatures_killed: kills.length, total_actions_completed: kills.length }, trx)
    }

    let ended: FightReport['ended'] = null
    let pile: FightReport['pile'] = null
    if (died) {
        const fellAt = spot.location_id
        const { stacks } = await dropEverythingWithin(trx, playerId, fellAt, new Date(settledAt))
        const place = await trx('locations').where({ id: fellAt }).select('name').first()
        pile = { place: place?.name ?? 'where you fell', stacks }
        const respawn = await trx('locations').where({ name: RESPAWN_LOCATION }).first()
        await trx('players').where({ id: playerId }).update({
            hp_missing: 0,
            current_location_id: respawn?.id ?? player.current_location_id,
        })
        await trx('player_actions').where({ id: action.id }).delete()
        await incrementStats(playerId, { total_combat_deaths: 1 }, trx)
        missing = 0
        ended = 'died'
    } else if (end) {
        await trx('players').where({ id: playerId }).update({ hp_missing: missing })
        await trx('player_actions').where({ id: action.id }).delete()
        ended = end
    } else {
        await trx('players').where({ id: playerId }).update({ hp_missing: missing })
        await trx('combat_fights').where({ id: fight.id }).update({
            creature_id: creature.id,
            enemy_hp: clock.enemyHp,
            engage_at: new Date(clock.engageAt),
            player_next_at: new Date(clock.playerNextAt),
            enemy_next_at: new Date(clock.enemyNextAt),
            settled_at: new Date(settledAt),
            kill_absorbed: clock.absorbed,
            kill_landed: clock.landed,
            kills: killCount,
            frozen: frozen || froze,
        })
        await trx('player_actions').where({ id: action.id }).update({
            completes_at: new Date(nextEventAt(clock)),
            ...(froze ? { bot_check_pending: true } : {}),
        })
    }

    const foe = creatureCombatant(creature)
    const knownStances = ended ? null
        : (await killsOf(trx, playerId, creature.id)) >= BESTIARY_STEPS.stances ? stancesOf(creature) : null
    return {
        playerId,
        locationId: action.location_id ?? null,
        events,
        kills,
        ended,
        froze,
        pile,
        hp: { current: died ? max : Math.max(0, max - missing), max },
        view: ended ? null : {
            spot: { id: spot.id, key: spot.key, name: spot.name, kind: spot.kind },
            creature: { id: creature.id, name: creature.name, level: creature.level },
            enemyHp: Math.max(0, Math.ceil(clock.enemyHp)),
            enemyMaxHp: Math.round(foe.hp),
            engageAt: new Date(clock.engageAt).toISOString(),
            kills: killCount,
            frozen: frozen || froze,
            weapon,
            stances: knownStances,
            you: { name: player.username, avatarUrl: player.avatar_url ?? null },
        },
    }
}

const END_MESSAGES: Record<string, string> = {
    fled: 'You break off and back away.',
    disconnected: 'You broke off the fight when your connection dropped.',
    absent: 'You broke off the fight after a long while away.',
}

/** Everything that waits for the commit: bot check, drops, coins, the result cards, the pushes. */
async function afterFight(report: FightReport | null): Promise<void> {
    if (!report) return
    const { playerId } = report
    try {
        if (report.froze) await issueBotCheck(playerId)

        const { rollSecondaryDrops } = await import('./drops')
        const { emitCompletion } = await import('./gameTick')
        const stub = { player_id: playerId, action_type: 'combat', location_id: report.locationId }
        for (const kill of report.kills) {
            const drops = [
                ...await rollSecondaryDrops(playerId, `combat:${kill.creatureKey}`, COMBAT_SKILLS.melee),
                ...await rollSecondaryDrops(playerId, `combat:${kill.creatureKey}@${kill.spotKey}`, COMBAT_SKILLS.melee),
            ]
            // People carry coins, on top of the normal gold find (§8).
            if (kill.coins && Math.random() * kill.coins.oneIn < 1) {
                const amount = kill.coins.min + Math.floor(Math.random() * (kill.coins.max - kill.coins.min + 1))
                const { creditGold } = await import('./gold')
                const { GOLD_DROP_NAME } = await import('./goldFinds')
                await creditGold({ playerId, amount, reason: 'combat_coins', refType: 'action', refId: null })
                drops.push({ name: GOLD_DROP_NAME, quantity: amount, notable: true })
            }
            // Knockers knock where the ore runs rich: now and then a kill
            // opens a vein where it fell, as a Granite find would, if none of
            // that ore is open there.
            if (kill.vein && Math.random() * kill.vein.oneIn < 1) {
                const ore = await db('items').where({ name: kill.vein.ore }).select('id', 'name').first()
                const { openVein } = await import('./mining')
                if (ore) await openVein(playerId, kill.locationId, ore, kill.vein.min, kill.vein.max)
            }

            const meleeTotal = kill.xpAfter[COMBAT_SKILLS.melee] ?? kill.xp.melee
            const level = levelFromXp(meleeTotal)
            await emitCompletion(stub, {
                actionType: 'combat',
                result: {
                    itemName: null,
                    creatureName: kill.creatureName,
                    skillName: COMBAT_SKILLS.melee,
                    xpAwarded: kill.xp.melee,
                    xpAwards: [
                        { skill: COMBAT_SKILLS.melee, xp: kill.xp.melee },
                        { skill: COMBAT_SKILLS.defense, xp: kill.xp.defense },
                        { skill: COMBAT_SKILLS.constitution, xp: kill.xp.constitution },
                        ...(kill.explorationXp ? [{ skill: 'Exploration', xp: kill.explorationXp }] : []),
                    ],
                    // Coins are priced from the Melee XP alone (services/goldFinds.ts PAYOUT_SCALE).
                    goldBasisXp: [kill.xp.melee],
                    drops,
                    // A break ends the fight, and the ending line names it.
                    message: `You bring down the ${kill.creatureName}.`
                        + (kill.firstKill ? ' A new entry in your Bestiary.' : '')
                        + (kill.bestiaryStep ? ` Your Bestiary has more to tell about the ${kill.creatureName}.` : ''),
                },
                xpInfo: {
                    totalXp: meleeTotal,
                    level,
                    xpToNext: xpToNextLevel(meleeTotal),
                    leveledUp: levelFromXp(meleeTotal - kill.xp.melee) < level,
                    xpAtLevel: xpForLevel(level),
                },
            })

            // Defense and Constitution level too, and the result card speaks
            // for Melee only: their firsts and feats are claimed here.
            for (const skill of [COMBAT_SKILLS.defense, COMBAT_SKILLS.constitution]) {
                const after = kill.xpAfter[skill] ?? 0
                const gained = skill === COMBAT_SKILLS.defense ? kill.xp.defense : kill.xp.constitution
                if (gained > 0 && levelFromXp(after - gained) < levelFromXp(after)) {
                    const { claimSkillMilestone } = await import('./records')
                    await claimSkillMilestone(playerId, skill, levelFromXp(after))
                    const { evaluateFeats } = await import('./feats')
                    for (const feat of await evaluateFeats(playerId)) pushToPlayer(playerId, 'feat_earned', feat)
                }
            }
        }

        pushToPlayer(playerId, 'combat_update', {
            events: report.events.map(e => ({ ...e, at: new Date(e.at).toISOString() })),
            kills: report.kills.map(k => ({ creature: k.creatureName, xp: k.xp, broken: k.broken })),
            hp: report.hp,
            fight: report.view,
            ended: report.ended,
        })
        // A replaced fight says nothing: the request replacing it is already
        // starting the next thing, and a stop notice would clear it on screen.
        if (report.ended === 'died') {
            const lost = report.pile && report.pile.stacks > 0
                ? ` What you carried lies at ${report.pile.place}, yours alone for ${DEATH_PILE_PRIVATE_MINUTES} minutes. After that, anyone passing may take it.`
                : ''
            // As info, so it stays on the result card rather than fading
            // from the log in five seconds: it says where the pile is.
            pushToPlayer(playerId, 'action_failed', { error: `You fall. You come round in Talador with your purse and little else.${lost}`, info: true })
            notifyInventoryChanged(playerId)
            pushToPlayer(playerId, 'equipment_changed')
        } else if (report.ended === 'broke') {
            const names = report.kills.flatMap(k => k.broken)
            pushToPlayer(playerId, 'action_failed', {
                error: `Your ${names.join(' and your ')} ${names.length > 1 ? 'give' : 'gives'} out. You step back to see to your gear before the next one.`,
                info: true,
            })
            pushToPlayer(playerId, 'equipment_changed')
        } else if (report.ended && END_MESSAGES[report.ended]) {
            pushToPlayer(playerId, 'action_failed', { error: END_MESSAGES[report.ended], info: true })
        }
    } catch (err) {
        logger.error(`afterFight error (player ${playerId}): ${err}`)
    }
}

async function runSettle(playerId: number, until: number, end: EndMode): Promise<FightReport | null> {
    const report = await db.transaction(trx => settleWithin(trx, playerId, until, end))
    await afterFight(report)
    return report
}

// ── Entry points ─────────────────────────────────────────────────────────────

/**
 * The tick's turn (services/gameTick.ts): settle to now, or, if the player has
 * gone, end the fight as a flee. A disconnect flees at the moment it happened
 * unless the player opted to fight on (player_settings.combat_continue_offline),
 * and then the normal 30-minute absence rule ends it (spec §9).
 */
export async function tickFight(io: Server, action: any): Promise<void> {
    try {
        const playerId: number = action.player_id
        const now = Date.now()
        let until = now
        let end: EndMode = null
        const online = isPlayerOnline(io, playerId) || now - serverStartedAt < RESTART_GRACE_MS
        if (!online) {
            const player = await db('players').where({ id: playerId }).select('last_seen').first()
            const settings = await db('player_settings').where({ player_id: playerId }).select('combat_continue_offline').first()
            if (!settings?.combat_continue_offline) {
                end = 'disconnected'
                if (player?.last_seen) until = Math.min(now, ms(player.last_seen))
            } else if (shouldCancelForAbsence(io, playerId, player?.last_seen)) {
                end = 'absent'
            }
        }
        await runSettle(playerId, until, end)
    } catch (err) {
        logger.error(`tickFight error (player ${action.player_id}): ${err}`)
    }
}

export type StartResult = { success: true; fight: FightView; hp: { current: number; max: number } } | { success: false; error: string; status: number }

/** Start fighting at a spot where the player stands. `creatureId` picks the opponent at a chosen spot. */
export async function startFight(playerId: number, spotId: number, creatureId: number | null): Promise<StartResult> {
    try {
        return await db.transaction(async trx => {
            const player = await trx('players').where({ id: playerId }).forNoKeyUpdate().first()
            if (!player) throw new CombatAbort('Player not found', 404)
            if (await trx('player_actions').where({ player_id: playerId }).first()) {
                throw new CombatAbort('You are already doing something.', 409)
            }
            const spot = await trx('fighting_spots').where({ id: spotId, is_active: true }).first()
            if (!spot || spot.location_id !== player.current_location_id) {
                throw new CombatAbort('There is no fighting to be had there from here.')
            }
            const pool = await spotPool(trx, spot.id)
            if (!pool.length) throw new CombatAbort('Nothing stirs here today.')

            let chosen: any = null
            if (spot.kind === 'chosen') {
                chosen = pool.find(c => c.id === creatureId)
                if (!chosen) throw new CombatAbort('Choose what to fight.')
            }
            const creature = chosen ?? drawByWeight(Math.random, pool)

            const now = Date.now()
            const clock = engage(creatureCombatant(creature), now)
            const levels = await combatLevels(playerId, trx)
            const me = playerCombatant(levels, await loadWorn(trx, playerId), 0)

            const [action] = await trx('player_actions').insert({
                player_id: playerId,
                action_type: 'combat',
                action_data: String(spot.id),
                location_id: spot.location_id,
                started_at: new Date(now),
                completes_at: new Date(nextEventAt(clock)),
                auto_restart: true,
                last_timer_seconds: Math.round(me.combatant.swingSeconds),
                last_bot_check: new Date(now),
                bot_check_pending: false,
            }).returning('*')

            await trx('combat_fights').insert({
                action_id: action.id,
                player_id: playerId,
                spot_id: spot.id,
                chosen_creature_id: chosen?.id ?? null,
                creature_id: creature.id,
                enemy_hp: clock.enemyHp,
                engage_at: new Date(clock.engageAt),
                player_next_at: new Date(clock.playerNextAt),
                enemy_next_at: new Date(clock.enemyNextAt),
                settled_at: new Date(now),
            })

            const max = maxHp(levels.constitution)
            const foe = creatureCombatant(creature)
            logger.info(`Player ${playerId} started fighting at ${spot.name} (${creature.name})`)
            return {
                success: true as const,
                hp: { current: Math.max(0, max - (Number(player.hp_missing) || 0)), max },
                fight: {
                    spot: { id: spot.id, key: spot.key, name: spot.name, kind: spot.kind },
                    creature: { id: creature.id, name: creature.name, level: creature.level },
                    enemyHp: Math.ceil(clock.enemyHp),
                    enemyMaxHp: Math.round(foe.hp),
                    engageAt: new Date(clock.engageAt).toISOString(),
                    kills: 0,
                    frozen: false,
                    weapon: me.weaponName,
                    stances: (await killsOf(trx, playerId, creature.id)) >= BESTIARY_STEPS.stances ? stancesOf(creature) : null,
                    you: { name: player.username, avatarUrl: player.avatar_url ?? null },
                },
            }
        })
    } catch (err: any) {
        if (err instanceof CombatAbort) return { success: false, error: err.message, status: err.status }
        // The unique index on player_actions.player_id is the real gate (CLAUDE.md §9).
        if (err?.code === '23505') return { success: false, error: 'You are already doing something.', status: 409 }
        logger.error(`startFight error (player ${playerId}): ${err}`)
        return { success: false, error: SERVER_ERROR, status: 500 }
    }
}

export type EatResult =
    | { success: true; healed: number; itemName: string; hp: { current: number; max: number }; fight: FightView | null }
    | { success: false; error: string; status: number }

/**
 * Eat one fight food (spec §10). In a fight, the fight is settled to this
 * moment first: if the killing blow came first, the meal is refused and the
 * death stands. Works out of a fight too, since food is the only heal.
 */
export async function eatFood(playerId: number, itemId: number): Promise<EatResult> {
    try {
        const item = await db('items').where({ id: itemId }).first()
        if (!item) return { success: false, error: 'No such food.', status: 404 }
        if (!isFightFood(item)) return { success: false, error: `${item.name} will not mend you.`, status: 400 }

        let report: FightReport | null = null
        const out = await db.transaction(async trx => {
            report = await settleWithin(trx, playerId, Date.now(), null)
            if (report?.ended === 'died') {
                return { success: false as const, error: 'You fell before you could eat.', status: 409 }
            }
            // Out of a fight there was nothing to settle: lock the player here.
            const player = await trx('players').where({ id: playerId }).forNoKeyUpdate().first()
            const max = maxHp((await combatLevels(playerId, trx)).constitution)
            const missing = Math.max(0, Number(player.hp_missing) || 0)
            if (missing <= 0) {
                return { success: false as const, error: 'You are already in full health.', status: 400 }
            }
            const took = await takeItemsWithin(trx, playerId, [{ name: item.name, quantity: 1 }])
            if (!took.ok) return { success: false as const, error: `You have no ${item.name}.`, status: 400 }
            const healed = Math.min(missing, Number(item.heal_amount))
            await trx('players').where({ id: playerId }).update({ hp_missing: missing - healed })
            const hp = { current: max - (missing - healed), max }
            if (report) report.hp = hp
            return { success: true as const, healed, itemName: item.name, hp, fight: report?.view ?? null }
        })
        await afterFight(report)
        if (out.success) pushToPlayer(playerId, 'hp_changed', { hp: out.hp })
        return out
    } catch (err) {
        logger.error(`eatFood error (player ${playerId}): ${err}`)
        return { success: false, error: SERVER_ERROR, status: 500 }
    }
}

/** Break off (spec §9): settled to now, HP kept, the kill in progress pays nothing. */
export async function fleeFight(playerId: number): Promise<{ success: boolean; error?: string; status?: number; hp?: { current: number; max: number } }> {
    try {
        const report = await runSettle(playerId, Date.now(), 'fled')
        if (!report) return { success: false, error: 'You are not fighting.', status: 400 }
        if (report.ended === 'died') return { success: false, error: 'You fell before you could get away.', status: 409, hp: report.hp }
        return { success: true, hp: report.hp }
    } catch (err) {
        logger.error(`fleeFight error (player ${playerId}): ${err}`)
        return { success: false, error: SERVER_ERROR, status: 500 }
    }
}

/**
 * Settle and end a fight before something else replaces the player's action:
 * travel, the Stop button, a vein. Those delete the action unconditionally;
 * this plays the swings up to the moment first, so none are lost. A no-op for
 * anything that is not a fight.
 */
export async function endFightIfAny(playerId: number): Promise<void> {
    try {
        await runSettle(playerId, Date.now(), 'replaced')
    } catch (err) {
        logger.error(`endFightIfAny error (player ${playerId}): ${err}`)
    }
}

/** The fight as it stands now (settled to this moment), and the food the player could eat. */
export async function fightState(playerId: number): Promise<{
    fight: FightView | null
    hp: { current: number; max: number }
    food: { itemId: number; name: string; quantity: number; heal: number }[]
}> {
    const report = await runSettle(playerId, Date.now(), null)
    let hp = report?.hp
    if (!hp || report?.ended) {
        const player = await db('players').where({ id: playerId }).select('hp_missing').first()
        const max = maxHp((await combatLevels(playerId)).constitution)
        hp = { current: Math.max(0, max - (Number(player?.hp_missing) || 0)), max }
    }
    const food = await db('player_inventory')
        .join('items', 'items.id', 'player_inventory.item_id')
        .where('player_inventory.player_id', playerId)
        .andWhere('items.heal_amount', '>', 0)
        .whereNull('items.buff_effect')
        .andWhere('player_inventory.quantity', '>', 0)
        .orderBy('items.heal_amount')
        .select('items.id as itemId', 'items.name', 'player_inventory.quantity', 'items.heal_amount as heal')
    return { fight: report?.view ?? null, hp, food }
}
