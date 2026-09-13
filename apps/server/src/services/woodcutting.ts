import db from '../db';
import { levelFromXp } from './xp';
import { logger } from '../lib/logger';
import { incrementStats } from './stats';
import { rollSecondaryDrops, SecondaryDrop } from './drops';
import { addItemToInventoryWithin } from './inventory';
import { timerCut } from './buffs';

const TOOL_TIER_PENALTY = 0.4;
const MAX_TIER_DIFFERENCE = 3;
const LEVEL_TIMER_REDUCTION = 0.005;
const LEVEL_QUALITY_SHIFT = 0.3;

export interface WoodcuttingResult {
  success: boolean;
  itemName?: string;
  xpAwarded?: number;
  error?: string;
  drops?: SecondaryDrop[];
}

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
  const levelsOver = Math.max(0, playerLevel - requiredLevel)
  const levelReduction = Math.min(0.5, levelsOver * LEVEL_TIMER_REDUCTION)
  let timer = baseTimer * (1 - levelReduction)

  const tierDifference = playerToolTier - requiredToolTier
  if (tierDifference < 0) {
    timer = timer * (1 + Math.abs(tierDifference) * TOOL_TIER_PENALTY)
  } else if (tierDifference > 0) {
    const bonusPercent = Math.min(0.30, tierDifference * 0.10)
    timer = timer * (1 - bonusPercent)
  }

  const rounded = Math.round(timer)
  return Math.max(minTimer, rounded - timerCut(rounded, buffPercent))
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

  const tierDifference = node.required_tool_tier - equippedAxe.tier;
  if (tierDifference > MAX_TIER_DIFFERENCE) {
    return { allowed: false, reason: 'Your hatchet is not sharp enough to cut these trees' };
  }

  return { allowed: true, toolTier: equippedAxe.tier };
}

/**
 * Turn a dropped Wild Hive into whatever the player was equipped to take.
 *
 * The hive item never stays in the pack: it is a moment, not an object. Either
 * it becomes a Skep of Bees or it becomes a Honeycomb.
 */
async function resolveWildHive(playerId: number): Promise<{ name: string; notable: boolean }> {
    const hive = await db('items').where({ name: 'Wild Hive' }).first();
    const skep = await db('items').where({ name: 'Straw Skep' }).first();
    const full = await db('items').where({ name: 'Skep of Bees' }).first();
    const comb = await db('items').where({ name: 'Honeycomb' }).first();
    if (!hive) return { name: 'Wild Hive', notable: true };

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
            return { name: 'Skep of Bees', notable: true };
        }

        if (comb) {
            await addItemToInventoryWithin(trx, playerId, comb.id, 1);
            return { name: 'Honeycomb', notable: false };
        }
        return { name: 'Wild Hive', notable: true };
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

    // Determine log quality
    const quality = determineLogQuality(
      node.poor_chance,
      node.fine_chance,
      node.excellent_chance,
      playerLevel,
      node.required_level
    );

    // Find the log item
    const subtype = node.name.toLowerCase().includes('lanai') ? 'lanai'
      : node.name.toLowerCase().includes('hatch') ? 'hatch'
        : node.name.toLowerCase().includes('bearn') ? 'bearn'
          : node.name.toLowerCase().includes('mirrith') ? 'mirrith'
            : 'craxial';

    const logItem = await db('items')
      .where({ subtype, quality, type: 'log' })
      .first();

    if (!logItem) return { success: false, error: 'Log item not found' };

    // Add log to inventory
    const existing = await db('player_inventory')
      .where({ player_id: playerId, item_id: logItem.id })
      .first();

    if (existing) {
      await db('player_inventory')
        .where({ player_id: playerId, item_id: logItem.id })
        .increment('quantity', 1);
    } else {
      await db('player_inventory').insert({
        player_id: playerId,
        item_id: logItem.id,
        quantity: 1,
      });
    }

    // Award XP
    await db('player_skills')
      .where({ player_id: playerId, skill_id: woodcuttingSkill.id })
      .increment('xp', node.xp_reward);

    // Check exploration
    const discoveryKey = `woodcutting_node_${nodeId}`;
    const alreadyDiscovered = await db('player_exploration')
      .where({ player_id: playerId, discovery_type: 'resource_node', discovery_key: discoveryKey })
      .first();

    if (!alreadyDiscovered) {
      const explorationXp = node.required_level * 5;
      await db('player_exploration').insert({
        player_id: playerId,
        discovery_type: 'resource_node',
        discovery_key: discoveryKey,
        xp_awarded: explorationXp,
      });

      // Track stats
      const qualityKey = `${quality}_logs_chopped` as string;
      const subtypeKey = `${subtype}_logs_chopped` as string;
      await incrementStats(playerId, {
        total_logs_chopped: 1,
        total_actions_completed: 1,
        total_xp_earned: node.xp_reward,
        [qualityKey]: 1,
        [subtypeKey]: 1,
      });

      const explorationSkill = await db('skills').where({ name: 'Exploration' }).first();
      await db('player_skills')
        .where({ player_id: playerId, skill_id: explorationSkill.id })
        .increment('xp', explorationXp);

      logger.info(`Player ${playerId} discovered ${node.name} — awarded ${explorationXp} Exploration XP`);
    }

    // Two keys, rolled independently. The wood key carries anything that comes
    // off a species of tree regardless of where it grows; the node key carries
    // what belongs to a particular stand. Keeping both means the existing lanai
    // entries keep working untouched while a wild hive can be rarer in one wood
    // than another.
    const drops = [
        ...await rollSecondaryDrops(playerId, `woodcutting:${subtype}`, 'Woodcutting'),
        ...await rollSecondaryDrops(playerId, `woodcutting:node:${node.id}`, 'Woodcutting'),
    ];

    // A wild hive is decided the moment it drops, by whether you were carrying a
    // skep. With one, the colony transfers and you keep the bees. Without, you
    // rob the nest for a single comb and the colony is lost, which is what most
    // people actually did.
    //
    // Resolved here rather than as a later "use" action so the choice sits at
    // the point it matters: the skep has to already be in your pack.
    const hiveIndex = drops.findIndex(d => d.name === 'Wild Hive');
    if (hiveIndex !== -1) {
        const resolved = await resolveWildHive(playerId);
        drops[hiveIndex] = { ...drops[hiveIndex], ...resolved };
    }

    logger.info(`Player ${playerId} chopped ${logItem.name} from ${node.name}`);
    return { success: true, itemName: logItem.name, xpAwarded: node.xp_reward, drops };

  } catch (err) {
    logger.error(`Woodcutting error for player ${playerId}: ${err}`);
    return { success: false, error: 'Server error' };
  }
}