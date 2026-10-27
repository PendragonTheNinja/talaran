import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { churchHere, churchState } from '../services/church';

// Churches (services/church.ts), on the museum's routes.

const router = Router();

router.get('/here', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ church: await churchHere(req.player!.playerId) });
    } catch (err) {
        logger.error(`Church here error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// One church. Registered last: /:id matches anything.
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const state = await churchState(Math.floor(Number(req.params.id)));
        if (!state) {
            res.status(404).json({ error: 'There is no such church.' });
            return;
        }
        res.json(state);
    } catch (err) {
        logger.error(`Church state error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
