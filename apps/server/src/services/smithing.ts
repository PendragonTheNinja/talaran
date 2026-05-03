import db from '../db';
import { levelFromXp, xpToNextLevel } from './xp';
import { logger } from '../lib/logger';
import { incrementStats } from './stats';

const KILN_LOGS_PER_BATCH = 20;
const KILN_CHARC_PER_BATCH = 60;
const KILN_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
const CHARC_XP_PER_BATCH = 50; // 10% of total smithing XP feel

export interface SmithingResult {
  success: boolean;
  itemName?: string;
  quantity?: number;
  xpAwarded?: number;
  error?: string;
}

// ── Workstation ───────────────────────────────────────────────────

export async function getWorkstation(playerId: number, locationId: number): Promise<any> {
  return db('workstations')
    .where({ player_id: playerId, location_id: locationId, type: 'smithing' })
    .first();
}

export async function setupWorkstation(playerId: number, locationId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await getWorkstation(playerId, locationId);
    if (existing) return { success: false, error: 'You already have a workstation here.' };

    // Check player has the required items in inventory
    const required = ['Ambren Anvil', 'Ambren Hammer', 'Ambren Tongs', 'Lanai Bucket'];
    for (const itemName of required) {
      const item = await db('items').where({ name: itemName }).first();
      if (!item) continue;
      const inv = await db('player_inventory')
        .where({ player_id: playerId, item_id: item.id })
        .first();
      if (!inv || inv.quantity < 1) {
        return { success: false, error: `You need a ${itemName} to set up your workstation.` };
      }
    }

    // Remove tools from inventory and create workstation
    for (const itemName of required) {
      const item = await db('items').where({ name: itemName }).first();
      if (!item) continue;
      const inv = await db('player_inventory')
        .where({ player_id: playerId, item_id: item.id })
        .first();
      if (inv.quantity <= 1) {
        await db('player_inventory').where({ player_id: playerId, item_id: item.id }).delete();
      } else {
        await db('player_inventory').where({ player_id: playerId, item_id: item.id }).decrement('quantity', 1);
      }
    }

    await db('workstations').insert({
      player_id: playerId,
      location_id: locationId,
      type: 'smithing',
      tier: 1,
      has_anvil: true,
      has_hammer: true,
      has_tongs: true,
      has_bucket: true,
      is_active: true,
    });

    logger.info(`Player ${playerId} set up smithing workstation at location ${locationId}`);
    return { success: true };
  } catch (err) {
    logger.error(`Setup workstation error: ${err}`);
    return { success: false, error: 'Server error' };
  }
}

// ── Kiln ──────────────────────────────────────────────────────────

export async function loadKiln(playerId: number, locationId: number, logCount: number): Promise<{ success: boolean; readyAt?: Date; error?: string; maxLogs?: number }> {
  try {
    // Get player smithing level
    const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: smithingSkill.id })
      .first();
    const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;

    // Calculate max batches based on level
    const maxBatches = playerLevel >= 40 ? 5
      : playerLevel >= 30 ? 4
      : playerLevel >= 20 ? 3
      : playerLevel >= 10 ? 2
      : 1;
    const maxLogs = maxBatches * KILN_LOGS_PER_BATCH;

    if (logCount % KILN_LOGS_PER_BATCH !== 0 || logCount <= 0) {
      return { success: false, error: `You must add logs in multiples of ${KILN_LOGS_PER_BATCH}.`, maxLogs };
    }

    if (logCount > maxLogs) {
      return { success: false, error: `Your Smithing level only allows ${maxBatches} batch${maxBatches > 1 ? 'es' : ''} (${maxLogs} logs maximum).`, maxLogs };
    }

    // Check for existing active kiln job
    const existing = await db('kiln_jobs')
      .where({ player_id: playerId, location_id: locationId, is_collected: false })
      .first();
    if (existing) {
      return { success: false, error: 'Your kiln is already burning. Collect the Charc first.' };
    }

    // Find any log in inventory
    const logItem = await db('player_inventory')
      .join('items', 'player_inventory.item_id', 'items.id')
      .where({ 'player_inventory.player_id': playerId, 'items.type': 'log' })
      .select('player_inventory.*', 'items.name as item_name')
      .first();

    if (!logItem || logItem.quantity < logCount) {
      return { success: false, error: `You need ${logCount} logs to load the kiln.` };
    }

    // Remove logs from inventory
    if (logItem.quantity <= logCount) {
      await db('player_inventory').where({ id: logItem.id }).delete();
    } else {
      await db('player_inventory').where({ id: logItem.id }).decrement('quantity', logCount);
    }

    const batches = logCount / KILN_LOGS_PER_BATCH;
    const charcYield = batches * KILN_CHARC_PER_BATCH;
    const xpReward = batches * CHARC_XP_PER_BATCH;
    const now = new Date();
    const readyAt = new Date(now.getTime() + KILN_DURATION_MS);

    await db('kiln_jobs').insert({
      player_id: playerId,
      location_id: locationId,
      logs_added: logCount,
      charc_yield: charcYield,
      xp_reward: xpReward,
      started_at: now,
      ready_at: readyAt,
      is_collected: false,
    });

    logger.info(`Player ${playerId} loaded kiln with ${logCount} logs, ${charcYield} Charc ready at ${readyAt}`);
    return { success: true, readyAt };
  } catch (err) {
    logger.error(`Load kiln error: ${err}`);
    return { success: false, error: 'Server error' };
  }
}

export async function collectKiln(playerId: number, locationId: number): Promise<SmithingResult> {
  try {
    const job = await db('kiln_jobs')
      .where({ player_id: playerId, location_id: locationId, is_collected: false })
      .first();

    if (!job) return { success: false, error: 'You have no active kiln job here.' };

    const now = new Date();
    if (now < new Date(job.ready_at)) {
      const remaining = Math.ceil((new Date(job.ready_at).getTime() - now.getTime()) / 60000);
      return { success: false, error: `Your Charc is not ready yet. ${remaining} minutes remaining.` };
    }

    // Award Charc
    const charc = await db('items').where({ name: 'Charc' }).first();
    const existing = await db('player_inventory')
      .where({ player_id: playerId, item_id: charc.id })
      .first();

    if (existing) {
      await db('player_inventory')
        .where({ player_id: playerId, item_id: charc.id })
        .increment('quantity', job.charc_yield);
    } else {
      await db('player_inventory').insert({
        player_id: playerId,
        item_id: charc.id,
        quantity: job.charc_yield,
      });
    }

    // Award XP
    const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
    await db('player_skills')
      .where({ player_id: playerId, skill_id: smithingSkill.id })
      .increment('xp', job.xp_reward);

    await db('kiln_jobs').where({ id: job.id }).update({ is_collected: true });

    logger.info(`Player ${playerId} collected ${job.charc_yield} Charc from kiln`);
    return {
      success: true,
      itemName: 'Charc',
      quantity: job.charc_yield,
      xpAwarded: job.xp_reward,
    };
  } catch (err) {
    logger.error(`Collect kiln error: ${err}`);
    return { success: false, error: 'Server error' };
  }
}

export async function getKilnStatus(playerId: number, locationId: number): Promise<any> {
  const job = await db('kiln_jobs')
    .where({ player_id: playerId, location_id: locationId, is_collected: false })
    .first();

  if (!job) return null;

  const now = new Date();
  const ready = now >= new Date(job.ready_at);
  const minutesRemaining = ready ? 0 : Math.ceil((new Date(job.ready_at).getTime() - now.getTime()) / 60000);

  return {
    logsAdded: job.logs_added,
    charcYield: job.charc_yield,
    readyAt: job.ready_at,
    isReady: ready,
    minutesRemaining,
  };
}

// ── Smelting ──────────────────────────────────────────────────────

export async function canSmithHere(playerId: number, locationId: number): Promise<{ allowed: boolean; error?: string }> {
  const workstation = await getWorkstation(playerId, locationId);
  if (!workstation || !workstation.is_active) {
    return { allowed: false, error: 'You need an active smithing workstation here. Set one up first.' };
  }
  return { allowed: true };
}

export async function smeltIngots(
  playerId: number,
  locationId: number,
  metalType: string
): Promise<SmithingResult> {
  try {
    const canSmith = await canSmithHere(playerId, locationId);
    if (!canSmith.allowed) return { success: false, error: canSmith.error };

    const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: smithingSkill.id })
      .first();
    const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;

    // Get recipe based on metal type
    const recipe = SMELT_RECIPES[metalType];
    if (!recipe) return { success: false, error: 'Unknown metal type.' };

    if (playerLevel < recipe.requiredLevel) {
      return { success: false, error: `You need Smithing level ${recipe.requiredLevel} to smelt ${metalType}.` };
    }

    // Check ingredients
    for (const ingredient of recipe.ingredients) {
      const item = await db('items').where({ name: ingredient.name }).first();
      if (!item) return { success: false, error: `Required item not found: ${ingredient.name}` };
      const inv = await db('player_inventory')
        .where({ player_id: playerId, item_id: item.id })
        .first();
      if (!inv || inv.quantity < ingredient.quantity) {
        return { success: false, error: `You need ${ingredient.quantity}x ${ingredient.name}.` };
      }
    }

    // Remove ingredients
    for (const ingredient of recipe.ingredients) {
      const item = await db('items').where({ name: ingredient.name }).first();
      const inv = await db('player_inventory')
        .where({ player_id: playerId, item_id: item.id })
        .first();
      if (inv.quantity <= ingredient.quantity) {
        await db('player_inventory').where({ player_id: playerId, item_id: item.id }).delete();
      } else {
        await db('player_inventory').where({ player_id: playerId, item_id: item.id }).decrement('quantity', ingredient.quantity);
      }
    }

    // Award ingots
    const ingotItem = await db('items').where({ name: recipe.output }).first();
    const existingIngot = await db('player_inventory')
      .where({ player_id: playerId, item_id: ingotItem.id })
      .first();

    if (existingIngot) {
      await db('player_inventory')
        .where({ player_id: playerId, item_id: ingotItem.id })
        .increment('quantity', recipe.outputQuantity);
    } else {
      await db('player_inventory').insert({
        player_id: playerId,
        item_id: ingotItem.id,
        quantity: recipe.outputQuantity,
      });
    }

    // Award XP
    await db('player_skills')
      .where({ player_id: playerId, skill_id: smithingSkill.id })
      .increment('xp', recipe.xp);

    await incrementStats(playerId, {
      total_actions_completed: 1,
      total_xp_earned: recipe.xp,
    });

    logger.info(`Player ${playerId} smelted ${recipe.outputQuantity}x ${recipe.output}`);
    return {
      success: true,
      itemName: recipe.output,
      quantity: recipe.outputQuantity,
      xpAwarded: recipe.xp,
    };
  } catch (err) {
    logger.error(`Smelt error: ${err}`);
    return { success: false, error: 'Server error' };
  }
}

// ── Smith parts ───────────────────────────────────────────────────

export async function smithPart(
  playerId: number,
  locationId: number,
  partType: string,
  metalType: string
): Promise<SmithingResult> {
  try {
    const canSmith = await canSmithHere(playerId, locationId);
    if (!canSmith.allowed) return { success: false, error: canSmith.error };

    const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: smithingSkill.id })
      .first();
    const playerLevel = playerSkill ? levelFromXp(parseInt(playerSkill.xp)) : 1;

    const recipe = SMITH_RECIPES[`${metalType}_${partType}`];
    if (!recipe) return { success: false, error: 'Unknown recipe.' };

    if (playerLevel < recipe.requiredLevel) {
      return { success: false, error: `You need Smithing level ${recipe.requiredLevel}.` };
    }

    // Check ingredients
    for (const ingredient of recipe.ingredients) {
      const item = await db('items').where({ name: ingredient.name }).first();
      if (!item) return { success: false, error: `Required item not found: ${ingredient.name}` };
      const inv = await db('player_inventory')
        .where({ player_id: playerId, item_id: item.id })
        .first();
      if (!inv || inv.quantity < ingredient.quantity) {
        return { success: false, error: `You need ${ingredient.quantity}x ${ingredient.name}.` };
      }
    }

    // Remove ingredients
    for (const ingredient of recipe.ingredients) {
      const item = await db('items').where({ name: ingredient.name }).first();
      const inv = await db('player_inventory')
        .where({ player_id: playerId, item_id: item.id })
        .first();
      if (inv.quantity <= ingredient.quantity) {
        await db('player_inventory').where({ player_id: playerId, item_id: item.id }).delete();
      } else {
        await db('player_inventory').where({ player_id: playerId, item_id: item.id }).decrement('quantity', ingredient.quantity);
      }
    }

    // Create tool part
    const partItem = await db('items').where({ name: recipe.output }).first();
    const newPart = await db('tool_parts').insert({
      player_id: playerId,
      part_type: partType,
      tool_type: recipe.toolType,
      tier: recipe.tier,
      item_id: partItem.id,
      max_durability: recipe.durability,
      current_durability: recipe.durability,
      is_broken: false,
      in_inventory: true,
    }).returning('*');

    // Also add to player inventory as item
    const existingPart = await db('player_inventory')
      .where({ player_id: playerId, item_id: partItem.id })
      .first();
    if (existingPart) {
      await db('player_inventory')
        .where({ player_id: playerId, item_id: partItem.id })
        .increment('quantity', 1);
    } else {
      await db('player_inventory').insert({
        player_id: playerId,
        item_id: partItem.id,
        quantity: 1,
      });
    }

    // Award XP
    await db('player_skills')
      .where({ player_id: playerId, skill_id: smithingSkill.id })
      .increment('xp', recipe.xp);

    await incrementStats(playerId, {
      total_actions_completed: 1,
      total_xp_earned: recipe.xp,
    });

    logger.info(`Player ${playerId} smithed ${recipe.output}`);
    return {
      success: true,
      itemName: recipe.output,
      quantity: 1,
      xpAwarded: recipe.xp,
    };
  } catch (err) {
    logger.error(`Smith part error: ${err}`);
    return { success: false, error: 'Server error' };
  }
}

// ── Combine tool ──────────────────────────────────────────────────

export async function combineTool(
  playerId: number,
  toolName: string,
  headPartId: number,
  rodPartId: number,
): Promise<{ success: boolean; toolInstanceId?: number; error?: string }> {
  try {
    const head = await db('tool_parts').where({ id: headPartId, player_id: playerId, in_inventory: true }).first();
    const rod = await db('tool_parts').where({ id: rodPartId, player_id: playerId, in_inventory: true }).first();

    if (!head) return { success: false, error: 'Pickaxe head not found in your inventory.' };
    if (!rod) return { success: false, error: 'Tool rod not found in your inventory.' };
    if (head.is_broken) return { success: false, error: 'That head is broken.' };
    if (rod.is_broken) return { success: false, error: 'That rod is broken.' };

    // Check leather strips
    const leatherStrips = await db('items').where({ name: 'Leather Strips' }).first();
    const strips = await db('player_inventory')
      .where({ player_id: playerId, item_id: leatherStrips.id })
      .first();
    if (!strips || strips.quantity < 1) {
      return { success: false, error: 'You need Leather Strips to bind the tool.' };
    }

    // Remove leather strips
    if (strips.quantity <= 1) {
      await db('player_inventory').where({ player_id: playerId, item_id: leatherStrips.id }).delete();
    } else {
      await db('player_inventory').where({ player_id: playerId, item_id: leatherStrips.id }).decrement('quantity', 1);
    }

    // Remove part items from inventory
    const headItem = await db('items').where({ id: head.item_id }).first();
    const rodItem = await db('items').where({ id: rod.item_id }).first();

    for (const item of [headItem, rodItem]) {
      const inv = await db('player_inventory').where({ player_id: playerId, item_id: item.id }).first();
      if (inv) {
        if (inv.quantity <= 1) {
          await db('player_inventory').where({ player_id: playerId, item_id: item.id }).delete();
        } else {
          await db('player_inventory').where({ player_id: playerId, item_id: item.id }).decrement('quantity', 1);
        }
      }
    }

    // Mark parts as attached
    await db('tool_parts').where({ id: headPartId }).update({ in_inventory: false });
    await db('tool_parts').where({ id: rodPartId }).update({ in_inventory: false });

    // Create tool instance
    const [toolInstance] = await db('tool_instances').insert({
      player_id: playerId,
      name: toolName,
      tool_type: head.tool_type,
      tier: head.tier,
      head_part_id: headPartId,
      rod_part_id: rodPartId,
      total_actions: 0,
      is_equipped: false,
      is_broken: false,
    }).returning('*');

    // Add finished tool to inventory as item
    const toolItemName = head.tool_type === 'pickaxe'
      ? `${tierName(head.tier)} Pickaxe`
      : `${tierName(head.tier)} Hatchet`;

    const toolItem = await db('items').where({ name: toolItemName }).first();
    if (toolItem) {
      const existingTool = await db('player_inventory')
        .where({ player_id: playerId, item_id: toolItem.id })
        .first();
      if (existingTool) {
        await db('player_inventory').where({ player_id: playerId, item_id: toolItem.id }).increment('quantity', 1);
      } else {
        await db('player_inventory').insert({ player_id: playerId, item_id: toolItem.id, quantity: 1 });
      }
    }

    logger.info(`Player ${playerId} combined tool: ${toolName}`);
    return { success: true, toolInstanceId: toolInstance.id };
  } catch (err) {
    logger.error(`Combine tool error: ${err}`);
    return { success: false, error: 'Server error' };
  }
}

function tierName(tier: number): string {
  const names: Record<number, string> = {
    1: 'Ambren', 2: 'Serph', 3: 'Azulyss', 4: 'Pylerial',
    5: 'Midrath', 6: 'Thaeldavast', 7: 'Ghaal', 8: 'Runafax', 9: 'Talamir',
  };
  return names[tier] || 'Unknown';
}

// ── Recipes ───────────────────────────────────────────────────────

interface Ingredient {
  name: string;
  quantity: number;
}

interface SmeltRecipe {
  ingredients: Ingredient[];
  output: string;
  outputQuantity: number;
  requiredLevel: number;
  xp: number;
}

interface SmithRecipe {
  ingredients: Ingredient[];
  output: string;
  toolType: string;
  tier: number;
  durability: number;
  requiredLevel: number;
  xp: number;
}

export const SMELT_RECIPES: Record<string, SmeltRecipe> = {
  'ambren': {
    ingredients: [
      { name: 'Ambren Ore', quantity: 1 },
      { name: 'Burgh Ore',  quantity: 1 },
      { name: 'Charc',      quantity: 2 },
    ],
    output: 'Ambren Ingot',
    outputQuantity: 2,
    requiredLevel: 1,
    xp: 30,
  },
};

export const SMITH_RECIPES: Record<string, SmithRecipe> = {
  'ambren_pickaxe_head': {
    ingredients: [{ name: 'Ambren Ingot', quantity: 2 }],
    output: 'Ambren Pickaxe Head',
    toolType: 'pickaxe',
    tier: 1,
    durability: 300,
    requiredLevel: 1,
    xp: 60,
  },
  'ambren_hatchet_head': {
    ingredients: [{ name: 'Ambren Ingot', quantity: 2 }],
    output: 'Ambren Hatchet Head',
    toolType: 'hatchet',
    tier: 1,
    durability: 300,
    requiredLevel: 1,
    xp: 60,
  },
  'ambren_tool_rod': {
    ingredients: [{ name: 'Ambren Ingot', quantity: 1 }],
    output: 'Ambren Tool Rod',
    toolType: 'any',
    tier: 1,
    durability: 500,
    requiredLevel: 1,
    xp: 40,
  },
};