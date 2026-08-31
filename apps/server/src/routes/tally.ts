import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { tallyReport, buildTallyBoard, shouldShowLocationLink , buyLicence } from '../services/tally';
import { logger } from '../lib/logger';

// Tally board (see services/tally.ts). Full path is routes/tally.ts; the service
// of the same name is services/tally.ts.

const router = Router();

/**
 * Board status, and the report itself when the player is standing at it.
 * The service withholds entries when they are elsewhere, so this endpoint cannot
 * be used to read the board remotely.
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await tallyReport(req.player!.playerId));
    } catch (err) {
        logger.error(`Tally report error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Whether the location menu should render the Tally Board link here. Deliberately
 * slim: LocationPanel calls this on every location change, so it must stay cheap.
 */
router.get('/link', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ show: await shouldShowLocationLink(req.player!.playerId) });
    } catch (err) {
        logger.error(`Tally link check error: ${err}`);
        // Fail open: a broken check should not remove a working button.
        res.json({ show: true });
    }
});

/**
 * Buy the right to keep one more tally board. Permanent, and separate from
 * building: the licence says how many you MAY have, the materials build one.
 */
router.post('/licence', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await buyLicence(req.player!.playerId);
        if (!result.success) {
            res.status(400).json({ error: result.error });
            return;
        }
        res.json(result);
    } catch (err) {
        logger.error(`Tally licence error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/build', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await buildTallyBoard(req.player!.playerId);
        if (!result.success) {
            res.status(400).json({ error: result.error });
            return;
        }
        res.json(result);
    } catch (err) {
        logger.error(`Tally build error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
