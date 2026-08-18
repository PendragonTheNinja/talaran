import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';
import { JwtPayload } from '../types';
import db from '../db';

// A guest deadline is set once, at creation, and never moves. Extending it on
// activity was the original design and it was wrong: a trial that renews
// itself every time you click something is not time-limited at all, it is a
// free account that needs a nudge every hour. Someone who steps away and
// returns to a locked session has not lost anything, because the character
// survives for the whole retention window and claiming it restores everything.
//
// Only guest tokens reach any of this. A real account carries no isGuest
// claim and takes the original path with no extra query.

export interface AuthRequest extends Request {
  player?: JwtPayload;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyToken(token);
    req.player = payload;

    if (payload.isGuest) {
      void handleGuestSession(payload.playerId, res, next);
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function handleGuestSession(
  playerId: number,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const row = await db('players')
      .select('is_guest', 'guest_expires_at')
      .where({ id: playerId })
      .first();

    // Swept, or upgraded and re-issued a token that still says guest.
    if (!row) {
      res.status(401).json({ error: 'This guest session has ended.', reason: 'guest_expired' });
      return;
    }
    if (!row.is_guest) {
      next();
      return;
    }

    if (row.guest_expires_at && new Date(row.guest_expires_at).getTime() <= Date.now()) {
      // 403 rather than 401: the token is fine, the session is over. The
      // client uses `reason` to show the claim-your-character panel instead
      // of bouncing them to a login form they never filled in.
      res.status(403).json({
        error: 'Your guest session has ended. Claim your character to keep playing.',
        reason: 'guest_expired',
      });
      return;
    }

    next();
  } catch {
    res.status(503).json({ error: 'Could not verify session. Try again shortly.' });
  }
}