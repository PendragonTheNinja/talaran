import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { getTalerBalance } from '../services/talers';
import { TALER_TIERS } from '../config/talerTiers';

const router = Router();

// Balance + recent history for the Support page
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const balance = await getTalerBalance(playerId);
        const history = await db('taler_ledger')
            .where({ player_id: playerId })
            .orderBy('id', 'desc')
            .limit(50)
            .select('delta', 'reason', 'created_at');
        res.json({ balance, history });
    } catch (err) {
        logger.error(`Talers balance error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Purchase tiers for the Support page. Only tiers with a configured Paddle
// price are purchasable; the rest render as coming-soon.
router.get('/tiers', requireAuth, async (_req: AuthRequest, res: Response) => {
    res.json({
        tiers: TALER_TIERS.map(t => ({
            usdCents: t.usdCents,
            talers: t.talers,
            bonusLabel: t.bonusLabel,
            paddlePriceId: t.paddlePriceId ?? null,
            available: !!t.paddlePriceId,
        })),
    });
});

export default router;
