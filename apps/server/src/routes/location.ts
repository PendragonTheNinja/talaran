import { Router, Response } from 'express';
import { islandTowns } from '../services/islands';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { onlinePlayers } from '../lib/realtime';
import { eventStandingsAt } from '../services/worldEvents';
import { liveIsletFind } from '../services/isletFinds';
import { waterFor } from '../services/fishing';
import { givenNameOf } from '../services/isletNames';
import { rockSubtypeFor } from '../services/mining';
import { benchesAt } from '../services/workstations';

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
    // Which mining nodes are rock a player swings at (granite and the like),
    // as against ore nodes, which only say what veins a place can open
    // (services/mining.ts veinOresAt). The client must not guess this from a
    // node's name: "Underway Granite" (now "Granite") had no "rock" in it and never showed.
    const rockTypes = new Set((await db('items').where({ type: 'rock' }).pluck('subtype')) as string[]);
    for (const n of nodes) {
      if (n.skill === 'mining') n.mineable = rockTypes.has(rockSubtypeFor(n) ?? '');
    }
    // On an islet, the player's own find stands here too while it has work
    // left (services/isletFinds.ts): a stand is its node, with what is left.
    const isletFind = await liveIsletFind(playerId);
    if (isletFind?.kind === 'stand' && isletFind.target_id) {
      const node = await db('resource_nodes').where({ id: isletFind.target_id, is_active: true }).first();
      if (node) nodes.push({ ...node, islet_remaining: isletFind.remaining });
    }

    const huntableAnimals = await db('huntable_animals')
      .where({ location_id: player.current_location_id, is_active: true })
      .orderBy('required_level');
    // On an islet, the player's game trail brings its animal here (services/isletFinds.ts).
    if (isletFind?.kind === 'trail' && isletFind.target_id) {
      const animal = await db('huntable_animals').where({ id: isletFind.target_id, is_active: true }).first();
      if (animal) huntableAnimals.push({ ...animal, islet_remaining: isletFind.remaining });
    }

    const foragingHabitats = await db('foraging_habitats')
      .where({ location_id: player.current_location_id, is_active: true })
      .orderBy('display_order');
    // On an islet, the player's wild patch is a habitat here (services/isletFinds.ts).
    if (isletFind?.kind === 'patch' && isletFind.target_id) {
      const patch = await db('foraging_habitats').where({ id: isletFind.target_id, is_active: true }).first();
      if (patch) foragingHabitats.push({ ...patch, islet_remaining: isletFind.remaining });
    }

    // Only a count is needed: the panel uses it to decide whether this place
    // has water worth fishing. The species themselves come from
    // /api/fishing/overview, which knows what the player has discovered.
    // On an islet with a shoal, its water's fish (services/fishing.ts waterFor).
    const fishWater = (await waterFor(playerId, player.current_location_id)).water;
    const fishSpecies = await db('fish_species')
      .where({ location_id: fishWater, is_active: true })
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
    // An islet guardian's spot shows only to a player whose find here is its
    // guarded cache (docs/islets-plan.md §6f).
    const guarding = isletFind?.kind === 'cache' ? isletFind.target_id : null;
    const fightingSpots = spots.map((spot) => ({
      ...spot,
      creatures: spotCreatures
        .filter((c) => c.spot_id === spot.id)
        .map(({ spot_id: _spotId, ...c }) => c),
    })).filter((spot) => spot.kind !== 'guardian' || spot.creatures.some((c: { id: number }) => c.id === guarding));

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

    // The player's own guild hall stands here (services/guildHall.ts), so the
    // location panel offers it. Only their guild's: another guild's hall is
    // theirs to see, not to open.
    const guildHallHere = !!(await db('guild_members as gm')
      .join('guild_halls as h', 'h.guild_id', 'gm.guild_id')
      .where({ 'gm.player_id': playerId, 'h.location_id': player.current_location_id })
      .first('h.id'));
    // Another guild's hall here that this player was hired to build on
    // (services/guildHall.ts, building for hire).
    const hallWorkHere = !!(await db('guild_hall_hands as hh')
      .join('guild_halls as h', 'h.id', 'hh.hall_id')
      .where({ 'hh.player_id': playerId, 'h.location_id': player.current_location_id })
      .first('h.id'));

    // This place's last world event: its ten busiest players and guilds,
    // shown under the description until the next event here.
    const eventStandings = await eventStandingsAt(player.current_location_id);

    // A tavern here (the Salty Sloth, Talador: docs/chronicle-spec.md §2).
    const tavern = await db('taverns').where({ location_id: player.current_location_id }).first('id', 'name', 'description', 'bard_npc_id');

    // Merchants here, and what to call their market: an island's only market
    // town takes the island's name ("Taiar Marketplace"); where an island has
    // several (Antura's Mettlefell and Wendhaven), each takes its own town's.
    let marketName: string | null = null;
    const merchantsHere = await db('merchants').where({ location_id: player.current_location_id, is_active: true }).first('id');
    if (merchantsHere) {
      const towns = await db('merchants as m').join('locations as l', 'l.id', 'm.location_id')
        .where({ 'm.is_active': true, 'l.region': currentLocation.region ?? null }).countDistinct('m.location_id as n').first();
      marketName = Number(towns?.n ?? 0) <= 1 && currentLocation.region
        ? `${String(currentLocation.region).replace(/ Island$/, '')} Marketplace`
        : `${currentLocation.name} Market`;
    }

    // Whether this is an island's homestead ground or its port with player
    // shops (services/islands.ts), so the client never matches on a town's name.
    const towns = await islandTowns();
    // A sea road here: the boats the player could cross it in (routes/travel.ts).
    const ownBoats = connections.some((c: any) => c.travel_type === 'sea')
      ? await db('player_vessels as v').join('vessel_types as t', 't.id', 'v.vessel_type_id')
          .where({ 'v.player_id': playerId, 't.is_active': true }).orderBy('t.tier').select('t.key', 't.name')
      : [];

    // An islet's alpha name, if the Harbor Council chose one (services/isletNames.ts).
    // Shown beside its standing name, which stays the key everything else uses.
    const givenName = currentLocation.islet_kind ? await givenNameOf(currentLocation.id) : null;

    // Homesteads here whose owner has given this player a key (services/propertyPartners.ts).
    const sharedHomesteadsHere = await db('property_partners as pp')
      .join('player_properties as p', 'p.id', 'pp.property_id')
      .join('players as owner', 'owner.id', 'p.player_id')
      .where({ 'pp.partner_id': playerId, 'p.location_id': currentLocation.id, 'p.type': 'farmstead' })
      .orderBy('owner.username')
      .select('p.id as propertyId', 'owner.username as owner');

    res.json({
      location: { ...currentLocation, given_name: givenName },
      homesteadHere: towns.homesteads.has(currentLocation.name),
      sharedHomesteadsHere,
      shopsHere: towns.shops.has(currentLocation.name),
      // The benches a player may set up here, and which a keeper lends
      // (locations.bench_types; services/workstations.ts benchesAt).
      benches: await benchesAt(currentLocation),
      ownBoats,
      guildHallHere,
      hallWorkHere,
      eventStandings,
      tavern: tavern ?? null,
      marketName,
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
      // On the road: still recorded at the place left until they arrive, but
      // gone from it (travel start announces the change).
      .whereNotExists(db('player_actions').whereRaw('player_actions.player_id = players.id').where('player_actions.action_type', 'traveling'))
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