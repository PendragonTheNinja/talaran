import { Router, Response } from 'express';
import db from '../db';
import { logger } from '../lib/logger';
import { requireAuth, AuthRequest } from '../middleware/auth';

// Admin editing for the manual (docs/manual-spec.md §2).
//
// Rows in manual_pages OVERRIDE the markdown shipped in
// apps/client/public/manual/. Saving creates or updates an override; deleting
// removes it and the committed file takes over again. A section+slug matching no
// file is simply a new page that lives only here.
//
// Admin-only, matching routes/adminContent.ts: content tooling is the game
// owner's surface and deliberately outside the mod_permissions system.

const router = Router();

async function requireAdmin(playerId: number): Promise<boolean> {
    const player = await db('players').where({ id: playerId }).first();
    return !!player?.is_admin;
}

const SLUG_RE = /^[a-z0-9-]+$/;

/** Every override, published or not, newest edit first. */
router.get('/pages', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;

    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const pages = await db('manual_pages')
            .leftJoin('players', 'manual_pages.updated_by', 'players.id')
            .select(
                'manual_pages.id',
                'manual_pages.section',
                'manual_pages.slug',
                'manual_pages.title',
                'manual_pages.blurb',
                'manual_pages.sort_order',
                'manual_pages.is_published',
                'manual_pages.updated_at',
                'players.username as updated_by_name',
            )
            .orderBy('manual_pages.updated_at', 'desc');

        res.json({ pages });
    } catch (err) {
        logger.error(`Admin manual list error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** One override's full content, for loading into the editor. */
router.get('/page/:section/:slug', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { section, slug } = req.params as { section: string; slug: string };

    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const page = await db('manual_pages').where({ section, slug }).first();
        if (!page) {
            res.status(404).json({ error: 'No override for that page.' });
            return;
        }

        res.json({ page });
    } catch (err) {
        logger.error(`Admin manual read error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Create or update an override. */
router.put('/page', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { section, slug, title, blurb, content, sortOrder, isPublished } = req.body || {};

    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        if (!section || !slug || !SLUG_RE.test(section) || !SLUG_RE.test(slug)) {
            res.status(400).json({
                error: 'Section and slug are required, lowercase letters, numbers and hyphens only.',
            });
            return;
        }

        if (typeof content !== 'string') {
            res.status(400).json({ error: 'Content is required.' });
            return;
        }

        const patch = {
            title: title || null,
            blurb: blurb || null,
            content,
            sort_order: Number.isFinite(sortOrder) ? sortOrder : null,
            is_published: isPublished !== false,
            updated_by: playerId,
            updated_at: db.fn.now(),
        };

        const existing = await db('manual_pages').where({ section, slug }).first();

        if (existing) {
            await db('manual_pages').where({ id: existing.id }).update(patch);
        } else {
            await db('manual_pages').insert({ section, slug, ...patch });
        }

        logger.info(`Admin ${playerId} saved manual page ${section}/${slug}`);
        res.json({ success: true, created: !existing });
    } catch (err) {
        logger.error(`Admin manual save error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Drop an override. If a markdown file exists for this section+slug the page
 * reverts to it; if not, the page disappears. The editor warns which.
 */
router.delete('/page/:section/:slug', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { section, slug } = req.params as { section: string; slug: string };

    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const deleted = await db('manual_pages').where({ section, slug }).delete();
        if (!deleted) {
            res.status(404).json({ error: 'No override for that page.' });
            return;
        }

        logger.info(`Admin ${playerId} reverted manual page ${section}/${slug}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Admin manual delete error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Every override as markdown, ready to be committed back into
 * apps/client/public/manual/.
 *
 * This closes the drift: once a page is edited in game the file in git no longer
 * matches what players see, and a later edit to that file would be silently
 * invisible. Exporting turns that trap into a workflow.
 */
router.get('/export', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;

    try {
        if (!await requireAdmin(playerId)) {
            res.status(403).json({ error: 'Admins only.' });
            return;
        }

        const pages = await db('manual_pages')
            .select('section', 'slug', 'title', 'blurb', 'content', 'sort_order', 'is_published')
            .orderBy(['section', 'slug']);

        res.json({
            files: pages.map((p) => ({
                path: `apps/client/public/manual/${p.section}/${p.slug}.md`,
                content: p.content,
                // The manifest is hand-maintained, so hand back what it needs
                // rather than trying to rewrite it from here.
                manifest: {
                    section: p.section,
                    slug: p.slug,
                    title: p.title,
                    blurb: p.blurb,
                    sortOrder: p.sort_order,
                    published: p.is_published,
                },
            })),
        });
    } catch (err) {
        logger.error(`Admin manual export error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
