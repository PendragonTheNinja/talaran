import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { canChopHere, calculateTimer } from '../services/woodcutting';
import { levelFromXp } from '../services/xp';
import { logger } from '../index';

const router = Router();

// Start a woodcutting action
router.post('/woodcutting/start', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { nodeId } = req.body;

  if (!nodeId) {
    res.status(400).json({ error: 'nodeId is required' });
    return;
  }

  try {
    // Check if player already has an active action
    const existing = await db('player_actions').where({ player_id: playerId }).first();
    if (existing) {
      res.status(409).json({ error: 'You are already performing an action' });
      return;
    }

    // Validate player can chop here
    const { allowed, reason, toolTier } = await canChopHere(playerId, nodeId);
    if (!allowed) {
      res.status(403).json({ error: reason });
      return;
    }

    const node = await db('resource_nodes').where({ id: nodeId }).first();
    const woodcuttingSkill = await db('skills').where({ name: 'Woodcutting' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: woodcuttingSkill.id })
      .first();

    const playerLevel = levelFromXp(playerSkill?.xp || 0);
    const timerSeconds = calculateTimer(
      node.base_timer,
      node.min_timer,
      playerLevel,
      node.required_level,
      toolTier!,
      node.required_tool_tier
    );

    const now = new Date();
    const completesAt = new Date(now.getTime() + timerSeconds * 1000);

    await db('player_actions').insert({
      player_id: playerId,
      action_type: 'woodcutting',
      resource_node_id: nodeId,
      location_id: node.location_id,
      started_at: now,
      completes_at: completesAt,
      auto_restart: true,
      last_bot_check: now,
      bot_check_pending: false,
    });

    logger.info(`Player ${playerId} started woodcutting node ${nodeId}`);
    res.json({
      message: 'Woodcutting started',
      timerSeconds,
      completesAt,
    });

  } catch (err) {
    logger.error(`Start woodcutting error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Stop current action
router.post('/stop', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    await db('player_actions').where({ player_id: playerId }).delete();
    res.json({ message: 'Action stopped' });
  } catch (err) {
    logger.error(`Stop action error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Respond to bot check
router.post('/bot-check', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { answer } = req.body;
  try {
    const action = await db('player_actions')
      .where({ player_id: playerId, bot_check_pending: true })
      .first();
    if (!action) {
      res.status(404).json({ error: 'No pending bot check found.' });
      return;
    }

    // Validate answer server-side
    if (action.bot_check_answer !== null && parseInt(answer) !== action.bot_check_answer) {
      res.status(400).json({ error: 'Incorrect answer. Try again.' });
      return;
    }

    const now = new Date();
    // Use the action's original timer, not a hardcoded 30s
    const originalDuration = new Date(action.completes_at).getTime() - new Date(action.started_at).getTime();
    const timerSeconds = action.last_timer_seconds || 30;
    const completesAt = new Date(now.getTime() + timerSeconds * 1000);

    await db('player_actions')
      .where({ player_id: playerId })
      .update({
        bot_check_pending: false,
        bot_check_answer: null,
        last_bot_check: now,
        completes_at: completesAt,
        started_at: now,
      });

    await db('players').where({ id: playerId }).update({ last_bot_check: now });
    res.json({ success: true, timerSeconds, completesAt });
  } catch (err) {
    logger.error(`Bot check error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/bot-check/idle', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { answer } = req.body;
  try {
    const player = await db('players').where({ id: playerId }).first();

    if (player.bot_check_answer !== null && parseInt(answer) !== player.bot_check_answer) {
      res.status(400).json({ error: 'Incorrect answer. Try again.' });
      return;
    }

    await db('players').where({ id: playerId }).update({
      last_bot_check: new Date(),
      bot_check_answer: null,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;