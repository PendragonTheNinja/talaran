import db from '../db';
import { levelFromXp } from './xp';
import { logger } from '../lib/logger';
import { incrementStats } from './stats';
import { rollSecondaryDrops, SecondaryDrop } from './drops';
import { addItemToInventory, addItemToInventoryWithin } from './inventory';
import { timerCut } from './buffs';
import { awardXp } from './xp';
import { SERVER_ERROR } from '../lib/serviceResult';
import { levelTimerFactor, toolTierSpeedFactor } from '../lib/actionTimers';
import { workingTier } from '../lib/tiers';
import { standsAt } from '../lib/whereabouts';
import { isletFindHere, spendIsletFind } from './isletFinds';
import { doubleYield, doubledLine } from './buffs';
import { noteJewelry } from './jewelry';

const TOOL_TIER_PENALTY = 0.4;
const MAX_TIER_DIFFERENCE = 3;
const LEVEL_QUALITY_SHIFT = 0.3;

export interface WoodcuttingResult {
  success: boolean;
  itemName?: string;
  /** Two when a double-yield provision fired, else one. */
  quantity?: number;
  xpAwarded?: number;
  error?: string;
  drops?: SecondaryDrop[];
}

/**
 * The gathering timer for Woodcutting AND Mining: level reduction, tool tier,
 * then any provision. Mining imports it from here; do not copy it into mining.
 */
export function calculateTimer(
  baseTimer: number,
  minTimer: number,
  playerLevel: number,
  requiredLevel: number,
  playerToolTier: number,
  requiredToolTier: number,
  /**
   * PERCENT off from an active provision, already looked up by the caller.
   *
   * Passed in rather than fetched here because this is a pure function called
   * from three places, two of them inside the tick loop where an extra query
   * per action would be a real cost.
   *
   * Applied AFTER the level and tool reductions and BEFORE the floor, so a buff
   * can shorten a job but never take it below its minimum.
   */
  buffPercent = 0,
): number {
  let timer = baseTimer * levelTimerFactor(playerLevel, requiredLevel)

  const tierDifference = playerToolTier - requiredToolTier
  if (tierDifference < 0) {
    timer = timer * (1 + Math.abs(tierDifference) * TOOL_TIER_PENALTY)
  } else if (tierDifference > 0) {
    timer = timer * toolTierSpeedFactor(playerToolTier, requiredToolTier)
  }

  const rounded = Math.round(timer)
  return Math.max(minTimer, rounded - timerCut(rounded, buffPercent))
}

/**
 * Which wood a tree gives, from its node name. The one copy of the rule: the
 * chop uses it, and so does anything asking what a place yields (the
 * travelling merchant's stock, services/travellingMerchant.ts).
 */
export function logSubtypeFor(nodeName: string): string {
  const n = nodeName.toLowerCase();
  return n.includes('lanai') ? 'lanai'
    : n.includes('hatch') ? 'hatch'
      : n.includes('bearn') ? 'bearn'
        : n.includes('mirrith') ? 'mirrith'
          : 'craxial';
}

export function determineLogQuality(
  poorChance: number,
  fineChance: number,
  excellentChance: number,
  playerLevel: number,
  requiredLevel: number
): 'poor' | 'fine' | 'excellent' {
  const levelsOver = Math.max(0, playerLevel - requiredLevel);
  const shift = Math.min(30, levelsOver * LEVEL_QUALITY_SHIFT);

  const adjustedPoor = Math.max(5, poorChance - shift);
  const adjustedExcellent = Math.min(60, excellentChance + shift * 0.5);
  const adjustedFine = 100 - adjustedPoor - adjustedExcellent;

  const roll = Math.random() * 100;
  if (roll < adjustedPoor) return 'poor';
  if (roll < adjustedPoor + adjustedFine) return 'fine';
  return 'excellent';
}

export async function canChopHere(
  playerId: number,
  nodeId: number
): Promise<{ allowed: boolean; reason?: string; toolTier?: number }> {
  const node = await db('resource_nodes').where({ id: nodeId }).first();
  if (!node) return { allowed: false, reason: 'Resource node not found' };
  // A stand found on an islet counts as here while it has chops left
  // (services/isletFinds.ts).
  if (!(await standsAt(playerId, node.location_id)) && !(await isletFindHere(playerId, 'stand', node.id))) {
    const onIslet = await db('players as p').join('locations as l', 'l.id', 'p.current_location_id')
      .where('p.id', playerId).whereNotNull('l.islet_kind').first('l.id');
    return { allowed: false, reason: onIslet ? 'The stand is cut out. Nothing worth felling is left here.' : 'Those trees are not here.' };
  }

  // Check player level
  const woodcuttingSkill = await db('skills').where({ name: 'Woodcutting' }).first();
  const playerSkill = await db('player_skills')
    .where({ player_id: playerId, skill_id: woodcuttingSkill.id })
    .first();

  const playerLevel = playerSkill ? levelFromXp(playerSkill.xp) : 1;

  if (playerLevel < node.required_level) {
    return { allowed: false, reason: `You need Woodcutting level ${node.required_level} to chop here` };
  }

  // Check equipped axe in mainhand
  const equipment = await db('player_equipment').where({ player_id: playerId }).first();
  const equippedAxeId = equipment?.mainhand_item_id;

  if (!equippedAxeId) {
    return { allowed: false, reason: 'You need a hatchet equipped to chop trees' };
  }

  const equippedAxe = await db('items').where({ id: equippedAxeId, subtype: 'axe' }).first();

  if (!equippedAxe) {
    return { allowed: false, reason: 'You need a hatchet equipped to chop trees' };
  }

  const tierDifference = node.required_tool_tier - workingTier(equippedAxe);
  if (tierDifference > MAX_TIER_DIFFERENCE) {
    return { allowed: false, reason: 'Your hatchet is not sharp enough to cut these trees' };
  }

  return { allowed: true, toolTier: workingTier(equippedAxe) };
}

/** The wild hive and what it becomes (named here so item pages can say so). */
export const WILD_HIVE_ITEM = 'Wild Hive';
export const HIVE_SKEP_ITEM = 'Straw Skep';
export const HIVE_BEES_ITEM = 'Skep of Bees';
export const HIVE_COMB_ITEM = 'Honeycomb';

/**
 * Turn a dropped Wild Hive into whatever the player was equipped to take.
 *
 * The hive item never stays in the pack: it is a moment, not an object. Either
 * it becomes a Skep of Bees or it becomes a Honeycomb.
 */
async function resolveWildHive(playerId: number): Promise<{ name: string; notable: boolean }> {
    const hive = await db('items').where({ name: WILD_HIVE_ITEM }).first();
    const skep = await db('items').where({ name: HIVE_SKEP_ITEM }).first();
    const full = await db('items').where({ name: HIVE_BEES_ITEM }).first();
    const comb = await db('items').where({ name: HIVE_COMB_ITEM }).first();
    if (!hive) return { name: WILD_HIVE_ITEM, notable: true };

    return await db.transaction(async trx => {
        // The hive is never kept, whichever way this goes.
        const hiveRow = await trx('player_inventory')
            .where({ player_id: playerId, item_id: hive.id }).forUpdate().first();
        if (hiveRow) {
            if (hiveRow.quantity > 1) {
                await trx('player_inventory').where({ id: hiveRow.id }).decrement('quantity', 1);
            } else {
                await trx('player_inventory').where({ id: hiveRow.id }).delete();
            }
        }

        const skepRow = skep ? await trx('player_inventory')
            .where({ player_id: playerId, item_id: skep.id })
            .where('quantity', '>', 0).forUpdate().first() : null;

        if (skepRow && full) {
            if (skepRow.quantity > 1) {
                await trx('player_inventory').where({ id: skepRow.id }).decrement('quantity', 1);
            } else {
                await trx('player_inventory').where({ id: skepRow.id }).delete();
            }
            await addItemToInventoryWithin(trx, playerId, full.id, 1);
            return { name: HIVE_BEES_ITEM, notable: true };
        }

        if (comb) {
            await addItemToInventoryWithin(trx, playerId, comb.id, 1);
            return { name: HIVE_COMB_ITEM, notable: false };
        }
        return { name: WILD_HIVE_ITEM, notable: true };
    });
}

export async function processWoodcuttingAction(
  playerId: number,
  nodeId: number
): Promise<WoodcuttingResult> {
  try {
    // Verify player can still chop here (tool still equipped, etc.)
    const canChop = await canChopHere(playerId, nodeId);
    if (!canChop.allowed) {
      return { success: false, error: canChop.reason };
    }

    const node = await db('resource_nodes').where({ id: nodeId }).first();
    if (!node) return { success: false, error: 'Node not found' };

    const woodcuttingSkill = await db('skills').where({ name: 'Woodcutting' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: woodcuttingSkill.id })
      .first();

    const playerLevel = playerSkill ? levelFromXp(playerSkill.xp) : 1;

    // Get equipped axe
    const equipment = await db('player_equipment').where({ player_id: playerId }).first();
    const equippedAxe = equipment?.mainhand_item_id
      ? await db('items').where({ id: equipment.mainhand_item_id }).first()
      : null;

    // A stand on an islet (services/isletFinds.ts): better logs and extras,
    // `boost` times likelier, for a fixed number of chops. Away from the
    // node's own place the chop MUST come off the stand, taken first in one
    // conditional statement, so two turns can never share its last use and a
    // turn that finds the stand already gone gives nothing (race:check islet).
    const atNode = await standsAt(playerId, node.location_id);
    const islet = atNode ? null : await isletFindHere(playerId, 'stand', node.id);
    if (!atNode && (await spendIsletFind(playerId, 'stand', node.id)) === null) {
      return { success: false, error: 'The stand is cut out. Nothing worth felling is left here.' };
    }
    const boost = islet?.boost ?? 1;

    // Determine log quality
    const quality = determineLogQuality(
      node.poor_chance / boost,
      node.fine_chance,
      Math.min(100, node.excellent_chance * boost),
      playerLevel,
      node.required_level
    );

    // Find the log item
    const subtype = logSubtypeFor(node.name);

    const logItem = await db('items')
      .where({ subtype, quality, type: 'log' })
      .first();

    if (!logItem) return { success: false, error: 'Log item not found' };

    // Add log to inventory: one atomic upsert (rule 13; audit 2026-11-09, B9).
    // A double-yield provision may make it two.
    const twice = await doubleYield(playerId, 'Woodcutting');
    await addItemToInventory(playerId, logItem.id, twice ? 2 : 1);
    if (twice) noteJewelry(db, playerId, doubledLine(twice, logItem.name));

    // Award XP
    await awardXp(playerId, woodcuttingSkill.id, node.xp_reward);

    // Check exploration
    const discoveryKey = `woodcutting_node_${nodeId}`;
    const alreadyDiscovered = await db('player_exploration')
      .where({ player_id: playerId, discovery_type: 'resource_node', discovery_key: discoveryKey })
      .first();

    // Stats for EVERY chop. These sat inside the discovery guard below, so a
    // node counted once, the first time it was ever found, and every later chop
    // recorded nothing: logs chopped, actions completed, XP earned and both the
    // quality and species keys all stalled. Mining and foraging always counted
    // out here; woodcutting was the odd one out.
    const qualityKey = `${quality}_logs_chopped` as string;
    const subtypeKey = `${subtype}_logs_chopped` as string;
    await incrementStats(playerId, {
      total_logs_chopped: 1,
      total_actions_completed: 1,
      [qualityKey]: 1,
      [subtypeKey]: 1,
    });

    if (!alreadyDiscovered) {
      // Recorded, not paid: Exploration is not built yet (Nathan, 2026-10-13).
      // Two first chops at once both reach here; the second is a no-op, not
      // an error after the log was already given.
      await db('player_exploration').insert({
        player_id: playerId,
        discovery_type: 'resource_node',
        discovery_key: discoveryKey,
        xp_awarded: 0,
      }).onConflict(['player_id', 'discovery_type', 'discovery_key']).ignore();
      logger.info(`Player ${playerId} discovered ${node.name}`);
    }

    // Two keys, rolled independently. The wood key carries anything that comes
    // off a species of tree regardless of where it grows; the node key carries
    // what belongs to a particular stand. Keeping both means the existing lanai
    // entries keep working untouched while a wild hive can be rarer in one wood
    // than another.
    const drops = [
        ...await rollSecondaryDrops(playerId, `woodcutting:${subtype}`, 'Woodcutting', boost),
        ...await rollSecondaryDrops(playerId, `woodcutting:node:${node.id}`, 'Woodcutting', boost),
    ];

    // A wild hive is decided the moment it drops, by whether you were carrying a
    // skep. With one, the colony transfers and you keep the bees. Without, you
    // rob the nest for a single comb and the colony is lost, which is what most
    // people actually did.
    //
    // Resolved here rather than as a later "use" action so the choice sits at
    // the point it matters: the skep has to already be in your pack.
    const hiveIndex = drops.findIndex(d => d.name === WILD_HIVE_ITEM);
    if (hiveIndex !== -1) {
        const resolved = await resolveWildHive(playerId);
        drops[hiveIndex] = { ...drops[hiveIndex], ...resolved };
    }

    logger.info(`Player ${playerId} chopped ${logItem.name} from ${node.name}`);
    return { success: true, itemName: logItem.name, quantity: twice ? 2 : 1, xpAwarded: node.xp_reward, drops };

  } catch (err) {
    logger.error(`Woodcutting error for player ${playerId}: ${err}`);
    return { success: false, error: SERVER_ERROR };
  }
}