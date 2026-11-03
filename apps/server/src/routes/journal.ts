import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { failureStatus } from '../lib/serviceResult';
import { logger } from '../lib/logger';
import { listNotes, createNote, updateNote, deleteNote } from '../services/journal';

// The Journal (services/journal.ts): a player's own notes.
const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json(await listNotes(req.player!.playerId));
    } catch (err) {
        logger.error(`journal list: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const r = await createNote(req.player!.playerId, req.body);
    if (!r.ok) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json({ note: r.note });
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const r = await updateNote(req.player!.playerId, req.params.id, req.body);
    if (!r.ok) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json({ note: r.note });
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const r = await deleteNote(req.player!.playerId, req.params.id);
    if (!r.ok) { res.status(failureStatus(r.error)).json({ error: r.error }); return; }
    res.json({ success: true });
});

export default router;
