import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../index';

const router = Router();

/**
 * GET /api/items/tooltips - what a hover says about an item, for every item.
 *
 * The inventory's tooltip was the only real one in the game because the
 * inventory's payload was the only one carrying an item's description. Every
 * other surface that shows an item image (ground items, building storage, shop
 * listings, merchant shelves, the trade window) knows a name and a quantity and
 * nothing else, so each fell back to the browser's `title` attribute: a bare
 * name, in the OS font, after a delay nobody can control.
 *
 * Rather than widen five payloads and keep them in step forever, the tooltip
 * fields are served once, for every item, and held by the client for the
 * session. Items are static content: they change when a migration ships, not
 * while someone is playing. A few hundred rows is a single small request, and
 * every surface gets the same tooltip without knowing anything about items.
 */
let cache: { rows: any[]; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

router.get('/tooltips', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
        if (!cache || Date.now() - cache.at > TTL_MS) {
            const rows = await db('items')
                .where({ is_active: true })
                .select(
                    'name',
                    'type',
                    'subtype',
                    'quality',
                    'tier',
                    'slot',
                    'level_required',
                    'description',
                    // Live, not baked into the description, so a magnitude
                    // tuned in the admin panel is reflected at once.
                    'buff_effect',
                    'buff_skill',
                    'buff_magnitude',
                    'buff_seconds',
                );
            cache = { rows, at: Date.now() };
        }
        res.json({ items: cache.rows });
    } catch (err) {
        logger.error(`Item tooltips error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
