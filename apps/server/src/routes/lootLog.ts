import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';
import { getLootLog, clearLootLog } from '../services/lootLog';

const router = Router();

// Everything the loot panel needs in one call: sources newest-first, their
// items and XP, and the moment the log was last cleared.
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await getLootLog(req.player!.playerId));
    } catch (err) {
        logger.error(`Get loot log error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Clear everything, or a single source. Clearing one source deliberately does
// NOT move loot_reset_at: the header still reports when the whole log started,
// which would otherwise jump forward every time a player tidied one row.
router.post('/clear', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { source } = req.body;
    try {
        if (source !== undefined && typeof source !== 'string') {
            res.status(400).json({ error: 'Bad source.' });
            return;
        }
        await clearLootLog(playerId, source);
        res.json(await getLootLog(playerId));
    } catch (err) {
        logger.error(`Clear loot log error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
