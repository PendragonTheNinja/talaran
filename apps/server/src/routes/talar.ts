import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { failureStatus } from '../lib/serviceResult';
import db from '../db';
import { botCheckGate } from '../services/botCheck';
import { absorbGem, fillOptions, getTalarState, startFill } from '../services/talar';

// Talar (docs/talar-spec.md): the reservoir now; filling and spells join it.

const router = Router();

// GET /api/talar - the reservoir, for the bar
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ talar: await getTalarState(req.player!.playerId) });
    } catch (err) {
        logger.error(`Talar state error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/talar/absorb   { itemId } - pour one charged gem into the reservoir
router.post('/absorb', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await absorbGem(req.player!.playerId, req.body?.itemId);
        if (!result.success) {
            res.status(failureStatus(result.error)).json({ error: result.error });
            return;
        }
        res.json(result);
    } catch (err) {
        logger.error(`Talar absorb error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/talar/fill - what can be filled here: the open gem and the cut gems in the pack
router.get('/fill', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await fillOptions(req.player!.playerId));
    } catch (err) {
        logger.error(`Talar fill options error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/talar/fill/start   { itemId } - resume the open gem, or open this one
router.post('/fill/start', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        if (await db('player_actions').where({ player_id: playerId }).first()) {
            res.status(409).json({ error: 'You are already performing an action' });
            return;
        }
        const itemId = req.body?.itemId == null ? null : Number(req.body.itemId);
        const result = await startFill(playerId, itemId);
        if (!result.ok) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        logger.info(`Player ${playerId} started filling ${result.gemName}`);
        res.json({ message: 'Filling', timerSeconds: result.timerSeconds, gemName: result.gemName });
    } catch (err) {
        logger.error(`Talar fill start error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
