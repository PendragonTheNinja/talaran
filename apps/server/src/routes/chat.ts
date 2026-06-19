import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { logger } from '../lib/logger';
import { chatLimit, chatReadLimit } from '../middleware/rateLimit';

const router = Router();

const CHANNEL_TYPES = ['world', 'region', 'guild', 'trade', 'help', 'whisper', 'server']; const MAX_MESSAGE_LENGTH = 500;
const HISTORY_DAYS = 2; // today + yesterday

// Turn "Forum > Category > Thread Title" breadcrumbs (typed or pasted) into inline
// link tokens the client renders as clickable forum links. Accepts > or › separators.
// The thread title runs from the 2nd separator up to wherever a real thread title matches,
// so it works whether the breadcrumb is the whole message or embedded in a sentence.
async function resolveForumBreadcrumbs(text: string): Promise<string> {
  // Stop players forging link tokens by typing them literally.
  text = text.replace(/\[\[FORUMLINK/gi, '[ [FORUMLINK');

  const m = /Forum\s*[>›]\s*([^>›\n]+?)\s*[>›]\s*(.+)/i.exec(text);
  if (!m) return text;

  const categoryName = m[1].trim();
  const remainder = m[2];                                  // text after the 2nd separator
  const remainderStart = m.index + m[0].length - m[2].length;

  const category = await db('forum_categories')
    .whereRaw('LOWER(name) = ?', [categoryName.toLowerCase()])
    .first();
  if (!category) return text;

  const threads = await db('forum_threads')
    .where({ category_id: category.id, is_deleted: false })
    .orderBy('last_post_at', 'desc');                       // most recent wins on a title tie

  const lower = remainder.toLowerCase();
  let best: any = null;
  for (const t of threads) {
    const title = (t.title || '').trim();
    if (title && lower.startsWith(title.toLowerCase())) {
      if (!best || title.length > best.title.trim().length) best = t;  // longest (most specific) title
    }
  }
  if (!best) return text;

  const titleEnd = remainderStart + best.title.trim().length;
  const display = text.slice(m.index, titleEnd).replace(/\]\]/g, ']');  // the breadcrumb as typed
  const token = `[[FORUMLINK|${best.id}|${display}]]`;
  return text.slice(0, m.index) + token + text.slice(titleEnd);
}

// Get chat history for a channel
router.get('/history/:channel', chatReadLimit, requireAuth, async (req: AuthRequest, res: Response) => {
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
      if (!player.guild_id) {
        res.json({ messages: [] })
        return
      }
      query = query.where('guild_id', player.guild_id);
    }

    if (channel === 'whisper') {
      query = query.where('player_id', playerId);
    }

    const messages = await query;
    res.json({ messages });
  } catch (err) {
    logger.error(`Chat history error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a chat message
router.post('/send', chatLimit, requireAuth, async (req: AuthRequest, res: Response) => {
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
    const playerCheck = await db('players').where({ id: playerId }).first();
    if (!playerCheck.guild_id) {
      res.status(400).json({ error: 'You must be in a guild to use guild chat.' });
      return;
    }
  }

  try {
    const player = await db('players').where({ id: playerId }).first();
    // Check if player is muted
    if (player.is_chat_muted) {
      const now = new Date();
      if (!player.chat_muted_until || new Date(player.chat_muted_until) > now) {
        if (channel !== 'guild') {
          res.status(403).json({ error: 'You are muted and cannot send chat messages.' });
          return;
        }
      } else {
        await db('players').where({ id: playerId }).update({ is_chat_muted: false, chat_muted_until: null });
      }
    }
    console.log('Player guild_tag:', player.guild_tag);
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
        sentAt: now.toISOString(),
        guildTag: null, // will add later
      };

      await db('chat_messages').insert({
        player_id: playerId,
        channel: 'whisper',
        region: null,
        guild_id: null,
        message: `→ ${targetName}: ${whisperMessage}`,
        player_name: player.username,
        guild_tag: player.guild_tag || null,
        sent_at: now,
      });

      // Also save received whisper for the target
      await db('chat_messages').insert({
        player_id: targetPlayer.id,
        channel: 'whisper',
        region: null,
        guild_id: null,
        message: whisperMessage,
        player_name: player.username,
        guild_tag: player.guild_tag || null,
        sent_at: now,
      });

      // Send to target
      io.to(`player_${targetPlayer.id}`).emit('whisper', whisperData);
      // Send back to sender
      io.to(`player_${playerId}`).emit('whisper_sent', whisperData);

      res.json({ success: true });
      return;
    }

    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 5);
    const processedMessage = await resolveForumBreadcrumbs(message.trim());

    const chatMessage = await db('chat_messages').insert({
      player_id: playerId,
      channel,
      region: channel === 'region' ? region : null,
      guild_id: player.guild_id || null,
      message: processedMessage,
      player_name: player.username,
      guild_tag: player.guild_tag || null,
      sent_at: now,
    }).returning('*');

    const messageData = {
      id: chatMessage[0].id,
      channel,
      playerName: player.username,
      guildTag: player.guild_tag || null,
      message: processedMessage,
      timestamp,
      sentAt: now.toISOString(),
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