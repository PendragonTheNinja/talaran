import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { cancelHire, hiresHere, layHireStock, offerHire, startHireBuild, takeHireStock } from '../services/hires';

// Hiring a carpenter for a homestead or a shop (services/hires.ts). Every
// rule, presence included, is the service's; these only pass the request through.

const router = Router();

type Result = { ok: boolean; status?: number; error?: string };
function send(res: Response, r: Result) {
    if (!r.ok) { res.status(r.status ?? 400).json({ error: r.error }); return; }
    res.json(r);
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const state = await hiresHere(req.player!.playerId, req.query.kind);
        if (!state) { res.status(400).json({ error: 'There is nothing to hire for here.' }); return; }
        res.json(state);
    } catch (err) {
        logger.error(`hire state error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => send(res, await offerHire(req.player!.playerId, req.body)));
router.post('/cancel', requireAuth, async (req: AuthRequest, res: Response) => send(res, await cancelHire(req.player!.playerId, req.body?.kind)));
router.post('/stock/lay', requireAuth, async (req: AuthRequest, res: Response) => send(res, await layHireStock(req.player!.playerId, req.body?.kind, req.body?.item, req.body?.quantity)));
router.post('/stock/take', requireAuth, async (req: AuthRequest, res: Response) => send(res, await takeHireStock(req.player!.playerId, req.body?.kind, req.body?.item, req.body?.quantity)));
router.post('/build', requireAuth, async (req: AuthRequest, res: Response) => send(res, await startHireBuild(req.player!.playerId, req.body?.hire)));

export default router;
