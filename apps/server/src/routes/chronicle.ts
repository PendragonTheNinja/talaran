import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { requireTrusted } from '../lib/trust';
import { failureStatus } from '../lib/serviceResult';
import { balladsFor, commissionBallad } from '../services/chronicleBallads';
import { tavernFront, bookDays, bookPage, namedDays, chronicleNotice, seeChronicleNotice } from '../services/chronicleBook';

// The Salty Sloth (docs/chronicle-spec.md §2, step 3): the Wenna tab and the
// book. The tavern front is for whoever stands in the tavern's town; the book
// reads the same anywhere (step 4 opens it to the public site too).
const router = Router();

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/chronicle/tavern: Wenna's greeting, today so far (no names), the last page's headline. */
router.get('/tavern', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const player = await db('players').where({ id: req.player!.playerId }).first('current_location_id');
        const front = player ? await tavernFront(player.current_location_id) : null;
        if (!front) { res.status(400).json({ error: 'There is no tavern here.' }); return; }
        res.json(front);
    } catch (err) {
        logger.error(`chronicle tavern: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** GET /api/chronicle/days: every written day, newest first. */
router.get('/days', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
        res.json({ days: await bookDays() });
    } catch (err) {
        logger.error(`chronicle days: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** GET /api/chronicle/page?day=YYYY-MM-DD: one page (the newest when no day is given). */
router.get('/page', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const day = typeof req.query.day === 'string' && DAY.test(req.query.day) ? req.query.day : null;
        res.json({ page: await bookPage(day) });
    } catch (err) {
        logger.error(`chronicle page: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** GET /api/chronicle/named?player=Name or ?guild=Name: the days they were named. */
router.get('/named', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const player = typeof req.query.player === 'string' ? req.query.player.slice(0, 40).trim() : '';
        const guild = typeof req.query.guild === 'string' ? req.query.guild.slice(0, 60).trim() : '';
        const found = await namedDays(player ? { player } : guild ? { guild } : {});
        if (!found) { res.status(404).json({ error: player || guild ? `Wenna has never heard of ${player || guild}.` : 'Who?' }); return; }
        res.json(found);
    } catch (err) {
        logger.error(`chronicle named: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** GET /api/chronicle/notice: the newest page that named you and you have not put away. */
router.get('/notice', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ notice: await chronicleNotice(req.player!.playerId) });
    } catch (err) {
        logger.error(`chronicle notice: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** POST /api/chronicle/notice/seen { day }: put it away, on every device. */
router.post('/notice/seen', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const day = typeof req.body?.day === 'string' && DAY.test(req.body.day) ? req.body.day : null;
        if (!day) { res.status(400).json({ error: 'Which day?' }); return; }
        await seeChronicleNotice(req.player!.playerId, day);
        res.json({ ok: true });
    } catch (err) {
        logger.error(`chronicle notice seen: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** GET /api/chronicle/ballads: the price, whether you may commission one, and your guild's ballads. */
router.get('/ballads', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await balladsFor(req.player!.playerId));
    } catch (err) {
        logger.error(`chronicle ballads: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** POST /api/chronicle/ballads: commission one (moves gold; race:check 'ballad'). */
router.post('/ballads', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const result = await commissionBallad(req.player!.playerId);
    if ('error' in result) res.status(failureStatus(result.error)).json(result);
    else res.json(result);
});

// ── The public book (talaran.net/chronicle), no account needed ──────────────
// Read with plain fetch on the public page, never apiFetch (CLAUDE.md §7).

/** GET /api/chronicle/public/days */
router.get('/public/days', async (_req, res: Response) => {
    try {
        res.json({ days: await bookDays() });
    } catch (err) {
        logger.error(`chronicle public days: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** GET /api/chronicle/public/page?day=YYYY-MM-DD: names are plain text here, no ids. */
router.get('/public/page', async (req, res: Response) => {
    try {
        const day = typeof req.query.day === 'string' && DAY.test(req.query.day) ? req.query.day : null;
        const page = await bookPage(day);
        res.json({ page: page ? { ...page, lines: page.lines.map(l => ({ section: l.section, text: l.text, struck: l.struck, ballad: l.ballad })) } : null });
    } catch (err) {
        logger.error(`chronicle public page: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
