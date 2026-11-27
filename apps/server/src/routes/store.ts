import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireTrusted } from '../lib/trust';
import { logger } from '../lib/logger';
import { STORE_ITEMS, getUnlocks, purchaseItem, effectivePrice, onSaleNow, saleEndsAt, giftItem, setNameColor, NAME_COLORS } from '../services/store';
import db from '../db';
import { getTalerBalance } from '../services/talers';
import { failureStatus } from '../lib/serviceResult';

const router = Router();

// Catalog + this player's ownership + balance, one call for the picker UI
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const [unlocks, balance] = await Promise.all([getUnlocks(playerId), getTalerBalance(playerId)]);
        const me = await db('players').where({ id: playerId }).first('name_color', 'name_change_tokens');
        const now = new Date();
        res.json({
            balance,
            unlocks,
            // The name color perk's choices and the one worn (services/store.ts NAME_COLORS).
            nameColors: NAME_COLORS,
            nameColor: me?.name_color ?? null,
            nameChangeTokens: Number(me?.name_change_tokens ?? 0),
            items: STORE_ITEMS.map(i => ({
                key: i.key,
                name: i.name,
                description: i.description,
                price: i.price,
                effectivePrice: effectivePrice(i, unlocks),
                grants: i.grants,
                available: onSaleNow(i, now),
                // Seasonal items: when this year's sale closes (null outside it).
                seasonal: !!i.onSale,
                saleEndsAt: i.onSale ? saleEndsAt(i.onSale, now)?.toISOString() ?? null : null,
                owned: !i.consumable && i.grants.every(g => unlocks.includes(g)),
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
            res.status(failureStatus(result.error)).json({ error: result.error, balance: result.balance });
            return;
        }
        res.json({ success: true, balance: result.balance, granted: result.granted });
    } catch (err) {
        logger.error(`Store purchase error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Buy a store item for someone else (services/store.ts giftItem).
router.post('/gift', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { key, to } = req.body as { key: unknown; to: unknown };
    try {
        if (typeof key !== 'string') {
            res.status(400).json({ error: 'Missing item key.' });
            return;
        }
        const result = await giftItem(playerId, to, key);
        if (!result.ok) {
            res.status(failureStatus(result.error)).json({ error: result.error, balance: result.balance });
            return;
        }
        res.json({ success: true, balance: result.balance, to: result.to });
    } catch (err) {
        logger.error(`Store gift error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Wear a name color, or none (perk:name_color).
router.post('/name-color', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await setNameColor(req.player!.playerId, req.body?.color ?? null);
        if (!result.ok) {
            res.status(failureStatus(result.error)).json({ error: result.error });
            return;
        }
        res.json({ success: true });
    } catch (err) {
        logger.error(`Name color error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
