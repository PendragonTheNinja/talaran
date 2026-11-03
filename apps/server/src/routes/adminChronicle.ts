import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { gameDayKey } from '../lib/gameTime';
import { deedsForDay, deedsCsv } from '../services/chronicle';

// The admin panel's Chronicle tab (docs/chronicle-spec.md §14, step 1): the
// raw deed journal by game day, and an export for tuning. Admin-only, like the
// content tools.
const router = Router();

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function isAdmin(playerId: number): Promise<boolean> {
    const player = await db('players').where({ id: playerId }).first('is_admin');
    return !!player?.is_admin;
}

/** GET /api/admin/chronicle/deeds?day=YYYY-MM-DD (default: today, game time). */
router.get('/deeds', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!await isAdmin(req.player!.playerId)) { res.status(403).json({ error: 'Admins only.' }); return; }
        const day = typeof req.query.day === 'string' && DAY.test(req.query.day) ? req.query.day : gameDayKey();
        res.json(await deedsForDay(day));
    } catch (err) {
        logger.error(`admin chronicle deeds: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** GET /api/admin/chronicle/export?from=YYYY-MM-DD&to=YYYY-MM-DD: the journal as CSV. */
router.get('/export', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!await isAdmin(req.player!.playerId)) { res.status(403).json({ error: 'Admins only.' }); return; }
        const to = typeof req.query.to === 'string' && DAY.test(req.query.to) ? req.query.to : gameDayKey();
        const from = typeof req.query.from === 'string' && DAY.test(req.query.from) ? req.query.from : to;
        if (from > to) { res.status(400).json({ error: 'The first day comes after the last.' }); return; }
        const csv = await deedsCsv(from, to);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="chronicle-deeds-${from}-to-${to}.csv"`);
        res.send(csv);
    } catch (err) {
        logger.error(`admin chronicle export: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
