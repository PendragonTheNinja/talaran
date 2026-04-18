import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Get current location with available actions
router.get('/current', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const player = await db('players')
      .where({ id: playerId })
      .select('current_location_id')
      .first();

    if (!player?.current_location_id) {
      res.json({ location: null, nodes: [], connections: [] });
      return;
    }

    const location = await db('locations')
      .where({ id: player.current_location_id })
      .first();

    const nodes = await db('resource_nodes')
      .where({ location_id: player.current_location_id, is_active: true })
      .select('*');

    const connections = await db('location_connections')
      .where({ from_location_id: player.current_location_id })
      .join('locations', 'location_connections.to_location_id', 'locations.id')
      .select(
        'location_connections.*',
        'locations.name as to_location_name',
        'locations.type as to_location_type'
      );

    res.json({ location, nodes, connections });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;