import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { failureStatus } from '../lib/serviceResult';
import { museumHere, museumState, donate } from '../services/museum';

// Island Museums (docs/WORLD-EVENTS-AND-MUSEUMS.md, Part 2). The work, and the
// presence check on donating, is in services/museum.ts.
const router = Router();

// The museum where the player stands (null elsewhere), for the location panel.
router.get('/here', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ museum: await museumHere(req.player!.playerId) });
    } catch (err) {
        logger.error(`Museum here error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/donate', requireAuth, async (req: AuthRequest, res: Response) => {
    const result = await donate(req.player!.playerId, req.body?.caseId);
    if ('error' in result) res.status(failureStatus(result.error)).json(result);
    else res.json(result);
});

// One museum, as this player sees it. Registered last: /:id matches anything.
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const state = await museumState(req.player!.playerId, Math.floor(Number(req.params.id)));
        if (!state) {
            res.status(404).json({ error: 'There is no such museum.' });
            return;
        }
        res.json(state);
    } catch (err) {
        logger.error(`Museum state error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
