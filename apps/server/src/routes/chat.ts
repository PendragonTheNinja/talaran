import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { logger } from '../lib/logger';

const router = Router();

const CHANNEL_TYPES = ['world', 'region', 'guild', 'trade', 'help'];
const MAX_MESSAGE_LENGTH = 500;
const HISTORY_DAYS = 2; // today + yesterday

// Get chat history for a channel
router.get('/history/:channel', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const channel = Array.isArray(req.params.channel) ? req.params.channel[0] : req.params.channel;

  if (!CHANNEL_TYPES.includes(channel)) {
    res.status(400).json({ error: 'Invalid channel' });
    return;
  }

  try {
    const player = await db('players').where({ id: playerId }).first();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);

    let query = db('chat_messages')
      .where('channel', channel)
      .where('sent_at', '>=', cutoff)
      .orderBy('sent_at', 'asc')
      .limit(200);

    if (channel === 'region') {
      const location = await db('locations').where({ id: player.current_location_id }).first();
      const region = location?.region || 'Unknown';
      query = query.where('region', region);
    }

    if (channel === 'guild') {
      // Will add guild filter once guilds are built
      query = query.where('guild_id', null); // placeholder
    }

    const messages = await query;
    res.json({ messages });
  } catch (err) {
    logger.error(`Chat history error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a chat message
router.post('/send', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { channel, message } = req.body;

  if (!message || message.trim().length === 0) {
    res.status(400).json({ error: 'Message cannot be empty' });
    return;
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
    return;
  }

  if (channel === 'guild') {
    res.status(400).json({ error: 'You must be in a guild to use guild chat.' });
    return;
  }

  try {
    const player = await db('players').where({ id: playerId }).first();
    const location = await db('locations').where({ id: player.current_location_id }).first();
    const region = location?.region || 'Unknown';

    // Check for whisper syntax: playername@message
    const whisperMatch = message.match(/^(\w+)@(.+)$/);
    if (whisperMatch) {
      const targetName = whisperMatch[1];
      const whisperMessage = whisperMatch[2].trim();
      const targetPlayer = await db('players').where({ username: targetName }).first();

      if (!targetPlayer) {
        res.status(404).json({ error: `Player "${targetName}" not found` });
        return;
      }

      const now = new Date();
      const timestamp = now.toTimeString().slice(0, 5);

      const whisperData = {
        type: 'whisper',
        from: player.username,
        to: targetName,
        message: whisperMessage,
        timestamp,
        guildTag: null, // will add later
      };

      // Send to target
      io.to(`player_${targetPlayer.id}`).emit('whisper', whisperData);
      // Send back to sender
      io.to(`player_${playerId}`).emit('whisper_sent', whisperData);

      res.json({ success: true });
      return;
    }

    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 5);

    const chatMessage = await db('chat_messages').insert({
      player_id: playerId,
      channel,
      region: channel === 'region' ? region : null,
      guild_id: player.guild_id || null,
      message: message.trim(),
      player_name: player.username,
      guild_tag: player.guild_tag || null,
      sent_at: now,
    }).returning('*');

    const messageData = {
      id: chatMessage[0].id,
      channel,
      playerName: player.username,
      guildTag: null,
      message: message.trim(),
      timestamp,
      region: channel === 'region' ? region : null,
    };

    // Emit to appropriate room
    if (channel === 'world' || channel === 'trade' || channel === 'help') {
      io.emit(`chat_${channel}`, messageData);
    } else if (channel === 'region') {
      io.to(`region_${region.replace(/ /g, '_')}`).emit('chat_region', messageData);
      io.to(`player_${playerId}`).emit('chat_region', messageData);
    } else if (channel === 'guild') {
  if (!player.guild_id) {
    res.status(400).json({ error: 'You must be in a guild to use guild chat.' });
    return;
  }
  io.to(`guild_${player.guild_id}`).emit('chat_guild', messageData);
}

    logger.info(`[${channel}] ${player.username}: ${message.trim()}`);
    res.json({ success: true, message: messageData });
  } catch (err) {
    logger.error(`Chat send error: ${err}`);
    console.error('Chat send full error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;