import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { requireTrusted } from '../lib/trust';
import { failureStatus } from '../lib/serviceResult';
import { listEvents } from '../services/worldEvents';
import { merchantHere, buyFromMerchant } from '../services/travellingMerchant';

// The Events panel: what is on now, and what ended in the last day.
const router = Router();

router.get('/', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
        res.json(await listEvents());
    } catch (err) {
        logger.error(`Events list error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// The travelling merchant's cart, when he is where the player stands.
router.get('/merchant', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ visit: await merchantHere(req.player!.playerId) });
    } catch (err) {
        logger.error(`Merchant cart error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Buying from him. Trusted accounts only, like the marketplace's buy.
router.post('/merchant/buy', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const result = await buyFromMerchant(req.player!.playerId, req.body ?? {});
    if ('error' in result) res.status(failureStatus(result.error)).json(result);
    else res.json(result);
});

export default router;
