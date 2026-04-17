import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { createLogger, format, transports } from 'winston';
import authRoutes from './routes/auth';
import actionRoutes from './routes/actions';
import { startGameTick } from './services/gameTick';

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

const app = express();
app.use(express.json());

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', game: 'Talaran' });
});

app.use('/api/auth', authRoutes);
app.use('/api/actions', actionRoutes);

// Socket.io — put each player in their own room for targeted messages
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join', (playerId: number) => {
    socket.join(`player_${playerId}`);
    logger.info(`Player ${playerId} joined their socket room`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Start the game tick
startGameTick(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Talaran server running on port ${PORT}`);
});