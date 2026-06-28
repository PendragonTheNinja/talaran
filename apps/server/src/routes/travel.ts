import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';
import { io } from '../index';
import { botCheckGate } from '../services/botCheck';
import { computeTravelTime } from '../services/travel'

const router = Router();

router.post('/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { toLocationId } = req.body;

  if (!toLocationId) {
    res.status(400).json({ error: 'toLocationId is required' });
    return;
  }

  try {
    // Get player's current location
    const player = await db('players')
      .where({ id: playerId })
      .select('current_location_id')
      .first();

    if (!player?.current_location_id) {
      res.status(400).json({ error: 'Player has no current location' });
      return;
    }

    // Verify connection exists
    const connection = await db('location_connections')
      .where({
        from_location_id: player.current_location_id,
        to_location_id: toLocationId,
      })
      .first();

    const reverseConnection = await db('location_connections')
      .where({
        from_location_id: toLocationId,
        to_location_id: player.current_location_id,
        is_bidirectional: true,
      })
      .first();

    if (!connection && !reverseConnection) {
      res.status(400).json({ error: 'No path to that location' });
      return;
    }

    const activeConnection = connection || reverseConnection;
    const baseTravelTime = activeConnection?.base_travel_time ?? 30;

    const { travelTime } = await computeTravelTime(playerId, baseTravelTime);

    // Cancel any existing action
    await db('player_actions').where({ player_id: playerId }).delete();

    // Cancel any active trades
    const activeTrade = await db('trades')
      .where(function () {
        this.where({ player1_id: playerId }).orWhere({ player2_id: playerId })
      })
      .whereIn('status', ['pending', 'active'])
      .first();

    if (activeTrade) {
      await db('trades').where({ id: activeTrade.id }).update({ status: 'cancelled' });
      const otherId = activeTrade.player1_id === playerId ? activeTrade.player2_id : activeTrade.player1_id;
      io.to(`player_${otherId}`).emit('trade_cancelled', { reason: 'The other player left the area.' });
    }

    // Start travel action
    const now = new Date();
    const completesAt = new Date(now.getTime() + travelTime * 1000);

    await db('player_actions').insert({
      player_id: playerId,
      action_type: 'traveling',
      resource_node_id: null,
      location_id: toLocationId,
      started_at: now,
      completes_at: completesAt,
      auto_restart: false,
      last_bot_check: now,
      bot_check_pending: false,
      action_data: String(baseTravelTime),
    });

    const toLocation = await db('locations').where({ id: toLocationId }).first();

    logger.info(`Player ${playerId} traveling to ${toLocation.name}`);
    res.json({
      message: `You begin traveling to ${toLocation.name}`,
      travelTime,
      completesAt,
      destination: toLocation.name,
    });

  } catch (err) {
    logger.error(`Travel error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get this player's recent travel log (newest first)
router.get('/log', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const entries = await db('travel_log')
      .where({ player_id: playerId })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json({
      log: entries.map(e => ({
        id: e.id,
        from: e.from_location,
        to: e.to_location,
        skill: e.skill_name,
        events: JSON.parse(e.events),
        timestamp: e.created_at,
      })),
    });
  } catch (err) {
    res.json({ log: [] });
  }
});

export default router;