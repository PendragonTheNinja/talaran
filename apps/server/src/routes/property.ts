import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';
import { getStorage, getCarried, depositItem, withdrawItem } from '../services/property';

const router = Router();

// Storage at whatever property the player is standing in, plus what they carry.
router.get('/storage', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const playerId = req.player!.playerId;
        const [storage, carried] = await Promise.all([getStorage(playerId), getCarried(playerId)]);
        res.json({ ...storage, carried });
    } catch (err) {
        logger.error(`Storage error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/storage/deposit', requireAuth, async (req: AuthRequest, res: Response) => {
    const { itemId, quantity } = req.body;
    const r = await depositItem(req.player!.playerId, itemId, quantity);
    if (!r.success) { res.status(400).json({ error: r.error }); return; }
    res.json(r);
});

router.post('/storage/withdraw', requireAuth, async (req: AuthRequest, res: Response) => {
    const { itemId, quantity } = req.body;
    const r = await withdrawItem(req.player!.playerId, itemId, quantity);
    if (!r.success) { res.status(400).json({ error: r.error }); return; }
    res.json(r);
});

export default router;
