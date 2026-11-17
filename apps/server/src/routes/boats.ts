import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { boatState, layKeel, startBoatBuild } from '../services/boats';

// Boats on a slip (services/boats.ts). Every rule, presence included, is the
// service's; these only pass the request through.

const router = Router();

type Result = { ok: boolean; status?: number; error?: string };
function send(res: Response, r: Result) {
    if (!r.ok) { res.status(r.status ?? 400).json({ error: r.error }); return; }
    res.json(r);
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await boatState(req.player!.playerId));
    } catch (err) {
        logger.error(`boat state error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

router.post('/keel', requireAuth, async (req: AuthRequest, res: Response) => send(res, await layKeel(req.player!.playerId, req.body?.boat)));
router.post('/build', requireAuth, async (req: AuthRequest, res: Response) => send(res, await startBoatBuild(req.player!.playerId, req.body?.boat, req.body?.item)));

export default router;
