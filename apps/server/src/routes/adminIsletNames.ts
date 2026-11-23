import { Router, Response, NextFunction } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { SERVER_ERROR } from '../lib/serviceResult';
import { decideName, proposalsForStaff } from '../services/isletNames';

// The admin panel's Islet Names tab (AdminIsletNames.tsx): the names players
// have put to the Harbor Council, to choose or turn down (services/isletNames.ts).
// Admin-only.

const router = Router();

async function adminOnly(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const player = await db('players').where({ id: req.player!.playerId }).first('is_admin');
        if (!player?.is_admin) { res.status(403).json({ error: 'Admins only.' }); return; }
        next();
    } catch (err) {
        logger.error(`admin islet names gate: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
}

router.use(requireAuth, adminOnly);

router.get('/', async (_req: AuthRequest, res: Response) => {
    try {
        res.json(await proposalsForStaff());
    } catch (err) {
        logger.error(`admin islet names: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

router.post('/:id/decide', async (req: AuthRequest, res: Response) => {
    const r = await decideName(req.player!.playerId, Number(req.params.id), req.body?.approve === true, req.body?.reason);
    if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
    res.json(r);
});

export default router;
