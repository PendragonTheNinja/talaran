import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { logger } from '../lib/logger';

const router = Router();

// Get inbox
router.get('/inbox', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const messages = await db('messages')
      .where({ recipient_id: playerId })
      .orderBy('sent_at', 'desc')
      .select('id', 'sender_name', 'subject', 'is_read', 'is_system', 'sent_at', 'reply_to_id');
    
    const unreadCount = messages.filter(m => !m.is_read).length;
    res.json({ messages, unreadCount });
  } catch (err) {
    logger.error(`Inbox error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sent', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    console.log('Sent route called for player:', playerId);
    const messages = await db('messages')
      .where({ sender_id: playerId, is_system: false })
      .orderBy('sent_at', 'desc')
      .select('id', 'sender_name', 'subject', 'is_read', 'is_system', 'sent_at', 'reply_to_id', 'recipient_id');

    console.log('Sent messages found:', messages.length);

    const messagesWithRecipients = await Promise.all(messages.map(async m => {
      const recipient = await db('players').where({ id: m.recipient_id }).select('username').first();
      return { ...m, recipient_name: recipient?.username || 'Unknown' };
    }));

    res.json({ messages: messagesWithRecipients });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single message
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const messageId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  try {
    const message = await db('messages')
      .where({ id: messageId })
      .where(function() {
        this.where({ recipient_id: playerId }).orWhere({ sender_id: playerId })
      })
      .first();
    
    if (!message) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }

    // Mark as read only if recipient
    if (!message.is_read && message.recipient_id === playerId) {
      await db('messages').where({ id: messageId }).update({ is_read: true });
    }

    res.json({ message });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message
router.post('/send', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { recipientName, subject, body, replyToId } = req.body;

  try {
    if (!recipientName || !body) {
      res.status(400).json({ error: 'Recipient and message body are required.' });
      return;
    }

    const sender = await db('players').where({ id: playerId }).first();
    const recipient = await db('players').where({ username: recipientName }).first();

    if (!recipient) {
      res.status(404).json({ error: `Player "${recipientName}" not found.` });
      return;
    }

    if (recipient.id === playerId) {
      res.status(400).json({ error: 'You cannot message yourself.' });
      return;
    }

    const [message] = await db('messages').insert({
      sender_id: playerId,
      recipient_id: recipient.id,
      sender_name: sender.username,
      subject: subject?.trim() || '(No Subject)',
      body: body.trim(),
      is_read: false,
      is_system: false,
      reply_to_id: replyToId || null,
      sent_at: new Date(),
    }).returning('*');

    // Notify recipient if online
    io.to(`player_${recipient.id}`).emit('new_message', {
      id: message.id,
      senderName: sender.username,
      subject: message.subject,
    });

    logger.info(`Message sent from ${sender.username} to ${recipient.username}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Send message error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete messages
router.delete('/delete', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { messageIds } = req.body; // array of ids

  try {
    await db('messages')
      .where({ recipient_id: playerId })
      .whereIn('id', messageIds)
      .delete();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get unread count
router.get('/unread/count', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const count = await db('messages')
      .where({ recipient_id: playerId, is_read: false })
      .count('id as count')
      .first();
    res.json({ count: parseInt(count?.count as string) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper function for system messages (used internally)
export async function sendSystemMessage(
  recipientId: number,
  subject: string,
  body: string
): Promise<void> {
  await db('messages').insert({
    sender_id: null,
    recipient_id: recipientId,
    sender_name: 'Talaran',
    subject,
    body,
    is_read: false,
    is_system: true,
    sent_at: new Date(),
  });

  io.to(`player_${recipientId}`).emit('new_message', {
    senderName: 'Talaran',
    subject,
  });
}

export default router;