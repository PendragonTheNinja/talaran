import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { connectedPlayers } from '../index';

const router = Router();

router.get('/current', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const player = await db('players')
      .where({ id: playerId })
      .select('current_location_id')
      .first();

    if (!player?.current_location_id) {
      res.json({ location: null, nodes: [], connections: [], allLocations: [], allConnections: [] });
      return;
    }

    const currentLocation = await db('locations')
      .where({ id: player.current_location_id })
      .first();

    const nodes = await db('resource_nodes')
      .where({ location_id: player.current_location_id, is_active: true })
      .select('*');

    const huntableAnimals = await db('huntable_animals')
      .where({ location_id: player.current_location_id, is_active: true })
      .orderBy('required_level');

    // Direct connections FROM current location
    const directConnections = await db('location_connections')
      .where({ from_location_id: player.current_location_id })
      .join('locations', 'location_connections.to_location_id', 'locations.id')
      .select(
        'location_connections.*',
        'locations.name as to_location_name',
        'locations.type as to_location_type'
      );

    // Reverse bidirectional connections TO current location
    const reverseConnections = await db('location_connections')
      .where({ to_location_id: player.current_location_id, is_bidirectional: true })
      .join('locations', 'location_connections.from_location_id', 'locations.id')
      .select(
        'location_connections.*',
        'locations.name as to_location_name',
        'locations.type as to_location_type'
      );

    // Merge and deduplicate
    const seen = new Set<number>();
    const connections = [];
    for (const conn of [...directConnections, ...reverseConnections]) {
      const otherId = conn.from_location_id === player.current_location_id
        ? conn.to_location_id
        : conn.from_location_id;
      if (!seen.has(otherId)) {
        seen.add(otherId);
        connections.push({
          ...conn,
          to_location_id: otherId,
        });
      }
    }

    // All locations on the same island for minimap
    const allLocations = await db('locations')
      .where({ region: currentLocation.region, is_accessible: true })
      .select('id', 'name', 'type', 'map_x', 'map_y');

    // All connections on this island for road drawing
    const allConnections = await db('location_connections')
      .join('locations as from_loc', 'location_connections.from_location_id', 'from_loc.id')
      .join('locations as to_loc', 'location_connections.to_location_id', 'to_loc.id')
      .where('from_loc.region', currentLocation.region)
      .select(
        'location_connections.*',
        'to_loc.name as to_location_name',
        'to_loc.type as to_location_type'
      );

    res.json({
      location: currentLocation,
      nodes,
      connections,
      allLocations,
      allConnections,
      huntableAnimals,
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/players-here', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player?.current_location_id) {
      res.json({ players: [] });
      return;
    }

    const onlineIds = [...connectedPlayers, playerId];

    const players = await db('players')
      .where({ current_location_id: player.current_location_id })
      .whereIn('id', onlineIds)
      .select('id', 'username');

    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const locationId = parseInt(req.params.id as string)
  try {
    const location = await db('locations').where({ id: locationId }).first()
    if (!location) {
      res.status(404).json({ error: 'Location not found' })
      return
    }
    res.json({ location })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})
export default router;