import { Router, Response, NextFunction } from 'express';
import db from '../db';
import { logger } from '../lib/logger';
import { requireAuth, AuthRequest } from '../middleware/auth';

// Each guild's own forum, inside its own page.
//
// SECURITY MODEL: every route in this file sits behind requireGuildMember, which
// resolves the caller's guild and role rank once and attaches them to the
// request. Nothing here ever reads a guild id from the client. Every query is
// scoped by req.guild.id, so a member of one guild cannot address another
// guild's forum even by guessing ids.
//
// That is the whole reason these are separate tables from the public forum: one
// boundary in one place, rather than a visibility check repeated in every handler
// where forgetting one would leak private threads.

const router = Router();

// guild_members.role → rank. Higher outranks lower.
const RANKS: Record<string, number> = { member: 1, leader: 2, founder: 3 };

interface GuildContext {
    id: number;
    name: string;
    role: string;
    rank: number;
}

interface GuildRequest extends AuthRequest {
    guild?: GuildContext;
}

/** Resolves the caller's guild and rank, or refuses. The only gate in this file. */
async function requireGuildMember(req: GuildRequest, res: Response, next: NextFunction) {
    try {
        const playerId = req.player!.playerId;

        const player = await db('players').where({ id: playerId }).first();
        if (!player?.guild_id) {
            res.status(403).json({ error: 'You are not in a guild.' });
            return;
        }

        // Read the role from guild_members rather than players.guild_role, since
        // membership is the authoritative record.
        const membership = await db('guild_members')
            .where({ guild_id: player.guild_id, player_id: playerId })
            .first();

        if (!membership) {
            res.status(403).json({ error: 'You are not a member of that guild.' });
            return;
        }

        const guild = await db('guilds').where({ id: player.guild_id }).first();
        if (!guild) {
            res.status(404).json({ error: 'Guild not found.' });
            return;
        }

        req.guild = {
            id: guild.id,
            name: guild.name,
            role: membership.role,
            rank: RANKS[membership.role] ?? 1,
        };

        next();
    } catch (err) {
        logger.error(`Guild forum auth error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
}

router.use(requireAuth, requireGuildMember);

/** Leaders and the founder manage the forum's shape. */
function canManage(guild: GuildContext): boolean {
    return guild.rank >= RANKS.leader;
}

/** A category the caller may read, scoped to their guild. Null if not. */
async function readableCategory(guild: GuildContext, categoryId: number) {
    if (!Number.isFinite(categoryId)) return null;

    const category = await db('guild_forum_categories')
        .where({ id: categoryId, guild_id: guild.id })
        .first();

    if (!category) return null;
    if (guild.rank < category.min_role_view) return null;
    return category;
}

/** A thread the caller may read, with its category. */
async function readableThread(guild: GuildContext, threadId: number) {
    if (!Number.isFinite(threadId)) return null;

    const thread = await db('guild_forum_threads')
        .where({ id: threadId, guild_id: guild.id, is_deleted: false })
        .first();

    if (!thread) return null;

    const category = await readableCategory(guild, thread.category_id);
    if (!category) return null;

    return { thread, category };
}

// ── Categories ──────────────────────────────────────────────────────────────

/** The guild's board list, filtered to what this member's rank may see. */
router.get('/categories', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;

    try {
        const categories = await db('guild_forum_categories')
            .where({ guild_id: guild.id })
            .where('min_role_view', '<=', guild.rank)
            .orderBy('sort_order', 'asc');

        const withStats = await Promise.all(categories.map(async (cat) => {
            const count = await db('guild_forum_threads')
                .where({ category_id: cat.id, is_deleted: false })
                .count('id as count').first();

            const last = await db('guild_forum_threads')
                .where({
                    'guild_forum_threads.category_id': cat.id,
                    'guild_forum_threads.is_deleted': false,
                })
                .leftJoin('players', 'guild_forum_threads.last_post_by', 'players.id')
                .orderBy('guild_forum_threads.last_post_at', 'desc')
                .select(
                    'guild_forum_threads.id',
                    'guild_forum_threads.title',
                    'guild_forum_threads.last_post_at',
                    'players.username as last_post_username',
                )
                .first();

            return {
                ...cat,
                threadCount: parseInt(String(count?.count ?? 0)) || 0,
                canPost: guild.rank >= cat.min_role_post,
                lastThread: last || null,
            };
        }));

        res.json({
            categories: withStats,
            guildName: guild.name,
            myRole: guild.role,
            myRank: guild.rank,
            canManage: canManage(guild),
        });
    } catch (err) {
        logger.error(`Guild forum categories error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Create a board. Leaders and above. */
router.post('/categories', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const { name, description, minRoleView, minRolePost, sortOrder } = req.body || {};

    try {
        if (!canManage(guild)) {
            res.status(403).json({ error: 'Only guild leaders can manage boards.' });
            return;
        }

        if (!name || !String(name).trim()) {
            res.status(400).json({ error: 'A board needs a name.' });
            return;
        }

        const view = clampRank(minRoleView);
        const post = clampRank(minRolePost);

        if (post < view) {
            res.status(400).json({
                error: 'Posting cannot be open to ranks that cannot read the board.',
            });
            return;
        }

        const [created] = await db('guild_forum_categories').insert({
            guild_id: guild.id,
            name: String(name).trim().slice(0, 100),
            description: description ? String(description).trim().slice(0, 300) : null,
            sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
            min_role_view: view,
            min_role_post: post,
            created_by: req.player!.playerId,
        }).returning('*');

        logger.info(`Guild ${guild.id} created forum board "${created?.name}"`);
        res.json({ success: true, category: created });
    } catch (err) {
        logger.error(`Guild forum create category error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Update a board's name, blurb, order, or permissions. Leaders and above. */
router.put('/categories/:id', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const categoryId = parseInt(String(req.params.id));
    const { name, description, minRoleView, minRolePost, sortOrder } = req.body || {};

    try {
        if (!canManage(guild)) {
            res.status(403).json({ error: 'Only guild leaders can manage boards.' });
            return;
        }

        const category = await db('guild_forum_categories')
            .where({ id: categoryId, guild_id: guild.id })
            .first();

        if (!category) {
            res.status(404).json({ error: 'Board not found.' });
            return;
        }

        const view = minRoleView === undefined ? category.min_role_view : clampRank(minRoleView);
        const post = minRolePost === undefined ? category.min_role_post : clampRank(minRolePost);

        if (post < view) {
            res.status(400).json({
                error: 'Posting cannot be open to ranks that cannot read the board.',
            });
            return;
        }

        await db('guild_forum_categories').where({ id: categoryId, guild_id: guild.id }).update({
            name: name ? String(name).trim().slice(0, 100) : category.name,
            description: description === undefined
                ? category.description
                : (description ? String(description).trim().slice(0, 300) : null),
            sort_order: Number.isFinite(sortOrder) ? sortOrder : category.sort_order,
            min_role_view: view,
            min_role_post: post,
            updated_at: db.fn.now(),
        });

        res.json({ success: true });
    } catch (err) {
        logger.error(`Guild forum update category error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Delete a board and everything in it. Founder only: it is destructive. */
router.delete('/categories/:id', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const categoryId = parseInt(String(req.params.id));

    try {
        if (guild.rank < RANKS.founder) {
            res.status(403).json({ error: 'Only the guild founder can delete a board.' });
            return;
        }

        const deleted = await db('guild_forum_categories')
            .where({ id: categoryId, guild_id: guild.id })
            .delete();

        if (!deleted) {
            res.status(404).json({ error: 'Board not found.' });
            return;
        }

        logger.info(`Guild ${guild.id} deleted forum board ${categoryId}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Guild forum delete category error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Threads ─────────────────────────────────────────────────────────────────

router.get('/categories/:id/threads', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const categoryId = parseInt(String(req.params.id));

    try {
        const category = await readableCategory(guild, categoryId);
        if (!category) {
            res.status(404).json({ error: 'Board not found.' });
            return;
        }

        const threads = await db('guild_forum_threads')
            .where({
                'guild_forum_threads.category_id': categoryId,
                'guild_forum_threads.guild_id': guild.id,
                'guild_forum_threads.is_deleted': false,
            })
            .join('players as author', 'guild_forum_threads.author_id', 'author.id')
            .leftJoin('players as last_poster', 'guild_forum_threads.last_post_by', 'last_poster.id')
            .orderBy('guild_forum_threads.is_pinned', 'desc')
            .orderBy('guild_forum_threads.last_post_at', 'desc')
            .select(
                'guild_forum_threads.*',
                'author.username as author_name',
                'last_poster.username as last_post_username',
            );

        res.json({
            category,
            threads,
            canPost: guild.rank >= category.min_role_post,
            canManage: canManage(guild),
        });
    } catch (err) {
        logger.error(`Guild forum threads error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/threads/:id', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const threadId = parseInt(String(req.params.id));

    try {
        const found = await readableThread(guild, threadId);
        if (!found) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        const posts = await db('guild_forum_posts')
            .where({
                'guild_forum_posts.thread_id': threadId,
                'guild_forum_posts.guild_id': guild.id,
                'guild_forum_posts.is_deleted': false,
            })
            .join('players', 'guild_forum_posts.author_id', 'players.id')
            .orderBy('guild_forum_posts.created_at', 'asc')
            .select(
                'guild_forum_posts.*',
                'players.username as author_name',
                'players.guild_role as author_role',
            );

        res.json({
            thread: found.thread,
            category: found.category,
            posts,
            canPost: guild.rank >= found.category.min_role_post,
            canManage: canManage(guild),
            myPlayerId: req.player!.playerId,
        });
    } catch (err) {
        logger.error(`Guild forum thread error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/threads', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const playerId = req.player!.playerId;
    const { categoryId, title, content } = req.body || {};

    try {
        const category = await readableCategory(guild, parseInt(String(categoryId)));
        if (!category) {
            res.status(404).json({ error: 'Board not found.' });
            return;
        }

        if (guild.rank < category.min_role_post) {
            res.status(403).json({ error: 'Your rank cannot post on that board.' });
            return;
        }

        if (!title || !String(title).trim() || !content || !String(content).trim()) {
            res.status(400).json({ error: 'A thread needs a title and a first post.' });
            return;
        }

        const [thread] = await db('guild_forum_threads').insert({
            guild_id: guild.id,
            category_id: category.id,
            author_id: playerId,
            title: String(title).trim().slice(0, 200),
            last_post_at: db.fn.now(),
            last_post_by: playerId,
        }).returning('*');

        await db('guild_forum_posts').insert({
            guild_id: guild.id,
            thread_id: thread.id,
            author_id: playerId,
            content: String(content).trim(),
        });

        res.json({ success: true, threadId: thread.id });
    } catch (err) {
        logger.error(`Guild forum create thread error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/threads/:id/reply', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const playerId = req.player!.playerId;
    const threadId = parseInt(String(req.params.id));
    const { content } = req.body || {};

    try {
        const found = await readableThread(guild, threadId);
        if (!found) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        if (found.thread.is_locked) {
            res.status(403).json({ error: 'That thread is locked.' });
            return;
        }

        if (guild.rank < found.category.min_role_post) {
            res.status(403).json({ error: 'Your rank cannot post on that board.' });
            return;
        }

        if (!content || !String(content).trim()) {
            res.status(400).json({ error: 'A reply needs some content.' });
            return;
        }

        await db('guild_forum_posts').insert({
            guild_id: guild.id,
            thread_id: threadId,
            author_id: playerId,
            content: String(content).trim(),
        });

        await db('guild_forum_threads').where({ id: threadId, guild_id: guild.id }).update({
            reply_count: db.raw('reply_count + 1'),
            last_post_at: db.fn.now(),
            last_post_by: playerId,
        });

        res.json({ success: true });
    } catch (err) {
        logger.error(`Guild forum reply error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Pin or unpin. Leaders and above. */
router.post('/threads/:id/pin', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const threadId = parseInt(String(req.params.id));

    try {
        if (!canManage(guild)) {
            res.status(403).json({ error: 'Only guild leaders can pin threads.' });
            return;
        }

        const found = await readableThread(guild, threadId);
        if (!found) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        await db('guild_forum_threads').where({ id: threadId, guild_id: guild.id })
            .update({ is_pinned: !found.thread.is_pinned });

        res.json({ success: true, pinned: !found.thread.is_pinned });
    } catch (err) {
        logger.error(`Guild forum pin error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Lock or unlock. Leaders and above. */
router.post('/threads/:id/lock', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const threadId = parseInt(String(req.params.id));

    try {
        if (!canManage(guild)) {
            res.status(403).json({ error: 'Only guild leaders can lock threads.' });
            return;
        }

        const found = await readableThread(guild, threadId);
        if (!found) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        await db('guild_forum_threads').where({ id: threadId, guild_id: guild.id })
            .update({ is_locked: !found.thread.is_locked });

        res.json({ success: true, locked: !found.thread.is_locked });
    } catch (err) {
        logger.error(`Guild forum lock error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Delete a thread. Its author, or a leader. */
router.delete('/threads/:id', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const playerId = req.player!.playerId;
    const threadId = parseInt(String(req.params.id));

    try {
        const found = await readableThread(guild, threadId);
        if (!found) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        if (found.thread.author_id !== playerId && !canManage(guild)) {
            res.status(403).json({ error: 'You cannot delete that thread.' });
            return;
        }

        await db('guild_forum_threads').where({ id: threadId, guild_id: guild.id }).update({ is_deleted: true });
        res.json({ success: true });
    } catch (err) {
        logger.error(`Guild forum delete thread error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Posts ───────────────────────────────────────────────────────────────────

/** Edit your own post. Leaders may not rewrite other people's words. */
router.put('/posts/:id', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const playerId = req.player!.playerId;
    const postId = parseInt(String(req.params.id));
    const { content } = req.body || {};

    try {
        const post = await db('guild_forum_posts')
            .where({ id: postId, guild_id: guild.id, is_deleted: false })
            .first();

        if (!post || !await readableThread(guild, post.thread_id)) {
            res.status(404).json({ error: 'Post not found.' });
            return;
        }

        if (post.author_id !== playerId) {
            res.status(403).json({ error: 'You can only edit your own posts.' });
            return;
        }

        if (!content || !String(content).trim()) {
            res.status(400).json({ error: 'A post needs some content.' });
            return;
        }

        await db('guild_forum_posts').where({ id: postId, guild_id: guild.id }).update({
            content: String(content).trim(),
            edited_at: db.fn.now(),
        });

        res.json({ success: true });
    } catch (err) {
        logger.error(`Guild forum edit post error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** Delete a post. Its author, or a leader. */
router.delete('/posts/:id', async (req: GuildRequest, res: Response) => {
    const guild = req.guild!;
    const playerId = req.player!.playerId;
    const postId = parseInt(String(req.params.id));

    try {
        const post = await db('guild_forum_posts')
            .where({ id: postId, guild_id: guild.id, is_deleted: false })
            .first();

        if (!post || !await readableThread(guild, post.thread_id)) {
            res.status(404).json({ error: 'Post not found.' });
            return;
        }

        if (post.author_id !== playerId && !canManage(guild)) {
            res.status(403).json({ error: 'You cannot delete that post.' });
            return;
        }

        await db('guild_forum_posts').where({ id: postId, guild_id: guild.id }).update({ is_deleted: true });

        await db('guild_forum_threads').where({ id: post.thread_id, guild_id: guild.id })
            .update({ reply_count: db.raw('GREATEST(reply_count - 1, 0)') });

        res.json({ success: true });
    } catch (err) {
        logger.error(`Guild forum delete post error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

function clampRank(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.min(3, Math.max(1, Math.round(n)));
}

export default router;
