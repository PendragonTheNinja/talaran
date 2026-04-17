import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';
import { JwtPayload } from '../types';

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
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}