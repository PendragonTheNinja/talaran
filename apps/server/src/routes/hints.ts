import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/seen', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { hintKey } = req.body;
  try {
    await db('player_hints')
      .insert({ player_id: playerId, hint_key: hintKey })
      .onConflict(['player_id', 'hint_key'])
      .ignore();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  try {
    const hints = await db('player_hints')
      .where({ player_id: playerId })
      .pluck('hint_key');
    res.json({ seenHints: hints });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;