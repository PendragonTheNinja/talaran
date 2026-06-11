import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { canMineHere, canMineVein, getActiveVeins, calculateMiningTimer } from '../services/mining';
import { levelFromXp } from '../services/xp';
import { logger } from '../index';
import { botCheckGate } from '../services/botCheck';

const router = Router();

// Get active veins at current location
router.get('/veins', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();
    if (!player?.current_location_id) {
      res.json({ veins: [] });
      return;
    }

    const veins = await getActiveVeins(player.current_location_id, playerId);
    res.json({ veins });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Start mining rocks
router.post('/rock/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { nodeId } = req.body;

  try {
    const existing = await db('player_actions').where({ player_id: playerId }).first();
    if (existing) {
      res.status(409).json({ error: 'You are already performing an action' });
      return;
    }

    const { allowed, reason, toolTier } = await canMineHere(playerId, nodeId);
    if (!allowed) {
      res.status(403).json({ error: reason });
      return;
    }

    const node = await db('resource_nodes').where({ id: nodeId }).first();
    const miningSkill = await db('skills').where({ name: 'Mining' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: miningSkill.id })
      .first();

    const playerLevel = levelFromXp(playerSkill?.xp ? parseInt(playerSkill.xp) : 0);
    const timerSeconds = calculateMiningTimer(
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
      action_type: 'mining_rock',
      resource_node_id: nodeId,
      location_id: node.location_id,
      started_at: now,
      completes_at: completesAt,
      auto_restart: true,
      last_bot_check: now,
      bot_check_pending: false,
    });

    logger.info(`Player ${playerId} started mining rocks at node ${nodeId}`);
    res.json({ message: 'Mining started', timerSeconds, completesAt });

  } catch (err) {
    logger.error(`Start mining error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start mining a vein
router.post('/vein/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { veinId } = req.body;

  try {
    // Cancel existing action
    await db('player_actions').where({ player_id: playerId }).delete();

    const { allowed, reason } = await canMineVein(playerId, veinId);
    if (!allowed) {
      res.status(403).json({ error: reason });
      return;
    }

    const vein = await db('ore_veins').where({ id: veinId }).first();
    const player = await db('players').where({ id: playerId }).select('current_location_id').first();

    const miningSkill = await db('skills').where({ name: 'Mining' }).first();
    const playerSkill = await db('player_skills')
      .where({ player_id: playerId, skill_id: miningSkill.id })
      .first();
    const playerLevel = levelFromXp(playerSkill?.xp ? parseInt(playerSkill.xp) : 0);

    const oreNode = await db('resource_nodes')
      .where({ location_id: player.current_location_id, skill: 'mining' })
      .whereNotNull('ore_subtype')
      .first();

    const baseTimer = oreNode?.base_timer || 28;
    const minTimer = oreNode?.min_timer || 16;
    // Get player's tool tier
    const playerTool = await db('player_inventory')
      .join('items', 'player_inventory.item_id', 'items.id')
      .where({ 'player_inventory.player_id': playerId, 'items.type': 'tool', 'items.subtype': 'pickaxe' })
      .select('items.tier')
      .first();

    const playerToolTier = playerTool?.tier || 1;
    const requiredLevel = oreNode?.required_level || 1;
    const requiredToolTier = oreNode?.required_tool_tier || 1;

    const timerSeconds = calculateMiningTimer(baseTimer, minTimer, playerLevel, requiredLevel, playerToolTier, requiredToolTier);

    const now = new Date();
    const completesAt = new Date(now.getTime() + timerSeconds * 1000);

    await db('player_actions').insert({
      player_id: playerId,
      action_type: 'mining_vein',
      resource_node_id: null,
      action_data: veinId,
      location_id: player.current_location_id,
      started_at: now,
      completes_at: completesAt,
      auto_restart: true,
      last_bot_check: now,
      bot_check_pending: false,
    });

    const ore = await db('items').where({ id: vein.ore_item_id }).first();
    logger.info(`Player ${playerId} started mining ${ore.name} vein ${veinId}`);
    res.json({ message: `Mining ${ore.name} vein`, timerSeconds, completesAt });

  } catch (err) {
    logger.error(`Start vein mining error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;