import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { connectedPlayers } from '../index';

const router = Router();

// Get current player's guild info
router.get('/my', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player.guild_id) {
      res.json({ guild: null });
      return;
    }

    const guild = await db('guilds').where({ id: player.guild_id }).first();
    const members = await db('guild_members')
  .where({ 'guild_members.guild_id': player.guild_id })
  .join('players', 'guild_members.player_id', 'players.id')
  .join('locations', 'players.current_location_id', 'locations.id')
  .select(
    'players.id',
    'players.username',
    'players.last_seen',
    'guild_members.role',
    'guild_members.joined_at',
    'locations.name as location_name',
  );

    const membersWithStatus = members.map(m => ({
      ...m,
      online: connectedPlayers.has(m.id),
    }));

    const founder = await db('players').where({ id: guild.founder_id }).select('username').first();
    const leader = await db('players').where({ id: guild.leader_id }).select('username').first();

    res.json({
      guild: {
        ...guild,
        founderName: founder?.username,
        leaderName: leader?.username,
      },
      members: membersWithStatus,
      myRole: player.guild_role,
    });
  } catch (err) {
    logger.error(`Get guild error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all guilds (for browsing)
router.get('/list', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const guilds = await db('guilds')
      .join('players as founder', 'guilds.founder_id', 'founder.id')
      .join('players as leader', 'guilds.leader_id', 'leader.id')
      .select(
        'guilds.id',
        'guilds.name',
        'guilds.tag',
        'guilds.description',
        'guilds.open_applications',
        'founder.username as founder_name',
        'leader.username as leader_name',
      );

    const guildsWithCount = await Promise.all(guilds.map(async g => {
      const count = await db('guild_members').where({ guild_id: g.id }).count('id as count').first();
      return { ...g, memberCount: parseInt(count?.count as string) };
    }));

    res.json({ guilds: guildsWithCount });
  } catch (err) {
    logger.error(`List guilds error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a guild
router.post('/create', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { name, tag, description } = req.body;

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (player.guild_id) {
      res.status(400).json({ error: 'You are already in a guild.' });
      return;
    }

    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: 'Guild name is required.' });
      return;
    }

    if (!tag || tag.trim().length === 0 || tag.trim().length > 5) {
      res.status(400).json({ error: 'Guild tag must be 1-5 characters.' });
      return;
    }

    // Check name and tag uniqueness
    const existing = await db('guilds')
      .where({ name: name.trim() })
      .orWhere({ tag: tag.trim().toUpperCase() })
      .first();

    if (existing) {
      res.status(400).json({ error: 'That guild name or tag is already taken.' });
      return;
    }

    const [guild] = await db('guilds').insert({
      name: name.trim(),
      tag: tag.trim().toUpperCase(),
      founder_id: playerId,
      leader_id: playerId,
      description: description?.trim() || null,
      open_applications: true,
    }).returning('*');

    await db('guild_members').insert({
      guild_id: guild.id,
      player_id: playerId,
      role: 'founder',
    });

    await db('players').where({ id: playerId }).update({
      guild_id: guild.id,
      guild_tag: guild.tag,
      guild_role: 'founder',
    });

    logger.info(`Player ${playerId} created guild ${guild.name} [${guild.tag}]`);
    res.json({ success: true, guild });
  } catch (err) {
    logger.error(`Create guild error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Invite a player
router.post('/invite', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { username } = req.body;

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player.guild_id) {
      res.status(400).json({ error: 'You are not in a guild.' });
      return;
    }

    if (!['founder', 'leader'].includes(player.guild_role)) {
      res.status(403).json({ error: 'You do not have permission to invite players.' });
      return;
    }

    const target = await db('players').where({ username }).first();
    if (!target) {
      res.status(404).json({ error: `Player "${username}" not found.` });
      return;
    }

    if (target.guild_id) {
      res.status(400).json({ error: `${username} is already in a guild.` });
      return;
    }

    // Add them directly
    await db('guild_members').insert({
      guild_id: player.guild_id,
      player_id: target.id,
      role: 'member',
    });

    await db('players').where({ id: target.id }).update({
      guild_id: player.guild_id,
      guild_tag: player.guild_tag,
      guild_role: 'member',
    });

    logger.info(`Player ${playerId} invited ${target.username} to guild ${player.guild_id}`);
    res.json({ success: true, message: `${username} has been invited to the guild.` });
  } catch (err) {
    logger.error(`Invite guild error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Kick a player
router.post('/kick', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { targetPlayerId } = req.body;

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player.guild_id) {
      res.status(400).json({ error: 'You are not in a guild.' });
      return;
    }

    if (!['founder', 'leader'].includes(player.guild_role)) {
      res.status(403).json({ error: 'You do not have permission to kick players.' });
      return;
    }

    const target = await db('players').where({ id: targetPlayerId }).first();
    if (!target || target.guild_id !== player.guild_id) {
      res.status(404).json({ error: 'Player not found in your guild.' });
      return;
    }

    if (target.guild_role === 'founder') {
      res.status(403).json({ error: 'You cannot kick the guild founder.' });
      return;
    }

    await db('guild_members').where({ guild_id: player.guild_id, player_id: targetPlayerId }).delete();
    await db('players').where({ id: targetPlayerId }).update({
      guild_id: null,
      guild_tag: null,
      guild_role: null,
    });

    logger.info(`Player ${playerId} kicked ${targetPlayerId} from guild ${player.guild_id}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Kick guild error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Transfer leadership
router.post('/transfer-leadership', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { targetPlayerId } = req.body;

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!['founder', 'leader'].includes(player.guild_role)) {
      res.status(403).json({ error: 'Only the leader or founder can transfer leadership.' });
      return;
    }

    const target = await db('players').where({ id: targetPlayerId }).first();
    if (!target || target.guild_id !== player.guild_id) {
      res.status(404).json({ error: 'Player not found in your guild.' });
      return;
    }

    // Update guild leader
    await db('guilds').where({ id: player.guild_id }).update({ leader_id: targetPlayerId });

    // Update old leader role — if founder stays founder, else becomes member
    const newOldRole = player.guild_role === 'founder' ? 'founder' : 'member';
    await db('guild_members').where({ guild_id: player.guild_id, player_id: playerId }).update({ role: newOldRole });
    await db('players').where({ id: playerId }).update({ guild_role: newOldRole });

    // New leader
    await db('guild_members').where({ guild_id: player.guild_id, player_id: targetPlayerId }).update({ role: 'leader' });
    await db('players').where({ id: targetPlayerId }).update({ guild_role: 'leader' });

    logger.info(`Player ${playerId} transferred leadership to ${targetPlayerId}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Transfer leadership error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave guild
router.post('/leave', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player.guild_id) {
      res.status(400).json({ error: 'You are not in a guild.' });
      return;
    }

    if (player.guild_role === 'founder') {
      res.status(400).json({ error: 'The founder cannot leave the guild. Transfer leadership first.' });
      return;
    }

    await db('guild_members').where({ guild_id: player.guild_id, player_id: playerId }).delete();
    await db('players').where({ id: playerId }).update({
      guild_id: null,
      guild_tag: null,
      guild_role: null,
    });

    logger.info(`Player ${playerId} left guild ${player.guild_id}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Leave guild error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Apply to guild
router.post('/apply', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { guildId, message } = req.body;

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (player.guild_id) {
      res.status(400).json({ error: 'You are already in a guild.' });
      return;
    }

    const guild = await db('guilds').where({ id: guildId }).first();
    if (!guild) {
      res.status(404).json({ error: 'Guild not found.' });
      return;
    }

    if (!guild.open_applications) {
      res.status(400).json({ error: 'This guild is not accepting applications.' });
      return;
    }

    await db('guild_applications').insert({
      guild_id: guildId,
      player_id: playerId,
      message: message?.trim() || null,
      status: 'pending',
    }).onConflict(['guild_id', 'player_id']).ignore();

    res.json({ success: true, message: 'Application submitted!' });
  } catch (err) {
    logger.error(`Apply guild error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pending applications (leader/founder only)
router.get('/applications', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;

  try {
    const player = await db('players').where({ id: playerId }).first();
    console.log('Applications route - player:', player?.username, 'role:', player?.guild_role, 'guild:', player?.guild_id);
    
    if (!player.guild_id || !['founder', 'leader'].includes(player.guild_role)) {
      res.status(403).json({ error: 'No permission.' });
      return;
    }

    const applications = await db('guild_applications')
  .where({ 'guild_applications.guild_id': player.guild_id, 'guild_applications.status': 'pending' })
  .join('players', 'guild_applications.player_id', 'players.id')
  .select(
    'guild_applications.id',
    'guild_applications.message',
    'guild_applications.created_at',
    'players.username'
  );

    res.json({ applications });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept/reject application
router.post('/applications/:id/respond', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const appId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { accept } = req.body;

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!['founder', 'leader'].includes(player.guild_role)) {
      res.status(403).json({ error: 'No permission.' });
      return;
    }

    const app = await db('guild_applications').where({ id: appId, guild_id: player.guild_id }).first();
    if (!app) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    if (accept) {
      await db('guild_members').insert({
        guild_id: player.guild_id,
        player_id: app.player_id,
        role: 'member',
      });

      const guild = await db('guilds').where({ id: player.guild_id }).first();
      await db('players').where({ id: app.player_id }).update({
        guild_id: player.guild_id,
        guild_tag: guild.tag,
        guild_role: 'member',
      });
    }

    await db('guild_applications').where({ id: appId }).update({
      status: accept ? 'accepted' : 'rejected',
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;