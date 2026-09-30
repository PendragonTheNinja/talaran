import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { failureStatus } from '../lib/serviceResult';
import {
    eventsAdminOverview, updateLiveEvent, endLiveEvent, startEventNow,
    updateEventType, createEventType, updateEventSettings,
    summonMerchantNow, updateMerchantSettings, saveMerchantExtra, removeMerchantExtra,
} from '../services/worldEventsAdmin';

// The admin panel's Events tab. Admin-only, like the content tools: it is the
// game owner's surface, not part of mod_permissions. The work is in
// services/worldEventsAdmin.ts; this only checks who is asking.
const router = Router();

async function isAdmin(playerId: number): Promise<boolean> {
    const player = await db('players').where({ id: playerId }).first();
    return !!player?.is_admin;
}

type Handler = (adminId: number, req: AuthRequest) => Promise<{ ok: true } | { error: string }>;

/** Admin gate, then the service's answer with the right status. */
function admin(handler: Handler) {
    return async (req: AuthRequest, res: Response) => {
        const adminId = req.player!.playerId;
        if (!await isAdmin(adminId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }
        const result = await handler(adminId, req);
        if ('error' in result) res.status(failureStatus(result.error)).json(result);
        else res.json(result);
    };
}

const id = (req: AuthRequest) => Math.floor(Number(req.params.id));

router.get('/', requireAuth, admin(() => eventsAdminOverview()));
router.post('/start', requireAuth, admin((adminId, req) => startEventNow(adminId, req.body ?? {})));
router.post('/settings', requireAuth, admin((adminId, req) => updateEventSettings(adminId, req.body ?? {})));
router.post('/types', requireAuth, admin((adminId, req) => createEventType(adminId, req.body ?? {})));
router.post('/types/:id', requireAuth, admin((adminId, req) => updateEventType(adminId, id(req), req.body ?? {})));
router.post('/live/:id/end', requireAuth, admin((adminId, req) => endLiveEvent(adminId, id(req))));
router.post('/merchant/summon', requireAuth, admin((adminId, req) => summonMerchantNow(adminId, req.body ?? {})));
router.post('/merchant/settings', requireAuth, admin((adminId, req) => updateMerchantSettings(adminId, req.body ?? {})));
router.post('/merchant/extras', requireAuth, admin((adminId, req) => saveMerchantExtra(adminId, req.body ?? {})));
router.post('/merchant/extras/:id/delete', requireAuth, admin((adminId, req) => removeMerchantExtra(adminId, id(req))));
router.post('/live/:id', requireAuth, admin((adminId, req) => updateLiveEvent(adminId, id(req), req.body ?? {})));

export default router;
