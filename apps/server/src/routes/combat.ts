import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { botCheckGate } from '../services/botCheck';
import { eatFood, fightState, fleeFight, startFight } from '../services/combatFights';

// Fighting (docs/combat-spec.md §9, §10). The fight itself lives in
// services/combatFights.ts; these are thin doors into it.

const router = Router();

/** A positive whole number from the client, or null (CLAUDE.md §4 rule 9). */
function wholeId(x: unknown): number | null {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The fight as it stands, settled to now, and the food the player could eat.
router.get('/state', requireAuth, async (req: AuthRequest, res: Response) => {
  res.json(await fightState(req.player!.playerId));
});

router.post('/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
  const spotId = wholeId(req.body?.spotId);
  if (!spotId) {
    res.status(400).json({ error: 'spotId is required' });
    return;
  }
  const creatureId = req.body?.creatureId === undefined || req.body?.creatureId === null ? null : wholeId(req.body.creatureId);
  const result = await startFight(req.player!.playerId, spotId, creatureId);
  if (!result.success) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

// Eat one fight food, in a fight or out of one.
router.post('/eat', requireAuth, async (req: AuthRequest, res: Response) => {
  const itemId = wholeId(req.body?.itemId);
  if (!itemId) {
    res.status(400).json({ error: 'itemId is required' });
    return;
  }
  const result = await eatFood(req.player!.playerId, itemId);
  if (!result.success) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

router.post('/flee', requireAuth, async (req: AuthRequest, res: Response) => {
  const result = await fleeFight(req.player!.playerId);
  if (!result.success) {
    res.status(result.status ?? 400).json({ error: result.error, hp: result.hp });
    return;
  }
  res.json(result);
});

export default router;
