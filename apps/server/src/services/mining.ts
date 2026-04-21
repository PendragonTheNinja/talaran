import db from '../db';
import { levelFromXp } from './xp';
import { logger } from '../index';
import { io } from '../index';

const VEIN_ANNOUNCE_DELAY = 5 * 60 * 1000; // 5 minutes in ms
const DENSE_ORE_START_LEVELS = 15; // levels over required to start getting dense ore
const DENSE_ORE_GUARANTEED_LEVELS = 45; // levels over required to always get dense ore
const MAX_TIER_DIFFERENCE = 3;
const TOOL_TIER_PENALTY = 0.4;
const LEVEL_TIMER_REDUCTION = 0.005;

export interface MiningResult {
  success: boolean;
  itemName?: string;
  xpAwarded?: number;
  veinFound?: boolean;
  veinOreName?: string;
  error?: string;
}

export function calculateMiningTimer(
  baseTimer: number,
  minTimer: number,
  playerLevel: number,
  requiredLevel: number,
  playerToolTier: number,
  requiredToolTier: number
): number {
  const levelsOver = Math.max(0, playerLevel - requiredLevel);
  const levelReduction = Math.min(0.5, levelsOver * LEVEL_TIMER_REDUCTION);
  let timer = baseTimer * (1 - levelReduction);

  const tierDifference = requiredToolTier - playerToolTier;
  if (tierDifference > 0) {
    timer = timer * (1 + tierDifference * TOOL_TIER_PENALTY);
  }

  return Math.max(minTimer, Math.round(timer));
}

export async function canMineHere(
  playerId: number,
  nodeId: number
): Promise<{ allowed: boolean; reason?: string; toolTier?: number }> {
  const node = await db('resource_nodes').where({ id: nodeId }).first();
  if (!node) return { allowed: false, reason: 'Resource node not found' };

  const miningSkill = await db('skills').where({ name: 'Mining' }).first();
  const playerSkill = await db('player_skills')
    .where({ player_id: playerId, skill_id: miningSkill.id })
    .first();

  const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;

  if (playerLevel < node.required_level) {
    return { allowed: false, reason: `You need Mining level ${node.required_level} to mine here` };
  }

  const equipment = await db('player_equipment').where({ player_id: playerId }).first();
  const equippedPickaxeId = equipment?.mainhand_item_id;

  if (!equippedPickaxeId) {
    return { allowed: false, reason: 'You need a pickaxe equipped to mine' };
  }

  const equippedPickaxe = await db('items')
    .where({ id: equippedPickaxeId, subtype: 'pickaxe' })
    .first();

  if (!equippedPickaxe) {
    return { allowed: false, reason: 'You need a pickaxe equipped to mine' };
  }

  const tierDifference = node.required_tool_tier - equippedPickaxe.tier;
  if (tierDifference > MAX_TIER_DIFFERENCE) {
    return { allowed: false, reason: 'Your pickaxe is not strong enough to mine here' };
  }

  return { allowed: true, toolTier: equippedPickaxe.tier };
}

// Check if player is mining a vein specifically
export async function canMineVein(
  playerId: number,
  veinId: number
): Promise<{ allowed: boolean; reason?: string }> {
  const vein = await db('ore_veins').where({ id: veinId }).first();
  if (!vein) return { allowed: false, reason: 'Vein not found' };
  if (vein.is_depleted) return { allowed: false, reason: 'This vein has been depleted' };

  const ore = await db('items').where({ id: vein.ore_item_id }).first();
  const miningSkill = await db('skills').where({ name: 'Mining' }).first();
  const playerSkill = await db('player_skills')
    .where({ player_id: playerId, skill_id: miningSkill.id })
    .first();

  const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;

  if (playerLevel < ore.level_required) {
    return { allowed: false, reason: `You need Mining level ${ore.level_required} to mine this ore` };
  }

  return { allowed: true };
}

// Get active veins at a location visible to this player
export async function getActiveVeins(
  locationId: number,
  playerId: number
): Promise<any[]> {
  const now = new Date();

  const veins = await db('ore_veins')
    .where({ location_id: locationId, is_depleted: false })
    .join('items', 'ore_veins.ore_item_id', 'items.id')
    .select(
      'ore_veins.*',
      'items.name as ore_name',
      'items.level_required as ore_level_required'
    );

  // Filter: show if announced OR if discovered by this player
  return veins.filter(vein => {
    if (vein.is_announced) return true;
    if (vein.discovered_by_player_id === playerId) return true;
    return false;
  });
}

// Process mining a rock node
export async function processMiningRock(
  playerId: number,
  nodeId: number
): Promise<MiningResult> {
  try {
    const node = await db('resource_nodes').where({ id: nodeId }).first();
    if (!node) return { success: false, error: 'Node not found' };

    // Verify still can mine
    const canMine = await canMineHere(playerId, nodeId);
    if (!canMine.allowed) return { success: false, error: canMine.reason };

    const miningSkill = await db('skills').where({ name: 'Mining' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: miningSkill.id })
      .first();

    const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;

    // Determine rock type based on node name
    const rockSubtype = node.name.toLowerCase().includes('granite') ? 'granite'
      : node.name.toLowerCase().includes('limestone') ? 'limestone'
      : node.name.toLowerCase().includes('sandstone') ? 'sandstone'
      : node.name.toLowerCase().includes('marble') ? 'marble'
      : 'basalt';

    const rockItem = await db('items')
      .where({ subtype: rockSubtype, type: 'rock' })
      .first();

    if (rockItem) {
      const existing = await db('player_inventory')
        .where({ player_id: playerId, item_id: rockItem.id })
        .first();

      if (existing) {
        await db('player_inventory')
          .where({ player_id: playerId, item_id: rockItem.id })
          .increment('quantity', 1);
      } else {
        await db('player_inventory').insert({
          player_id: playerId,
          item_id: rockItem.id,
          quantity: 1,
        });
      }
    }

    // Award XP
    await db('player_skills')
      .where({ player_id: playerId, skill_id: miningSkill.id })
      .increment('xp', node.xp_reward);

    // Check for vein discovery
    let veinFound = false;
    let veinOreName: string | undefined;

    if (node.vein_discovery_chance) {
      const roll = Math.floor(Math.random() * 1000);
      if (roll < node.vein_discovery_chance) {
        const veinResult = await discoverVein(playerId, nodeId, playerLevel, node.location_id);
        if (veinResult) {
          veinFound = true;
          veinOreName = veinResult.oreName;
        }
      }
    }

    // Exploration XP for first rock mined here
    const discoveryKey = `mining_node_${nodeId}`;
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
      const explorationSkill = await db('skills').where({ name: 'Exploration' }).first();
      await db('player_skills')
        .where({ player_id: playerId, skill_id: explorationSkill.id })
        .increment('xp', explorationXp);
    }

    logger.info(`Player ${playerId} mined ${rockItem?.name || 'rock'} at node ${nodeId}`);
    return {
      success: true,
      itemName: rockItem?.name || 'Rock',
      xpAwarded: node.xp_reward,
      veinFound,
      veinOreName,
    };

  } catch (err) {
    logger.error(`Mining rock error for player ${playerId}: ${err}`);
    return { success: false, error: 'Server error' };
  }
}

// Process mining an ore vein
export async function processMiningVein(
  playerId: number,
  veinId: number
): Promise<MiningResult> {
  try {
    const vein = await db('ore_veins').where({ id: veinId }).first();
    if (!vein || vein.is_depleted) {
      return { success: false, error: 'This vein has been depleted' };
    }

    const canMine = await canMineVein(playerId, veinId);
    if (!canMine.allowed) return { success: false, error: canMine.reason };

    const miningSkill = await db('skills').where({ name: 'Mining' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: miningSkill.id })
      .first();
    const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;

    const ore = await db('items').where({ id: vein.ore_item_id }).first();

    // Check for dense ore
    const levelsOver = playerLevel - ore.level_required;
    let isDense = false;

    if (levelsOver >= DENSE_ORE_GUARANTEED_LEVELS) {
      isDense = true;
    } else if (levelsOver >= DENSE_ORE_START_LEVELS) {
      const denseChance = (levelsOver - DENSE_ORE_START_LEVELS) / (DENSE_ORE_GUARANTEED_LEVELS - DENSE_ORE_START_LEVELS);
      isDense = Math.random() < denseChance;
    }

    // Get the right ore item (dense or normal)
    let oreItem = ore;
    if (isDense) {
      const denseOre = await db('items')
        .where({ subtype: ore.subtype, type: 'ore', quality: 'dense' })
        .first();
      if (denseOre) oreItem = denseOre;
    }

    // Add ore to inventory
    const existing = await db('player_inventory')
      .where({ player_id: playerId, item_id: oreItem.id })
      .first();

    if (existing) {
      await db('player_inventory')
        .where({ player_id: playerId, item_id: oreItem.id })
        .increment('quantity', 1);
    } else {
      await db('player_inventory').insert({
        player_id: playerId,
        item_id: oreItem.id,
        quantity: 1,
      });
    }

    // Award XP (ores give more XP than rocks)
    const oreXp = Math.floor(ore.level_required * 1.2) + 15;
    await db('player_skills')
      .where({ player_id: playerId, skill_id: miningSkill.id })
      .increment('xp', oreXp);

    // Deplete vein
    const newRemaining = vein.remaining_quantity - 1;
    if (newRemaining <= 0) {
      await db('ore_veins').where({ id: veinId }).update({
        remaining_quantity: 0,
        is_depleted: true,
      });

      // Notify all players at this location that vein is depleted
      io.to(`location_${vein.location_id}`).emit('vein_depleted', {
        veinId,
        oreName: ore.name,
        locationId: vein.location_id,
      });

      logger.info(`Vein ${veinId} (${ore.name}) depleted at location ${vein.location_id}`);
    } else {
      await db('ore_veins').where({ id: veinId }).update({
        remaining_quantity: newRemaining,
      });
    }

    // Exploration XP for first time mining this ore
    const discoveryKey = `mining_ore_${ore.subtype}`;
    const alreadyDiscovered = await db('player_exploration')
      .where({ player_id: playerId, discovery_type: 'ore', discovery_key: discoveryKey })
      .first();

    if (!alreadyDiscovered) {
      const explorationXp = ore.level_required * 8;
      await db('player_exploration').insert({
        player_id: playerId,
        discovery_type: 'ore',
        discovery_key: discoveryKey,
        xp_awarded: explorationXp,
      });
      const explorationSkill = await db('skills').where({ name: 'Exploration' }).first();
      await db('player_skills')
        .where({ player_id: playerId, skill_id: explorationSkill.id })
        .increment('xp', explorationXp);
    }

    logger.info(`Player ${playerId} mined ${oreItem.name} from vein ${veinId} (${newRemaining} remaining)`);
    return {
      success: true,
      itemName: oreItem.name,
      xpAwarded: oreXp,
    };

  } catch (err) {
    logger.error(`Mining vein error for player ${playerId}: ${err}`);
    return { success: false, error: 'Server error' };
  }
}

// Discover a new vein
async function discoverVein(
  playerId: number,
  nodeId: number,
  playerLevel: number,
  locationId: number
): Promise<{ oreName: string } | null> {
  try {
    // Don't discover new veins if active ones already exist at this location
    const existingVeins = await db('ore_veins')
      .where({ location_id: locationId, is_depleted: false })
      .count('id as count')
      .first();

    if (parseInt(existingVeins?.count as string) > 0) {
      return null;
    }

    const node = await db('resource_nodes').where({ id: nodeId }).first();

    // Get eligible ores based on player level
    const eligibleOres = await db('items')
      .where({ type: 'ore' })
      .whereNull('quality')
      .where('level_required', '<=', playerLevel + 5)
      .orderBy('level_required', 'asc');

    if (eligibleOres.length === 0) return null;

    const ore = eligibleOres[Math.floor(Math.random() * eligibleOres.length)];

    const quantity = Math.floor(Math.random() * (node.max_vein_quantity - node.min_vein_quantity + 1)) + node.min_vein_quantity;
    const now = new Date();
    const announceAt = new Date(now.getTime() + VEIN_ANNOUNCE_DELAY);

    await db('ore_veins').insert({
      location_id: locationId,
      ore_item_id: ore.id,
      total_quantity: quantity,
      remaining_quantity: quantity,
      discovered_by_player_id: playerId,
      discovered_at: now,
      announced_at: announceAt,
      is_announced: false,
      is_dense: false,
      is_depleted: false,
    });

    io.to(`player_${playerId}`).emit('vein_discovered', {
      oreName: ore.name,
      quantity,
      privateWindow: VEIN_ANNOUNCE_DELAY / 1000 / 60,
    });

    logger.info(`Player ${playerId} discovered ${ore.name} vein (${quantity} ore) at location ${locationId}`);
    return { oreName: ore.name };

  } catch (err) {
    logger.error(`Vein discovery error: ${err}`);
    return null;
  }
}

// Called by game tick to announce veins whose timer has expired
export async function checkVeinAnnouncements(): Promise<void> {
  const now = new Date();

  const unannounced = await db('ore_veins')
    .where({ is_announced: false, is_depleted: false })
    .where('announced_at', '<=', now);

  for (const vein of unannounced) {
    await db('ore_veins').where({ id: vein.id }).update({ is_announced: true });

    const ore = await db('items').where({ id: vein.ore_item_id }).first();
    const location = await db('locations').where({ id: vein.location_id }).first();

    // Announce to all players at this location
    io.to(`location_${vein.location_id}`).emit('vein_announced', {
      veinId: vein.id,
      oreName: ore.name,
      remainingQuantity: vein.remaining_quantity,
      locationName: location.name,
    });

    // Also send as a region event
    io.emit('region_event', {
      message: `A ${ore.name} vein has been discovered at ${location.name}!`,
      type: 'mining',
    });

    logger.info(`Vein ${vein.id} (${ore.name}) announced at ${location.name}`);
  }
}