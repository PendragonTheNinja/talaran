import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';
import { JwtPayload } from '../types';
import { checkSession } from '../lib/sessions';

// A guest deadline is set once, at creation, and never moves. Extending it on
// activity was the original design and it was wrong: a trial that renews
// itself every time you click something is not time-limited at all, it is a
// free account that needs a nudge every hour. Someone who steps away and
// returns to a locked session has not lost anything, because the character
// survives for the whole retention window and claiming it restores everything.

export interface AuthRequest extends Request {
  player?: JwtPayload;
}

/**
 * A valid signature is not enough (audit H1).
 *
 * This used to verify the token and stop there, for thirty days, so a banned
 * player's saved token kept working and a reset password left a thief logged
 * in. Every token is now checked against the player's current session version,
 * ban and guest deadline, in one cached lookup (lib/sessions.ts). Real accounts
 * used to skip the lookup entirely; they no longer can, because a ban has to
 * reach them too. The cache keeps it to about one query per player every thirty
 * seconds.
 */
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

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.player = payload;
  checkSession(payload)
    .then((verdict) => {
      if (verdict.ok) {
        next();
        return;
      }
      res.status(verdict.status).json({ error: verdict.error, reason: verdict.reason });
    })
    .catch(() => {
      res.status(503).json({ error: 'Could not verify session. Try again shortly.' });
    });
}
