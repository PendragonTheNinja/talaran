import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { tavernFront, bookDays, bookPage, namedDays } from '../services/chronicleBook';

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

export default router;
