import { Server } from 'socket.io';
import db from '../db';
import { logger } from '../index';
import { processWoodcuttingAction, calculateTimer } from './woodcutting';
import { levelFromXp, xpToNextLevel } from './xp';
import { processMiningRock, processMiningVein, checkVeinAnnouncements } from './mining';
import { smeltIngots, smithPart, collectKiln, SMELT_RECIPES, SMITH_RECIPES } from './smithing';

const TICK_INTERVAL = 2000;
const BOT_CHECK_INTERVAL = 30 * 60 * 1000;

export function startGameTick(io: Server): void {
  logger.info('Game tick started');

  setInterval(async () => {
    try {
      await checkVeinAnnouncements();
      const completedActions = await db('player_actions')
        .where('completes_at', '<=', new Date())
        .where('bot_check_pending', false);
      for (const action of completedActions) {
        await processCompletedAction(io, action);
      }
    } catch (err) {
      logger.error(`Game tick error: ${err}`);
    }
  }, TICK_INTERVAL);
}

async function processTravelAction(playerId: number, locationId: number): Promise<any> {
  try {
    await db('players').where({ id: playerId }).update({ current_location_id: locationId });
    const location = await db('locations').where({ id: locationId }).first();
    logger.info(`Player ${playerId} arrived at ${location.name}`);
    return { success: true, locationName: location.name };
  } catch (err) {
    logger.error(`Travel completion error: ${err}`);
    return { success: false };
  }
}

async function processCompletedAction(io: Server, action: any): Promise<void> {
  try {
    let result: any;

    switch (action.action_type) {
      case 'woodcutting':
        result = await processWoodcuttingAction(action.player_id, action.resource_node_id);
        break;
      case 'traveling':
        result = await processTravelAction(action.player_id, action.location_id);
        break;
      case 'mining_rock':
        result = await processMiningRock(action.player_id, action.resource_node_id);
        break;
      case 'mining_vein':
        result = await processMiningVein(action.player_id, action.action_data);
        break;
      case 'smelting':
        result = await smeltIngots(action.player_id, action.location_id, action.action_data);
        break;
      case 'smithing':
        result = await smithPart(
          action.player_id,
          action.location_id,
          action.action_data.split('_').slice(1).join('_'),
          action.action_data.split('_')[0]
        );
        break;
      case 'kiln_collect':
        result = await collectKiln(action.player_id, action.location_id);
        break;
      default:
        logger.warn(`Unknown action type: ${action.action_type}`);
        await db('player_actions').where({ id: action.id }).delete();
        return;
    }

    const now = new Date();
    const lastBotCheck = action.last_bot_check ? new Date(action.last_bot_check) : new Date(action.started_at);
    const timeSinceCheck = now.getTime() - lastBotCheck.getTime();
    const botCheckDue = timeSinceCheck >= BOT_CHECK_INTERVAL;

    if (botCheckDue) {
      await db('player_actions').where({ id: action.id }).update({ bot_check_pending: true });
      io.to(`player_${action.player_id}`).emit('bot_check_required', {
        message: 'Please confirm you are still playing.',
      });
      logger.info(`Bot check triggered for player ${action.player_id}`);
      return;
    }

    // Handle travel
    if (action.action_type === 'traveling') {
      await db('player_actions').where({ id: action.id }).delete();
      io.to(`player_${action.player_id}`).emit('travel_complete', { result });
      return;
    }

    // Handle failed actions
    if (!result.success) {
      await db('player_actions').where({ id: action.id }).delete();
      io.to(`player_${action.player_id}`).emit('action_failed', {
        error: result.error || 'Action failed',
      });
      return;
    }

    // Handle vein mining (no resource_node_id)
    if (action.action_type === 'mining_vein') {
      const vein = await db('ore_veins').where({ id: action.action_data }).first();
      if (!vein || vein.is_depleted) {
  // Find the rock node at this location and auto-restart
  const rockNode = await db('resource_nodes')
    .where({ location_id: action.location_id, skill: 'mining' })
    .first();

  if (rockNode) {
    const miningSkill = await db('skills').where({ name: 'Mining' }).first();
    const playerSkillRow = await db('player_skills')
      .where({ player_id: action.player_id, skill_id: miningSkill.id })
      .first();
    const playerLevel = levelFromXp(playerSkillRow?.xp ? parseInt(playerSkillRow.xp) : 0);

    const equipment = await db('player_equipment').where({ player_id: action.player_id }).first();
    const tool = equipment?.mainhand_item_id
      ? await db('items').where({ id: equipment.mainhand_item_id }).first()
      : null;

    const nextTimer = calculateTimer(
      rockNode.base_timer,
      rockNode.min_timer,
      playerLevel,
      rockNode.required_level,
      tool ? tool.tier : 1,
      rockNode.required_tool_tier
    );

    const nextCompletion = new Date(now.getTime() + nextTimer * 1000);

    await db('player_actions').where({ id: action.id }).update({
      action_type: 'mining_rock',
      resource_node_id: rockNode.id,
      action_data: null,
      completes_at: nextCompletion,
    });

    io.to(`player_${action.player_id}`).emit('vein_depleted', {
      oreName: vein ? (await db('items').where({ id: vein.ore_item_id }).first())?.name : 'Unknown',
    });

    io.to(`player_${action.player_id}`).emit('action_switched', {
      newActionType: 'mining_rock',
      nodeName: rockNode.name,
      timerSeconds: nextTimer,
    });
  } else {
    await db('player_actions').where({ id: action.id }).delete();
    io.to(`player_${action.player_id}`).emit('vein_depleted', {
      oreName: 'Unknown',
    });
  }
  return;
}

      const miningSkill = await db('skills').where({ name: 'Mining' }).first();
      const playerSkillRow = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: miningSkill.id })
        .first();
      const playerLevel = levelFromXp(playerSkillRow?.xp ? parseInt(playerSkillRow.xp) : 0);
      const nextTimer = Math.max(3, Math.round(8 * (1 - Math.min(0.5, (playerLevel - 1) * 0.005))));
      const nextCompletion = new Date(now.getTime() + nextTimer * 1000);

      await db('player_actions').where({ id: action.id }).update({ completes_at: nextCompletion });

      const updatedSkill = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: miningSkill.id })
        .first();
      const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
      const previousXp = currentXp - (result.xpAwarded || 0);
      const currentLevel = levelFromXp(currentXp);
      const previousLevel = levelFromXp(previousXp);
      const leveledUp = currentLevel > previousLevel;
      const xpNeeded = xpToNextLevel(currentXp);

      const updatedVein = await db('ore_veins').where({ id: action.action_data }).first();

      io.to(`player_${action.player_id}`).emit('action_complete', {
        actionType: action.action_type,
        result: {
          ...result,
          remainingQuantity: updatedVein?.remaining_quantity ?? 0,
        },
        nextCompletes: nextCompletion,
        timerSeconds: nextTimer,
        xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp },
      });
      return;
    }

    if (action.action_type === 'smelting' || action.action_type === 'smithing') {
  // Check resources before restarting timer
  const recipe = action.action_type === 'smelting'
    ? SMELT_RECIPES[action.action_data]
    : SMITH_RECIPES[action.action_data];

  if (recipe) {
    for (const ingredient of recipe.ingredients) {
      const item = await db('items').where({ name: ingredient.name }).first();
      const inv = item ? await db('player_inventory')
        .where({ player_id: action.player_id, item_id: item.id })
        .first() : null;
      if (!inv || inv.quantity < ingredient.quantity) {
        await db('player_actions').where({ id: action.id }).delete();

        const smithingSkill2 = await db('skills').where({ name: 'Smithing' }).first();
        const lastSkill = await db('player_skills')
          .where({ player_id: action.player_id, skill_id: smithingSkill2.id })
          .first();
        const lastXp = lastSkill ? parseInt(lastSkill.xp.toString()) : 0;
        const lastLevel = levelFromXp(lastXp);
        const lastXpNeeded = xpToNextLevel(lastXp);

        io.to(`player_${action.player_id}`).emit('action_complete', {
          actionType: action.action_type,
          result,
          nextCompletes: null,
          timerSeconds: 0,
          xpInfo: { totalXp: lastXp, level: lastLevel, xpToNext: lastXpNeeded, leveledUp: false },
        });

        io.to(`player_${action.player_id}`).emit('action_failed', {
          error: `You need ${ingredient.quantity}x ${ingredient.name}.`,
        });
        return;
      }
    }
  }

  const timerSeconds = action.action_type === 'smelting' ? 10 : 20;
  const nextCompletion = new Date(now.getTime() + timerSeconds * 1000);

  await db('player_actions').where({ id: action.id }).update({ completes_at: nextCompletion });

  const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
  const updatedSkill = await db('player_skills')
    .where({ player_id: action.player_id, skill_id: smithingSkill.id })
    .first();
  const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
  const previousXp = currentXp - (result.xpAwarded || 0);
  const currentLevel = levelFromXp(currentXp);
  const previousLevel = levelFromXp(previousXp);
  const leveledUp = currentLevel > previousLevel;
  const xpNeeded = xpToNextLevel(currentXp);

  io.to(`player_${action.player_id}`).emit('action_complete', {
    actionType: action.action_type,
    result,
    nextCompletes: nextCompletion,
    timerSeconds,
    xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp },
  });
  return;
}

    // Handle woodcutting and mining_rock (have resource_node_id)
    if (result.success && action.auto_restart) {
      const node = await db('resource_nodes').where({ id: action.resource_node_id }).first();
      if (!node) {
        await db('player_actions').where({ id: action.id }).delete();
        return;
      }

      const skillName = action.action_type === 'mining_rock' ? 'Mining' : 'Woodcutting';
      const relevantSkill = await db('skills').where({ name: skillName }).first();
      const playerSkillRow = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: relevantSkill.id })
        .first();
      const playerLevel = levelFromXp(playerSkillRow?.xp ? parseInt(playerSkillRow.xp) : 0);

      const equipment = await db('player_equipment').where({ player_id: action.player_id }).first();
      const tool = equipment?.mainhand_item_id
        ? await db('items').where({ id: equipment.mainhand_item_id }).first()
        : null;

      const nextTimer = calculateTimer(
        node.base_timer,
        node.min_timer,
        playerLevel,
        node.required_level,
        tool ? tool.tier : 1,
        node.required_tool_tier
      );

      const nextCompletion = new Date(now.getTime() + nextTimer * 1000);
      await db('player_actions').where({ id: action.id }).update({ completes_at: nextCompletion });

      const updatedSkill = await db('player_skills')
        .where({ player_id: action.player_id, skill_id: relevantSkill.id })
        .first();
      const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
      const previousXp = currentXp - (result.xpAwarded || 0);
      const currentLevel = levelFromXp(currentXp);
      const previousLevel = levelFromXp(previousXp);
      const leveledUp = currentLevel > previousLevel;
      const xpNeeded = xpToNextLevel(currentXp);

      io.to(`player_${action.player_id}`).emit('action_complete', {
        actionType: action.action_type,
        result,
        nextCompletes: nextCompletion,
        timerSeconds: nextTimer,
        xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp },
      });

    } else if (!action.auto_restart) {
  await db('player_actions').where({ id: action.id }).delete();

  if (action.action_type === 'kiln_collect' && result.success) {
    const smithingSkill = await db('skills').where({ name: 'Smithing' }).first();
    const updatedSkill = await db('player_skills')
      .where({ player_id: action.player_id, skill_id: smithingSkill.id })
      .first();
    const currentXp = updatedSkill ? parseInt(updatedSkill.xp.toString()) : 0;
    const previousXp = currentXp - (result.xpAwarded || 0);
    const currentLevel = levelFromXp(currentXp);
    const previousLevel = levelFromXp(previousXp);
    const leveledUp = currentLevel > previousLevel;
    const xpNeeded = xpToNextLevel(currentXp);

    io.to(`player_${action.player_id}`).emit('action_complete', {
      actionType: action.action_type,
      result,
      nextCompletes: null,
      timerSeconds: 0,
      xpInfo: { totalXp: currentXp, level: currentLevel, xpToNext: xpNeeded, leveledUp },
    });
  } else {
    io.to(`player_${action.player_id}`).emit('action_complete', {
      actionType: action.action_type,
      result,
      nextCompletes: null,
    });
  }
}

  } catch (err) {
    logger.error(`Error processing action ${action.id}: ${err}`);
  }
}