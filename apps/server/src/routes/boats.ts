import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { boatState, dropHand, layKeel, layPurse, layStock, nameHand, setPayRate, startBoatBuild, takePurse, takeStock } from '../services/boats';

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
router.post('/build', requireAuth, async (req: AuthRequest, res: Response) => send(res, await startBoatBuild(req.player!.playerId, req.body?.boat, req.body?.item, req.body?.owner)));

// Building for hire (docs/antura-plan.md §6b): the owner's controls.
router.post('/hands', requireAuth, async (req: AuthRequest, res: Response) => send(res, await nameHand(req.player!.playerId, req.body?.boat, req.body?.name)));
router.post('/hands/remove', requireAuth, async (req: AuthRequest, res: Response) => send(res, await dropHand(req.player!.playerId, req.body?.boat, req.body?.name)));
router.post('/rate', requireAuth, async (req: AuthRequest, res: Response) => send(res, await setPayRate(req.player!.playerId, req.body?.boat, req.body?.rate)));
router.post('/purse/lay', requireAuth, async (req: AuthRequest, res: Response) => send(res, await layPurse(req.player!.playerId, req.body?.boat, req.body?.amount)));
router.post('/purse/take', requireAuth, async (req: AuthRequest, res: Response) => send(res, await takePurse(req.player!.playerId, req.body?.boat, req.body?.amount)));
router.post('/stock/lay', requireAuth, async (req: AuthRequest, res: Response) => send(res, await layStock(req.player!.playerId, req.body?.boat, req.body?.item, req.body?.quantity)));
router.post('/stock/take', requireAuth, async (req: AuthRequest, res: Response) => send(res, await takeStock(req.player!.playerId, req.body?.boat, req.body?.item, req.body?.quantity)));

export default router;
