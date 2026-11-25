import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { getStorage, getCarried, depositItem, withdrawItem } from '../services/property';
import { failureStatus } from '../lib/serviceResult';
import { requireTrusted } from '../lib/trust';
import { shareState, namePartner, endPartnership, sharedStorage, sharedMove } from '../services/propertyPartners';

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
    if (!r.success) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json(r);
});

router.post('/storage/withdraw', requireAuth, async (req: AuthRequest, res: Response) => {
    const { itemId, quantity } = req.body;
    const r = await withdrawItem(req.player!.playerId, itemId, quantity);
    if (!r.success) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json(r);
});

// ── Shared houses (services/propertyPartners.ts) ──────────────────────────

type Shared = { ok: boolean; status?: number; error?: string };
function sendShared(res: Response, r: Shared) {
    if (!r.ok) { res.status(r.status ?? 400).json({ error: r.error }); return; }
    res.json(r);
}

router.get('/share', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await shareState(req.player!.playerId));
    } catch (err) {
        logger.error(`Share state error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/share/name', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    sendShared(res, await namePartner(req.player!.playerId, req.body?.name));
});

router.post('/share/end', requireAuth, async (req: AuthRequest, res: Response) => {
    sendShared(res, await endPartnership(req.player!.playerId, req.body?.propertyId));
});

router.get('/shared/storage', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const playerId = req.player!.playerId;
        const [storage, carried] = await Promise.all([sharedStorage(playerId, req.query.propertyId), getCarried(playerId)]);
        res.json({ ...storage, carried });
    } catch (err) {
        if ((err as Error)?.message === 'That is not a homestead.') { res.status(400).json({ error: 'That is not a homestead.' }); return; }
        logger.error(`Shared storage error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/shared/deposit', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const { propertyId, itemId, quantity } = req.body ?? {};
    sendShared(res, await sharedMove(req.player!.playerId, propertyId, itemId, quantity, 'in'));
});

router.post('/shared/withdraw', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const { propertyId, itemId, quantity } = req.body ?? {};
    sendShared(res, await sharedMove(req.player!.playerId, propertyId, itemId, quantity, 'out'));
});

export default router;
