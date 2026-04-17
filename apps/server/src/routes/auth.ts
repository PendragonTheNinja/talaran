import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import db from '../db';
import { signToken } from '../config/jwt';
import { Player } from '../types';
import { logger } from '../index';

const router = Router();
const SALT_ROUNDS = 12;

// Register
router.post('/register', async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: 'Username, email and password are required' });
    return;
  }

  if (username.length < 3 || username.length > 32) {
    res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const existing = await db('players')
      .where({ username })
      .orWhere({ email })
      .first();

    if (existing) {
      res.status(409).json({ error: 'Username or email already taken' });
      return;
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const [player] = await db('players')
      .insert({ username, email, password_hash })
      .returning(['id', 'username', 'email']);

    const token = signToken({ playerId: player.id, username: player.username });

    logger.info(`New player registered: ${username}`);
    res.status(201).json({ token, player });
  } catch (err) {
    logger.error(`Registration error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  try {
    const player = await db('players')
      .where({ username })
      .first() as Player | undefined;

    if (!player) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    if (player.is_banned) {
      res.status(403).json({ error: 'This account has been banned' });
      return;
    }

    const valid = await bcrypt.compare(password, player.password_hash);

    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    await db('players')
      .where({ id: player.id })
      .update({ last_login: new Date() });

    const token = signToken({ playerId: player.id, username: player.username });

    logger.info(`Player logged in: ${username}`);
    res.json({ token, player: { id: player.id, username: player.username, email: player.email } });
  } catch (err) {
    logger.error(`Login error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;