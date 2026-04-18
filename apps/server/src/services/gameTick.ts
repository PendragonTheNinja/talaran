import { Server } from 'socket.io';
import db from '../db';
import { logger } from '../index';
import { processWoodcuttingAction } from './woodcutting';
import { canChopHere, calculateTimer } from './woodcutting';
import { levelFromXp, xpToNextLevel } from './xp';

const TICK_INTERVAL = 2000; // check every 2 seconds
const BOT_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes in ms

export function startGameTick(io: Server): void {
  logger.info('Game tick started');

  setInterval(async () => {
    try {
      // Find all actions that have completed
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

async function processCompletedAction(io: Server, action: any): Promise<void> {
  try {
    let result;

    switch (action.action_type) {
      case 'woodcutting':
        result = await processWoodcuttingAction(action.player_id, action.resource_node_id);
        break;
      default:
        logger.warn(`Unknown action type: ${action.action_type}`);
        await db('player_actions').where({ id: action.id }).delete();
        return;
    }

    // Check if bot check is due
    const now = new Date();
    const lastBotCheck = action.last_bot_check ? new Date(action.last_bot_check) : new Date(action.started_at);
    const timeSinceCheck = now.getTime() - lastBotCheck.getTime();
    const botCheckDue = timeSinceCheck >= BOT_CHECK_INTERVAL;

    if (botCheckDue) {
      // Pause action and send bot check to client
      await db('player_actions')
        .where({ id: action.id })
        .update({ bot_check_pending: true });

      io.to(`player_${action.player_id}`).emit('bot_check_required', {
        message: 'Please confirm you are still playing.',
      });

      logger.info(`Bot check triggered for player ${action.player_id}`);
      return;
    }

    if (result.success && action.auto_restart) {
      // Calculate next timer
      const node = await db('resource_nodes').where({ id: action.resource_node_id }).first();
      const woodcuttingSkill = await db('skills').where({ name: 'Woodcutting' }).first();
const playerSkill = await db('player_skills')
  .where({ player_id: action.player_id, skill_id: woodcuttingSkill.id })
  .first();

const playerLevel = levelFromXp(playerSkill?.xp ? parseInt(playerSkill.xp) : 0);
      const axe = await db('player_inventory')
        .join('items', 'player_inventory.item_id', 'items.id')
        .where({ 'player_inventory.player_id': action.player_id, 'items.subtype': 'axe' })
        .orderBy('items.tier', 'desc')
        .first();

      const nextTimer = calculateTimer(
        node.base_timer,
        node.min_timer,
        playerLevel,
        node.required_level,
        axe ? axe.tier : 1,
        node.required_tool_tier
      );

      const nextCompletion = new Date(now.getTime() + nextTimer * 1000);

      await db('player_actions')
        .where({ id: action.id })
        .update({ completes_at: nextCompletion });

      // Get updated XP after the action
const updatedSkill = await db('player_skills')
  .where({ player_id: action.player_id, skill_id: woodcuttingSkill.id })
  .first();

const currentXp = updatedSkill ? parseInt(updatedSkill.xp) : 0;
const currentLevel = levelFromXp(currentXp);
const xpNeeded = xpToNextLevel(currentXp);

io.to(`player_${action.player_id}`).emit('action_complete', {
  actionType: action.action_type,
  result,
  nextCompletes: nextCompletion,
  timerSeconds: nextTimer,
  xpInfo: {
    totalXp: currentXp,
    level: currentLevel,
    xpToNext: xpNeeded,
  }
});

    } else if (!action.auto_restart) {
      await db('player_actions').where({ id: action.id }).delete();
      io.to(`player_${action.player_id}`).emit('action_complete', {
        actionType: action.action_type,
        result,
        nextCompletes: null,
      });
    }

  } catch (err) {
    logger.error(`Error processing action ${action.id}: ${err}`);
  }
}