import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { botCheckGate } from '../services/botCheck';
import { computeTravelTime } from '../services/travel'
import { pushToPlayer, announcePlayersHere } from '../lib/realtime';
import { endFightIfAny } from '../services/combatFights';

const router = Router();

router.post('/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { toLocationId } = req.body;

  if (!toLocationId) {
    res.status(400).json({ error: 'toLocationId is required' });
    return;
  }

  try {
    // A fight is settled to this moment first, so walking away is a flee that
    // keeps every swing (services/combatFights.ts). It runs before the player
    // is read: if that last settle kills them they wake in Talador, and the
    // journey must start from there, not from where they fell (audit B7).
    await endFightIfAny(playerId);

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

    const { travelTime, mounted } = await computeTravelTime(playerId, baseTravelTime);

    const now = new Date();
    const completesAt = new Date(now.getTime() + travelTime * 1000);

    // Leaving is one unit: the old action goes, an open trade is cancelled,
    // and the journey starts, together or not at all. The trade is locked and
    // cancelled only if it is still open: an unlocked, unconditional cancel
    // could land after the other player's accept committed and record a
    // finished trade as cancelled (audit B8). The same job stepIntoWithin in
    // services/spells.ts does for portals.
    const cancelledWith = await db.transaction(async (trx) => {
      await trx('players').where({ id: playerId }).forNoKeyUpdate().first('id');
      await trx('player_actions').where({ player_id: playerId }).delete();

      const activeTrade = await trx('trades')
        .where(function () {
          this.where({ player1_id: playerId }).orWhere({ player2_id: playerId })
        })
        .whereIn('status', ['pending', 'active'])
        .forUpdate()
        .first();
      let otherId: number | null = null;
      if (activeTrade) {
        const cancelled = await trx('trades')
          .where({ id: activeTrade.id })
          .whereIn('status', ['pending', 'active'])
          .update({ status: 'cancelled' });
        if (cancelled) otherId = activeTrade.player1_id === playerId ? activeTrade.player2_id : activeTrade.player1_id;
      }

      await trx('player_actions').insert({
        player_id: playerId,
        action_type: 'traveling',
        resource_node_id: null,
        location_id: toLocationId,
        started_at: now,
        completes_at: completesAt,
        last_timer_seconds: travelTime,
        auto_restart: false,
        last_bot_check: now,
        bot_check_pending: false,
        // The road's base time, and whether this journey is ridden. Both are
        // fixed here, at the start, with the speed: arrival pays by them, so
        // putting a mount away on the road cannot buy a rider's speed with a
        // walker's XP and finds (forum, 2026-11-08).
        action_data: JSON.stringify({ base: baseTravelTime, mounted }),
      });
      return otherId;
    });
    if (cancelledWith) pushToPlayer(cancelledWith, 'trade_cancelled', { reason: 'The other player left the area.' });

    const toLocation = await db('locations').where({ id: toLocationId }).first();
    // Set off: gone from "Players here" where they stood (players-here leaves
    // out anyone on the road).
    announcePlayersHere(player.current_location_id);

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