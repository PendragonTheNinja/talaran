import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { listEvents } from '../services/worldEvents';

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

export default router;
