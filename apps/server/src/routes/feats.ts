import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';
import { listFeats, wearTitle, wearBadge } from '../services/feats';

const router = Router();

/**
 * GET /api/feats - the panel.
 *
 * Evaluates on the way through, so opening the panel is itself a checkpoint.
 * A player who has been away for a week sees everything they earned while the
 * evaluator was not looking.
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await listFeats(req.player!.playerId));
    } catch (err) {
        logger.error(`List feats error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** POST /api/feats/title - wear one, or pass null to wear none. */
router.post('/title', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const raw = req.body?.title;
        const title = raw === null || raw === '' ? null : String(raw);

        const result = await wearTitle(req.player!.playerId, title);
        if (!result.ok) return res.status(400).json({ error: result.error });

        res.json({ success: true, wornTitle: title });
    } catch (err) {
        logger.error(`Wear title error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** POST /api/feats/badge - wear one, or pass null to wear none. */
router.post('/badge', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const raw = req.body?.badge;
        const badge = raw === null || raw === '' ? null : String(raw);

        const result = await wearBadge(req.player!.playerId, badge);
        if (!result.ok) return res.status(400).json({ error: result.error });

        res.json({ success: true, wornBadge: badge });
    } catch (err) {
        logger.error(`Wear badge error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
