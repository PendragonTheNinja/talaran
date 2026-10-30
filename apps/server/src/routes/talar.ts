import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { failureStatus, SERVER_ERROR } from '../lib/serviceResult';
import db from '../db';
import { botCheckGate } from '../services/botCheck';
import { absorbGem, fillOptions, getTalarState, startFill } from '../services/talar';
import { castSpell, listSpells, spellTargets, startVigil, portalsHere, stepThroughPortal } from '../services/spells';

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
        const result = await absorbGem(req.player!.playerId, req.body?.itemId, req.body?.acceptWaste === true);
        if (!result.success) {
            // 409 with the waste: the client asks before trying again.
            if (result.waste) { res.status(409).json({ error: result.error, waste: result.waste }); return; }
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

// GET /api/talar/spells - every spell, learned or not, and whether a church is here to learn at
router.get('/spells', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await listSpells(req.player!.playerId));
    } catch (err) {
        logger.error(`Spell list error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/talar/spells/vigil   { key } - at a church; a timed action that ends in learning the spell
router.post('/spells/vigil', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const result = await startVigil(req.player!.playerId, String(req.body?.key ?? ''));
    if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
    res.json(result);
});

// GET /api/talar/spells/:key/targets   what the spell can be cast at (Daily Step's places)
router.get('/spells/:key/targets', requireAuth, async (req: AuthRequest, res: Response) => {
    const result = await spellTargets(req.player!.playerId, String(req.params.key));
    if (!result.success) { res.status(failureStatus(result.error)).json({ error: result.error }); return; }
    res.json({ targets: result.targets });
});

// GET /api/talar/portals/here   doorways open where the player stands (Portal)
router.get('/portals/here', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ portals: await portalsHere(req.player!.playerId) });
    } catch (err) {
        logger.error(`portals here error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

// POST /api/talar/portals/:id/step   go through; leaves the way travel does
router.post('/portals/:id/step', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const result = await stepThroughPortal(req.player!.playerId, Number(req.params.id));
    if (!result.success) { res.status(failureStatus(result.error)).json({ error: result.error }); return; }
    res.json(result);
});

// POST /api/talar/spells/cast   { key, ...params } - instant; never takes the action slot
router.post('/spells/cast', requireAuth, botCheckGate, async (req: AuthRequest, res: Response) => {
    const { key, ...params } = (req.body ?? {}) as Record<string, unknown>;
    const result = await castSpell(req.player!.playerId, String(key ?? ''), params);
    if (!result.success) { res.status(failureStatus(result.error)).json({ error: result.error }); return; }
    res.json(result);
});

export default router;
