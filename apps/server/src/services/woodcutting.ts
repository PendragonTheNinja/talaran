import db from '../db';
import { levelFromXp } from './xp';
import { logger } from '../index';

const TOOL_TIER_PENALTY = 0.4; // 40% slower per tier below optimal
const MAX_TIER_DIFFERENCE = 3; // can't use axe more than 3 tiers below node

// How much the timer reduces per level over requirement (as a fraction)
const LEVEL_TIMER_REDUCTION = 0.005; // 0.5% per level over requirement

// How much quality shifts per level over requirement
const LEVEL_QUALITY_SHIFT = 0.3; // 0.3% shift from poor to fine/excellent per level

export interface WoodcuttingResult {
  success: boolean;
  itemName?: string;
  xpAwarded?: number;
  error?: string;
}

export function calculateTimer(
  baseTimer: number,
  minTimer: number,
  playerLevel: number,
  requiredLevel: number,
  playerToolTier: number,
  requiredToolTier: number
): number {
  // Level bonus — reduce timer based on levels over requirement
  const levelsOver = Math.max(0, playerLevel - requiredLevel);
  const levelReduction = Math.min(0.5, levelsOver * LEVEL_TIMER_REDUCTION);
  let timer = baseTimer * (1 - levelReduction);

  // Tool tier penalty — slower if using lower tier axe
  const tierDifference = requiredToolTier - playerToolTier;
  if (tierDifference > 0) {
    timer = timer * (1 + tierDifference * TOOL_TIER_PENALTY);
  }

  return Math.max(minTimer, Math.round(timer));
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

  // Shift quality distribution toward better logs as player levels up
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

  // Check player has an axe equipped (for now just check inventory)
  const axeInInventory = await db('player_inventory')
    .join('items', 'player_inventory.item_id', 'items.id')
    .where({ 'player_inventory.player_id': playerId, 'items.subtype': 'axe' })
    .orderBy('items.tier', 'desc')
    .first();

  if (!axeInInventory) {
    return { allowed: false, reason: 'You need a hatchet to chop trees' };
  }

  const tierDifference = node.required_tool_tier - axeInInventory.tier;
  if (tierDifference > MAX_TIER_DIFFERENCE) {
    return { allowed: false, reason: 'Your hatchet is not sharp enough to cut these trees' };
  }

  return { allowed: true, toolTier: axeInInventory.tier };
}

export async function processWoodcuttingAction(
  playerId: number,
  nodeId: number
): Promise<WoodcuttingResult> {
  try {
    const node = await db('resource_nodes').where({ id: nodeId }).first();
    if (!node) return { success: false, error: 'Node not found' };

    const woodcuttingSkill = await db('skills').where({ name: 'Woodcutting' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: woodcuttingSkill.id })
      .first();

    const playerLevel = playerSkill ? levelFromXp(playerSkill.xp) : 1;

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

    // Check exploration — first time chopping this node type
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

      // Award exploration XP
      const explorationSkill = await db('skills').where({ name: 'Exploration' }).first();
      await db('player_skills')
        .where({ player_id: playerId, skill_id: explorationSkill.id })
        .increment('xp', explorationXp);

      logger.info(`Player ${playerId} discovered ${node.name} — awarded ${explorationXp} Exploration XP`);
    }

    logger.info(`Player ${playerId} chopped ${logItem.name} from ${node.name}`);
    return { success: true, itemName: logItem.name, xpAwarded: node.xp_reward };

  } catch (err) {
    logger.error(`Woodcutting error for player ${playerId}: ${err}`);
    return { success: false, error: 'Server error' };
  }
}