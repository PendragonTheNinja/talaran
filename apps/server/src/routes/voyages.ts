import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { botCheckGate } from '../services/botCheck';
import { putToSea, sailHome, sailOn, voyageState } from '../services/voyages';

// Voyages (services/voyages.ts): putting to sea, sailing on, sailing home.
// Every rule, presence included, is the service's. Setting out is behind the
// bot check, as a road is (routes/travel.ts).

const router = Router();

type Result = { ok: boolean; status?: number; error?: string };
function send(res: Response, r: Result) {
    if (!r.ok) { res.status(r.status ?? 400).json({ error: r.error }); return; }
    res.json(r);
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await voyageState(req.player!.playerId));
    } catch (err) {
        logger.error(`voyage state error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

router.post('/sail', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => send(res, await putToSea(req.player!.playerId, req.body?.boat)));
router.post('/on', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => send(res, await sailOn(req.player!.playerId)));
router.post('/home', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => send(res, await sailHome(req.player!.playerId)));

export default router;
