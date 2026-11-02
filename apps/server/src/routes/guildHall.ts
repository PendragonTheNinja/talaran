import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import {
    abandonHall, depositGold, depositItems, foundHall, hallState, startBuild, withdrawGold, withdrawItems,
} from '../services/guildHall';

// Guild halls and storehouses (services/guildHall.ts). Every rule, presence
// included, is the service's; these only pass the request through.

const router = Router();

type Result = { ok: boolean; status?: number; error?: string };
function send(res: Response, r: Result) {
    if (!r.ok) { res.status(r.status ?? 400).json({ error: r.error }); return; }
    res.json(r);
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await hallState(req.player!.playerId));
    } catch (err) {
        logger.error(`guild hall state error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

router.post('/found', requireAuth, async (req: AuthRequest, res: Response) => send(res, await foundHall(req.player!.playerId)));
router.post('/abandon', requireAuth, async (req: AuthRequest, res: Response) => send(res, await abandonHall(req.player!.playerId)));
router.post('/build', requireAuth, async (req: AuthRequest, res: Response) => send(res, await startBuild(req.player!.playerId, req.body?.item)));
router.post('/deposit', requireAuth, async (req: AuthRequest, res: Response) => send(res, await depositItems(req.player!.playerId, req.body?.itemId, req.body?.quantity)));
router.post('/withdraw', requireAuth, async (req: AuthRequest, res: Response) => send(res, await withdrawItems(req.player!.playerId, req.body?.itemId, req.body?.quantity)));
router.post('/gold/deposit', requireAuth, async (req: AuthRequest, res: Response) => send(res, await depositGold(req.player!.playerId, req.body?.amount)));
router.post('/gold/withdraw', requireAuth, async (req: AuthRequest, res: Response) => send(res, await withdrawGold(req.player!.playerId, req.body?.amount)));

export default router;
