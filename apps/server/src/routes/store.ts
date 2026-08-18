import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireTrusted } from '../lib/trust';
import { logger } from '../lib/logger';
import { STORE_ITEMS, getUnlocks, purchaseItem, effectivePrice } from '../services/store';
import { getTalerBalance } from '../services/talers';

const router = Router();

// Catalog + this player's ownership + balance, one call for the picker UI
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const [unlocks, balance] = await Promise.all([getUnlocks(playerId), getTalerBalance(playerId)]);
        res.json({
            balance,
            unlocks,
            items: STORE_ITEMS.map(i => ({
                key: i.key,
                name: i.name,
                description: i.description,
                price: i.price,
                effectivePrice: effectivePrice(i, unlocks),
                grants: i.grants,
                available: i.available,
                owned: i.grants.every(g => unlocks.includes(g)),
            })),
        });
    } catch (err) {
        logger.error(`Store list error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/purchase', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { key } = req.body as { key: string };
    try {
        if (typeof key !== 'string') {
            res.status(400).json({ error: 'Missing item key.' });
            return;
        }
        const result = await purchaseItem(playerId, key);
        if (!result.ok) {
            res.status(400).json({ error: result.error, balance: result.balance });
            return;
        }
        res.json({ success: true, balance: result.balance, granted: result.granted });
    } catch (err) {
        logger.error(`Store purchase error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
