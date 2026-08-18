import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { createLogger, format, transports } from 'winston';
import authRoutes from './routes/auth';
import actionRoutes from './routes/actions';
import { startGameTick } from './services/gameTick';
import { startPlaytimeTracking } from './services/playtime';
import travelRoutes from './routes/travel';
import equipmentRoutes from './routes/equipment';
import miningRoutes from './routes/mining';
import smithingRoutes from './routes/smithing';
import carpentryRoutes from './routes/carpentry';
import hintsRoutes from './routes/hints';
import chatRoutes from './routes/chat';
import db from './db';
import { verifyToken } from './config/jwt';
import guildRoutes from './routes/guilds';
import guildForumRoutes from './routes/guildForum';
import messagesRoutes from './routes/messages';
import forumRoutes from './routes/forum';
import newsRoutes from './routes/news';
import manualRoutes from './routes/manual';
import { takeWeeklySnapshot, getWeekStart } from './services/weeklySnapshot';
import { pruneChatHistory } from './services/chatRetention';
import highscoresRoutes from './routes/highscores';
import groundItemsRoutes from './routes/groundItems';
import adminRoutes from './routes/admin';
import adminContentRoutes from './routes/adminContent';
import adminManualRoutes from './routes/adminManual';
import talersRoutes from './routes/talers';
import paddleWebhookRoutes from './routes/paddleWebhook';
import storeRoutes from './routes/store';
import marketplaceRoutes from './routes/marketplace';
import shopRoutes from './routes/shops';
import paletteRoutes from './routes/palettes';
import settingsRoutes from './routes/settings';
import { generalLimit, authLimit, chatReadLimit, forumLimit, guestLimit } from './middleware/rateLimit';
import playerRoutes from './routes/player';
import locationRoutes from './routes/location';
import inventoryRoutes from './routes/inventory';
import tradeRoutes from './routes/trades';
import questRoutes from './routes/quests';
import npcRoutes from './routes/npcs';
import { issueBotCheck } from './services/botCheck';
import { markSeen, markOnline } from './lib/presence';
import huntingRoutes from './routes/hunting';
import foragingRoutes from './routes/foraging';
import farmingRoutes from './routes/farming';
import husbandryRoutes from './routes/husbandry';
import propertyRoutes from './routes/property';
import tallyRoutes from './routes/tally';
import recipeRoutes from './routes/recipes';
import tanningRoutes from './routes/tanning';
import trappingRoutes from './routes/trapping';
import fishingRoutes from './routes/fishing';
import lootLogRoutes from './routes/lootLog';

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
// Capture the raw body alongside parsed JSON — Paddle webhook signatures are
// HMAC'd over the exact bytes received, so verification needs the raw payload.
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
}));
app.set('trust proxy', 1);
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

import cors from 'express';

// Audit finding 5: this reflected whatever origin asked, making every website
// an allowed origin. Mirrors the allow-list the socket server already uses.
const ALLOWED_ORIGINS = [
  'https://talaran.net',
  'https://www.talaran.net',
  'http://localhost:5173',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
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

// Audit finding 2: Express only applies middleware to routes registered AFTER
// it. This sat below ~30 mounts, leaving them all unthrottled.
app.use('/api', generalLimit);

// Guest creation gets its own, tighter budget before the shared auth limit.
app.use('/api/auth/guest', guestLimit);
app.use('/api/auth', authLimit, authRoutes);
// chatLimit and chatReadLimit existed but were never applied. They are applied
// per route inside routes/chat.ts, NOT here: mounting the 30-per-minute send
// limit across the whole router also counted every history GET against it, and
// ChatPanel fetches seven of those on each mount. A couple of reloads inside a
// minute was enough to make chat refuse to send, which read as a bug in chat
// rather than as a rate limit doing its job.
app.use('/api/chat', chatRoutes);
app.use('/api/forum', forumLimit, forumRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/travel', travelRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/mining', miningRoutes);
app.use('/api/smithing', smithingRoutes);
app.use('/api/carpentry', carpentryRoutes);
app.use('/api/hints', hintsRoutes);
// Mounted before /api/guilds so a :param route cannot swallow /forum.
app.use('/api/guilds/forum', guildForumRoutes);
app.use('/api/guilds', guildRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/news', newsRoutes);
// Public: the manual must render for logged-out visitors.
app.use('/api/manual', manualRoutes);
app.use('/api/highscores', highscoresRoutes);
app.use('/api/ground-items', groundItemsRoutes);
app.use('/api/admin/content', adminContentRoutes);
app.use('/api/admin/manual', adminManualRoutes);
app.use('/api/talers', talersRoutes);
app.use('/api/paddle', paddleWebhookRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/palettes', paletteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/npcs', npcRoutes);
app.use('/api/hunting', huntingRoutes);
app.use('/api/foraging', foragingRoutes);
app.use('/api/farming', farmingRoutes);
app.use('/api/husbandry', husbandryRoutes);
app.use('/api/property', propertyRoutes);
app.use('/api/tally', tallyRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/tanning', tanningRoutes);
app.use('/api/trapping', trappingRoutes);
app.use('/api/fishing', fishingRoutes);
app.use('/api/loot-log', lootLogRoutes);

// Socket.io.
//
// Identity is established ONCE here, from the JWT in the handshake, and never
// from anything the client says afterwards. Previously `join` took a player id
// straight from the client, so any browser console could join any player's room
// and receive their private messages, trade offers, quest rewards, vein
// discoveries, and their guild's chat.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== 'string') {
    return next(new Error('unauthorized'));
  }

  try {
    const payload = verifyToken(token);
    if (!payload?.playerId) return next(new Error('unauthorized'));
    socket.data.playerId = payload.playerId;   // authoritative
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

// Put each player in their own room for targeted messages
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // The client still emits 'join', but its argument is ignored: the id comes
  // from the verified handshake. No client change is needed.
  socket.on('join', async () => {
    const playerId: number = socket.data.playerId;
    if (!playerId) return;

    socket.join(`player_${playerId}`);
    connectedPlayers.add(playerId);
    markOnline(playerId);   // second presence signal; see lib/presence.ts
    logger.info(`Player ${playerId} joined their socket room`);

    // Re-send bot check if one is still outstanding for this player.
    try {
      const player = await db('players').where({ id: playerId }).first();
      if (player && player.bot_check_answer !== null) {
        await issueBotCheck(playerId);
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
    // Stamp the departure so the tick can stop resolving this player's action.
    // See lib/presence.ts: the cancellation itself happens at resolution time,
    // not here, so a reconnect inside the grace window costs them nothing.
    markSeen(socket.data.playerId);

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
startPlaytimeTracking();

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

// Audit finding 7: chat_messages was never pruned. Daily, and once shortly
// after boot so the first large backlog clears without waiting a day.
setTimeout(function scheduleChatPrune() {
  pruneChatHistory();
  setTimeout(scheduleChatPrune, 24 * 60 * 60 * 1000);
}, 60 * 1000);