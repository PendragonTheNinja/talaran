import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { getTalerBalance } from '../services/talers';
import { TALER_TIERS } from '../config/talerTiers';
import { STORE_ITEMS } from '../services/store';

/**
 * What an unlock was, in words: "Forgeheart theme", "Custom Palettes, Moonveil
 * theme". The ledger row records only the price; the unlocks it paid for were
 * written in the same transaction, so they share its timestamp exactly
 * (services/store.ts purchaseItem), which is how each row finds its own.
 */
function describeUnlocks(keys: string[]): string | null {
    if (!keys.length) return null;
    const nameOf = (key: string) => STORE_ITEMS.find(i => i.key === key)?.name ?? key;
    const perks = keys.filter(k => !k.startsWith('theme:')).map(nameOf);
    const themes = keys.filter(k => k.startsWith('theme:')).map(nameOf);
    const parts = [...perks];
    if (themes.length === 1) parts.push(`${themes[0]} theme`);
    else if (themes.length > 1) parts.push(`${themes.slice(0, -1).join(', ')} and ${themes[themes.length - 1]} themes`);
    return parts.join(', ');
}

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
        const unlocks = await db('player_unlocks').where({ player_id: playerId }).select('unlock_key', 'created_at');
        const byMoment = new Map<number, string[]>();
        for (const u of unlocks) {
            const t = new Date(u.created_at).getTime();
            if (!byMoment.has(t)) byMoment.set(t, []);
            byMoment.get(t)!.push(String(u.unlock_key));
        }
        const withDetail = history.map((h: any) => ({
            ...h,
            detail: h.reason === 'unlock' ? describeUnlocks(byMoment.get(new Date(h.created_at).getTime()) ?? []) : null,
        }));
        res.json({ balance, history: withDetail });
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
