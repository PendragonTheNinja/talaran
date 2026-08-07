import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { botCheckGate } from '../services/botCheck';
import { logger } from '../index';
import {
    getHusbandryState,
    startBuildPen,
    startDemolishPen,
    startFeed,
    startFeedAll,
    startMuck,
    startMuckAll,
    startCollect,
    startCollectAll,
    startSlaughter,
    startSlaughterAll,
    startTame,
    placeAnimal,
    renameAnimal,
} from '../services/husbandry';

const router = Router();

/**
 * Every start route can lose a race: two requests arrive together, both pass the
 * busy() check, and the unique constraint on player_actions.player_id rejects the
 * second. That is the real guard, so a 23505 becomes a 409 rather than a 500.
 */
function startHandler(
    start: (playerId: number, ...args: any[]) => Promise<{ ok: boolean; error?: string; timerSeconds?: number }>,
    message: string,
    argsFrom: (req: AuthRequest) => any[] = () => [],
) {
    return async (req: AuthRequest, res: Response) => {
        try {
            const r = await start(req.player!.playerId, ...argsFrom(req));
            if (!r.ok) { res.status(400).json({ error: r.error }); return; }
            res.json({ message, timerSeconds: r.timerSeconds });
        } catch (err: any) {
            if (err?.code === '23505') {
                res.status(409).json({ error: 'You are already performing an action' });
                return;
            }
            logger.error(`Husbandry start error: ${err}`);
            res.status(500).json({ error: 'Server error' });
        }
    };
}

// Pens, stock, and everything the client needs to render the Animals tab.
router.get('/state', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await getHusbandryState(req.player!.playerId));
    } catch (err) {
        logger.error(`Husbandry state error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Timed actions — the game tick resolves each one.
router.post('/build-pen', requireAuth, botCheckGate,
    startHandler(startBuildPen, 'Building begun', (req) => [req.body.penType]));

router.post('/feed', requireAuth, botCheckGate,
    startHandler(startFeed, 'Feeding', (req) => [req.body.penId]));

router.post('/demolish-pen', requireAuth, botCheckGate,
    startHandler(startDemolishPen, 'Pulling it down', (req) => [req.body.penId]));

router.post('/feed-all', requireAuth, botCheckGate,
    startHandler(startFeedAll, 'Feeding'));

router.post('/muck-all', requireAuth, botCheckGate,
    startHandler(startMuckAll, 'Mucking out'));

router.post('/muck', requireAuth, botCheckGate,
    startHandler(startMuck, 'Mucking out', (req) => [req.body.penId]));

router.post('/collect', requireAuth, botCheckGate,
    startHandler(startCollect, 'Collecting', (req) => [req.body.animalId]));

router.post('/collect-all', requireAuth, botCheckGate,
    startHandler(startCollectAll, 'Collecting', (req) => [req.body.penId]));

router.post('/slaughter', requireAuth, botCheckGate,
    startHandler(startSlaughter, 'Slaughtering', (req) => [req.body.animalId]));

router.post('/slaughter-all', requireAuth, botCheckGate,
    startHandler(startSlaughterAll, 'Slaughtering', (req) => [req.body.penId]));

router.post('/tame', requireAuth, botCheckGate,
    startHandler(startTame, 'Haltering', (req) => [req.body.animalId]));

// Instant — setting a chick down is not work, so it does not take a timer slot.
router.post('/place', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const r = await placeAnimal(req.player!.playerId, req.body.penId, req.body.speciesId);
        if (!r.success) { res.status(400).json({ error: r.error }); return; }
        res.json({ message: r.message });
    } catch (err) {
        logger.error(`Husbandry place error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/rename', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const r = await renameAnimal(req.player!.playerId, req.body.animalId, req.body.name);
        if (!r.success) { res.status(400).json({ error: r.error }); return; }
        res.json({ message: r.message });
    } catch (err) {
        logger.error(`Husbandry rename error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
