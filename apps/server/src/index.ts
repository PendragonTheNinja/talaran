import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { createLogger, format, transports } from 'winston';
import authRoutes from './routes/auth';
import actionRoutes from './routes/actions';
import { startGameTick } from './services/gameTick';
import travelRoutes from './routes/travel';
import equipmentRoutes from './routes/equipment';
import miningRoutes from './routes/mining';
import smithingRoutes from './routes/smithing';
import hintsRoutes from './routes/hints';
import chatRoutes from './routes/chat';
import db from './db';
import guildRoutes from './routes/guilds';
import messagesRoutes from './routes/messages';
import forumRoutes from './routes/forum';
import newsRoutes from './routes/news';
import { takeWeeklySnapshot, getWeekStart } from './services/weeklySnapshot';
import highscoresRoutes from './routes/highscores';
import groundItemsRoutes from './routes/groundItems';
import adminRoutes from './routes/admin';
import settingsRoutes from './routes/settings';
import { generalLimit, authLimit, chatLimit, forumLimit } from './middleware/rateLimit';
import playerRoutes from './routes/player';
import locationRoutes from './routes/location';
import inventoryRoutes from './routes/inventory';
import tradeRoutes from './routes/trades';

dotenv.config();

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.colorize(),
    format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level}: ${message}`;
    })
  ),
  transports: [new transports.Console()],
});

export const connectedPlayers = new Set<number>();

const app = express();
app.use(express.json());

import cors from 'express';

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
    ],
    methods: ['GET', 'POST'],
  },
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', game: 'Talaran' });
});

app.use('/api/auth', authLimit, authRoutes);
app.use('/api/chat', chatLimit, chatRoutes);
app.use('/api/forum', forumLimit, forumRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/travel', travelRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/mining', miningRoutes);
app.use('/api/smithing', smithingRoutes);
app.use('/api/hints', hintsRoutes);
app.use('/api/guilds', guildRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/highscores', highscoresRoutes);
app.use('/api/ground-items', groundItemsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', generalLimit);
app.use('/api/trades', tradeRoutes);

// Socket.io — put each player in their own room for targeted messages
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join', async (playerId: number) => {
    socket.join(`player_${playerId}`);
    socket.data.playerId = playerId;
    connectedPlayers.add(playerId);
    logger.info(`Player ${playerId} joined their socket room`);

    // Re-send bot check if one is pending
    try {
      const pendingBotCheck = await db('player_actions')
        .where({ player_id: playerId, bot_check_pending: true })
        .first();
      if (pendingBotCheck) {
        socket.emit('bot_check_required', {
          message: 'Please confirm you are still playing.',
        });
        logger.info(`Re-sent bot check to reconnecting player ${playerId}`);
      }
    } catch (err) {
      logger.error(`Bot check reconnect error: ${err}`);
    }

    // Join guild room if in a guild
    try {
      const player = await db('players').where({ id: playerId }).select('guild_id').first();
      if (player?.guild_id) {
        socket.join(`guild_${player.guild_id}`);
      }
    } catch (err) {
      logger.error(`Guild room join error: ${err}`);
    }
  });

  socket.on('disconnect', async () => {
    if (!socket.data.playerId) return;
    connectedPlayers.delete(socket.data.playerId);

    // Cancel any active trades
    try {
      const trade = await db('trades')
        .where(function () {
          this.where({ player1_id: socket.data.playerId }).orWhere({ player2_id: socket.data.playerId })
        })
        .whereIn('status', ['pending', 'active'])
        .first();

      if (trade) {
        await db('trades').where({ id: trade.id }).update({ status: 'cancelled' });
        const otherId = trade.player1_id === socket.data.playerId ? trade.player2_id : trade.player1_id;
        io.to(`player_${otherId}`).emit('trade_cancelled', { reason: 'The other player disconnected.' });
      }
    } catch (err) {
      logger.error(`Trade disconnect cleanup error: ${err}`);
    }
  });

  socket.on('join_location', async (locationId: number) => {
    socket.rooms.forEach(room => {
      if (room.startsWith('location_') || room.startsWith('region_')) {
        socket.leave(room);
      }
    });
    socket.join(`location_${locationId}`);

    try {
      const location = await db('locations').where({ id: locationId }).first();
      if (location?.region) {
        socket.join(`region_${location.region.replace(/ /g, '_')}`);
      }
    } catch (err) {
      logger.error(`Region join error: ${err}`);
    }
  });
});

// Start the game tick
startGameTick(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Talaran server running on port ${PORT}`);
});

// Take weekly snapshot on startup if not taken this week
const now = new Date();
const weekStart = getWeekStart(now);
db('skill_snapshots')
  .where('snapshot_date', weekStart)
  .count('id as count')
  .first()
  .then(result => {
    if (parseInt(result?.count as string) === 0) {
      takeWeeklySnapshot();
    }
  });

// Schedule weekly snapshot every Monday
const msUntilMonday = () => {
  const now = new Date();
  const nextMonday = getWeekStart(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  return nextMonday.getTime() - now.getTime();
};

setTimeout(function scheduleSnapshot() {
  takeWeeklySnapshot();
  setTimeout(scheduleSnapshot, 7 * 24 * 60 * 60 * 1000);
}, msUntilMonday());

// Bot check for idle players — runs every 5 minutes
setInterval(async () => {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  for (const playerId of connectedPlayers) {
    try {
      const player = await db('players').where({ id: playerId }).first();

      // Skip if they have an active action (gameTick handles those)
      const activeAction = await db('player_actions').where({ player_id: playerId }).first();
      if (activeAction) continue;

      // Check last bot check time
      const lastCheck = player.last_bot_check ? new Date(player.last_bot_check) : new Date(player.last_login || player.created_at);

      if (lastCheck < thirtyMinutesAgo) {
        await db('players').where({ id: playerId }).update({ last_bot_check: now });
        io.to(`player_${playerId}`).emit('bot_check_required', {
          message: 'Please confirm you are still playing.',
        });
        logger.info(`Idle bot check triggered for player ${playerId}`);
      }
    } catch (err) {
      logger.error(`Idle bot check error for player ${playerId}: ${err}`);
    }
  }
}, 5 * 60 * 1000);