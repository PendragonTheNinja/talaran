import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { failureStatus } from '../lib/serviceResult';
import { logger } from '../lib/logger';
import { crierStateFor, answerPoll, dismissPoll, markResultsSeen } from '../services/crierPolls';

// The Town Crier's polls, player side (services/crierPolls.ts). Who may answer
// is decided in the service, so the rule holds however a call arrives.
const router = Router();

/** GET /api/crier: open polls this player may answer, results to show, and their chits. */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await crierStateFor(req.player!.playerId));
    } catch (err) {
        logger.error(`crier state: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/:id/answer', requireAuth, async (req: AuthRequest, res: Response) => {
    const r = await answerPoll(req.player!.playerId, req.params.id, req.body?.answers);
    if (!r.ok) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json({ chitsAwarded: r.chitsAwarded, chits: r.chits });
});

router.post('/:id/dismiss', requireAuth, async (req: AuthRequest, res: Response) => {
    const r = await dismissPoll(req.player!.playerId, req.params.id);
    if (!r.ok) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json({ success: true });
});

router.post('/:id/results-seen', requireAuth, async (req: AuthRequest, res: Response) => {
    const r = await markResultsSeen(req.player!.playerId, req.params.id);
    if (!r.ok) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json({ success: true });
});

export default router;
