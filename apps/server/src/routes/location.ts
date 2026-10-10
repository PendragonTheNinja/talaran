import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { onlinePlayers } from '../lib/realtime';

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

    const foragingHabitats = await db('foraging_habitats')
      .where({ location_id: player.current_location_id, is_active: true })
      .orderBy('display_order');

    // Only a count is needed: the panel uses it to decide whether this place
    // has water worth fishing. The species themselves come from
    // /api/fishing/overview, which knows what the player has discovered.
    const fishSpecies = await db('fish_species')
      .where({ location_id: player.current_location_id, is_active: true })
      .count('id as count').first();
    const fishSpeciesCount = Number(fishSpecies?.count || 0);

    // Places to fight here (docs/combat-spec.md §8), each with the creatures
    // it holds, lowest level first. Draw weights stay on the server: what a
    // drawn spot sends you next is the fight's business, not the panel's.
    const spots = await db('fighting_spots')
      .where({ location_id: player.current_location_id, is_active: true })
      .orderBy(['display_order', 'id'])
      .select('id', 'key', 'name', 'kind', 'description');
    const spotCreatures = spots.length
      ? await db('fighting_spot_creatures')
        .join('creatures', 'creatures.id', 'fighting_spot_creatures.creature_id')
        .whereIn('fighting_spot_creatures.spot_id', spots.map((s) => s.id))
        .andWhere('creatures.is_active', true)
        .orderBy(['creatures.level', 'creatures.name'])
        .select('fighting_spot_creatures.spot_id', 'creatures.id', 'creatures.key', 'creatures.name', 'creatures.level')
      : [];
    const fightingSpots = spots.map((spot) => ({
      ...spot,
      creatures: spotCreatures
        .filter((c) => c.spot_id === spot.id)
        .map(({ spot_id: _spotId, ...c }) => c),
    }));

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
      foragingHabitats,
      fishSpeciesCount,
      fightingSpots,
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

    const onlineIds = [...onlinePlayers(), playerId];

    // Every column qualified. Joining feats brought a second `id` into scope,
    // and the unqualified filters below silently started resolving against it,
    // which is why this list stopped showing anybody.
    const players = await db('players')
      .leftJoin('feats as bf', 'bf.badge_key', 'players.worn_badge')
      .where('players.current_location_id', player.current_location_id)
      .whereIn('players.id', onlineIds)
      // guild_tag is the same column chat reads, so a player's tag is identical
      // wherever their name appears. worn_badge rides alongside it, with the
      // glyph joined in as the fallback for art that does not exist yet.
      .select('players.id', 'players.username', 'players.guild_tag',
              'players.worn_badge as badge_key', 'bf.badge as badge',
              'players.worn_title as title');

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