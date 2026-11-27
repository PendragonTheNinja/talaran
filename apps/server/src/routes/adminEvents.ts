import { Router, Response } from 'express';
import db from '../db';
import { logger } from '../lib/logger';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { failureStatus } from '../lib/serviceResult';
import {
    eventsAdminOverview, updateLiveEvent, endLiveEvent, startEventNow,
    updateEventType, createEventType, updateEventSettings,
    summonMerchantNow, updateMerchantSettings, saveMerchantExtra, removeMerchantExtra,
} from '../services/worldEventsAdmin';
import { hasPermission } from '../lib/staffPermissions';
import { INVASION_KIND, closeTear, realmsForStaff, sendTear, tearStandings } from '../services/invasions';

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

/**
 * Tears (docs/invasions-spec.md §3) are the one part of this tab a moderator
 * may run: admins, and anyone whose mod_permissions ticks can_run_events.
 */
function eventStaff(handler: Handler) {
    return async (req: AuthRequest, res: Response) => {
        const staffId = req.player!.playerId;
        if (!await hasPermission(staffId, 'can_run_events')) {
            res.status(403).json({ error: 'You may not run events.' });
            return;
        }
        const result = await handler(staffId, req);
        if ('error' in result) res.status(failureStatus(result.error)).json(result);
        else res.json(result);
    };
}

/** The Send a tear card: the realms and their creatures, and every tear sent or open, with its standings. */
async function tearsOverview(): Promise<{ ok: true; realms: any[]; tears: any[] }> {
    const rows = await db('world_events as e').leftJoin('locations as l', 'l.id', 'e.location_id')
        .where('e.kind', INVASION_KIND)
        .where((q) => q.whereNull('e.ended_at').orWhere('e.ended_at', '>', db.raw("now() - interval '1 day'")))
        .orderBy('e.starts_at', 'desc')
        .select('e.id', 'e.name', 'e.pool_total', 'e.pool_left', 'e.xp_multiplier', 'e.min_kills', 'e.per_player_cap',
            'e.starts_at', 'e.ends_at', 'e.warn_at', 'e.warned_at', 'e.opened_at', 'e.ended_at', 'e.end_reason',
            'l.name as location', 'l.region as island');
    const tears = [];
    for (const r of rows) {
        const rewards = await db('invasion_rewards as w').join('players as p', 'p.id', 'w.player_id')
            .where('w.event_id', r.id).orderBy('w.place').select('w.place', 'p.username as name', 'w.kills', 'w.gold');
        tears.push({ ...r, standings: await tearStandings(r.id), rewards });
    }
    return { ok: true, realms: await realmsForStaff(), tears };
}

async function endTear(staffId: number, eventId: number): Promise<{ ok: true } | { error: string }> {
    const tear = await db('world_events').where({ id: eventId, kind: INVASION_KIND }).first('id');
    if (!tear) return { error: 'No such tear.' };
    if (!(await closeTear(eventId, 'admin'))) return { error: 'That tear has already closed.' };
    logger.info(`[invasions] staff ${staffId} closed tear ${eventId}`);
    return { ok: true };
}

router.get('/tears', requireAuth, eventStaff(() => tearsOverview()));
router.post('/tears/send', requireAuth, eventStaff((staffId, req) => sendTear(staffId, req.body ?? {})));
router.post('/tears/:id/end', requireAuth, eventStaff((staffId, req) => endTear(staffId, id(req))));

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
