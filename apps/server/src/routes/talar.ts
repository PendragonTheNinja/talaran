import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { failureStatus } from '../lib/serviceResult';
import { absorbGem, getTalarState } from '../services/talar';

// Talar (docs/talar-spec.md): the reservoir now; filling and spells join it.

const router = Router();

// GET /api/talar - the reservoir, for the bar
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ talar: await getTalarState(req.player!.playerId) });
    } catch (err) {
        logger.error(`Talar state error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/talar/absorb   { itemId } - pour one charged gem into the reservoir
router.post('/absorb', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await absorbGem(req.player!.playerId, req.body?.itemId);
        if (!result.success) {
            res.status(failureStatus(result.error)).json({ error: result.error });
            return;
        }
        res.json(result);
    } catch (err) {
        logger.error(`Talar absorb error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
