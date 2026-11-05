import { Router, Response, NextFunction } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { failureStatus } from '../lib/serviceResult';
import { logger } from '../lib/logger';
import {
    listPolls, adminPoll, createPoll, updatePoll, setClosingTime, openPollNow, closePollNow, deletePoll,
    pollResults, adminResponses, responsesCsv,
} from '../services/crierPolls';

// The admin panel's Polls tab (services/crierPolls.ts): write, schedule, open
// and close the Town Crier's polls, and read who said what. Admin-only.
const router = Router();

async function adminOnly(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const player = await db('players').where({ id: req.player!.playerId }).first('is_admin');
        if (!player?.is_admin) { res.status(403).json({ error: 'Admins only.' }); return; }
        next();
    } catch (err) {
        logger.error(`admin crier gate: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
}

router.use(requireAuth, adminOnly);

type Out = { ok: true } | { ok: false; error: string };
function send(res: Response, r: Out & Record<string, unknown>, body?: (r: any) => unknown): void {
    if (!r.ok) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json(body ? body(r) : { success: true });
}

router.get('/polls', async (_req: AuthRequest, res: Response) => {
    try {
        res.json({ polls: await listPolls() });
    } catch (err) {
        logger.error(`admin crier list: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/polls', async (req: AuthRequest, res: Response) => {
    send(res, await createPoll(req.player!.playerId, req.body), r => ({ id: r.id }));
});

router.get('/polls/:id', async (req: AuthRequest, res: Response) => {
    send(res, await adminPoll(req.params.id), r => ({ poll: r.poll }));
});

router.put('/polls/:id', async (req: AuthRequest, res: Response) => {
    send(res, await updatePoll(req.params.id, req.body), r => ({ id: r.id }));
});

router.post('/polls/:id/open', async (req: AuthRequest, res: Response) => {
    send(res, await openPollNow(req.params.id, req.body?.closesAt));
});

router.post('/polls/:id/close', async (req: AuthRequest, res: Response) => {
    send(res, await closePollNow(req.params.id));
});

router.post('/polls/:id/closing-time', async (req: AuthRequest, res: Response) => {
    send(res, await setClosingTime(req.params.id, req.body?.closesAt));
});

router.delete('/polls/:id', async (req: AuthRequest, res: Response) => {
    send(res, await deletePoll(req.params.id));
});

router.get('/polls/:id/results', async (req: AuthRequest, res: Response) => {
    try {
        const id = Math.floor(Number(req.params.id));
        const results = Number.isFinite(id) && id > 0 ? await pollResults(id, true) : null;
        if (!results) { res.status(404).json({ error: 'There is no such poll.' }); return; }
        const who = await adminResponses(id);
        if (!who.ok) { res.status(failureStatus(who.error)).json({ error: who.error }); return; }
        res.json({ results, responses: who.responses });
    } catch (err) {
        logger.error(`admin crier results: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/polls/:id/export', async (req: AuthRequest, res: Response) => {
    const r = await responsesCsv(req.params.id);
    if (!r.ok) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'poll';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="poll-${slug}.csv"`);
    res.send(r.csv);
});

export default router;
