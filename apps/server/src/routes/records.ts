import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { listRecords } from '../services/records';

const router = Router();

/**
 * GET /api/records - the hall of records.
 *
 * Server-wide and identical for everyone, so it takes no player argument. Who
 * got somewhere first is not a private fact.
 */
router.get('/', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
        res.json(await listRecords());
    } catch (err) {
        logger.error(`List records error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
