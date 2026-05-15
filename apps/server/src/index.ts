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

import playerRoutes from './routes/player';
import locationRoutes from './routes/location';
import inventoryRoutes from './routes/inventory';

app.use('/api/auth', authRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/travel', travelRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/mining', miningRoutes);
app.use('/api/smithing', smithingRoutes);
app.use('/api/hints', hintsRoutes);
app.use('/api/chat', chatRoutes);

// Socket.io — put each player in their own room for targeted messages
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join', async (playerId: number) => {
    socket.join(`player_${playerId}`);
    socket.data.playerId = playerId;
    connectedPlayers.add(playerId);
    logger.info(`Player ${playerId} joined their socket room`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
    if (socket.data.playerId) {
      connectedPlayers.delete(socket.data.playerId);
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