import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { gameDayKey } from '../lib/gameTime';
import { deedsForDay, deedsCsv } from '../services/chronicle';
import { composePage, writePage, unwritePage, readPage, chronicleSettings, setComposerEnabled, verseCounts, todaySoFar } from '../services/chronicleComposer';
import { addDays } from '../lib/chronicleVerse';

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

// ── Pages (step 2) ───────────────────────────────────────────────────────────

function dayOf(v: unknown): string | null {
    return typeof v === 'string' && DAY.test(v) ? v : null;
}

/**
 * GET /api/admin/chronicle/page?day=: the day's page as written, the dry run
 * of it (what Wenna would write from its deeds now, saved nowhere), the
 * deeds as scored, and whether writing is on.
 */
router.get('/page', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!await isAdmin(req.player!.playerId)) { res.status(403).json({ error: 'Admins only.' }); return; }
        const day = dayOf(req.query.day) ?? gameDayKey();
        const [written, preview, settings, verses, today] = await Promise.all([
            readPage(day), composePage(day), chronicleSettings(), verseCounts(), todaySoFar(),
        ]);
        res.json({ day, today: gameDayKey(), yesterday: addDays(gameDayKey(), -1), written, preview, enabled: settings.composer_enabled, verses, todaySoFar: today });
    } catch (err) {
        logger.error(`admin chronicle page: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** POST /api/admin/chronicle/write { day, again? }: write a finished day's page now; again first takes the old one out. */
router.post('/write', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!await isAdmin(req.player!.playerId)) { res.status(403).json({ error: 'Admins only.' }); return; }
        const day = dayOf(req.body?.day);
        if (!day) { res.status(400).json({ error: 'Which day?' }); return; }
        if (day >= gameDayKey()) { res.status(400).json({ error: 'A page is written once its day is over.' }); return; }
        if (req.body?.again) await unwritePage(day);
        const wrote = await writePage(day);
        if (!wrote) { res.status(409).json({ error: 'That page is already written.' }); return; }
        logger.info(`[chronicle] player ${req.player!.playerId} ${req.body?.again ? 'rewrote' : 'wrote'} the page for ${day}`);
        res.json({ ok: true, page: await readPage(day) });
    } catch (err) {
        logger.error(`admin chronicle write: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** POST /api/admin/chronicle/settings { enabled }: whether Wenna writes a page each midnight. */
router.post('/settings', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        if (!await isAdmin(req.player!.playerId)) { res.status(403).json({ error: 'Admins only.' }); return; }
        await setComposerEnabled(!!req.body?.enabled);
        logger.info(`[chronicle] player ${req.player!.playerId} turned page writing ${req.body?.enabled ? 'on' : 'off'}`);
        res.json({ ok: true });
    } catch (err) {
        logger.error(`admin chronicle settings: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
