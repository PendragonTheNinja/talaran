import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { botCheckGate } from '../services/botCheck';
import { logger } from '../index';
import {
    getFarmState,
    startEstablish,
    startBuildPlot,
    startTill,
    startSow,
    startHarvest,
    startManure,
} from '../services/farming';

const router = Router();

// Current player's farm (or the build offer if they have no farmstead yet).
router.get('/state', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await getFarmState(req.player!.playerId));
    } catch (err) {
        logger.error(`Farm state error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// All of these begin a TIMED action; the game tick resolves it.
router.post('/establish', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const r = await startEstablish(req.player!.playerId);
    if (!r.ok) { res.status(400).json({ error: r.error }); return; }
    res.json({ message: 'Construction begun', timerSeconds: r.timerSeconds });
});

router.post('/build-plot', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const r = await startBuildPlot(req.player!.playerId);
    if (!r.ok) { res.status(400).json({ error: r.error }); return; }
    res.json({ message: 'Fencing begun', timerSeconds: r.timerSeconds });
});

router.post('/till', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const r = await startTill(req.player!.playerId, req.body.plotId);
    if (!r.ok) { res.status(400).json({ error: r.error }); return; }
    res.json({ message: 'Tilling', timerSeconds: r.timerSeconds });
});

router.post('/sow', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const { plotId, cropId, seedCount } = req.body;
    const r = await startSow(req.player!.playerId, plotId, cropId, seedCount);
    if (!r.ok) { res.status(400).json({ error: r.error }); return; }
    res.json({ message: 'Sowing', timerSeconds: r.timerSeconds });
});

router.post('/harvest', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const r = await startHarvest(req.player!.playerId, req.body.plotId);
    if (!r.ok) { res.status(400).json({ error: r.error }); return; }
    res.json({ message: 'Harvesting', timerSeconds: r.timerSeconds });
});

router.post('/manure', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const r = await startManure(req.player!.playerId, req.body.plotId);
    if (!r.ok) { res.status(400).json({ error: r.error }); return; }
    res.json({ message: 'Spreading manure', timerSeconds: r.timerSeconds });
});

export default router;
