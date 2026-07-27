import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { io } from '../index';

const router = Router();

// ── Category visibility ─────────────────────────────────────────────────────
//
// A forum_category may be restricted two ways: staff_only, and guild_id for a
// private guild board. Both are enforced here rather than per endpoint, because
// thirteen handlers touch forum data and a single missed check would expose a
// guild's private threads to everyone.
//
// Every handler either filters by visibleCategoryIds() or guards a single
// category with canSeeCategory() / categoryOfThread() / categoryOfPost().

/** Category ids this player is allowed to read, staff and guild rules applied. */
async function visibleCategoryIds(playerId: number): Promise<number[]> {
    const player = await db('players').where({ id: playerId }).first();
    const isStaff = !!(player?.is_admin || player?.is_mod);

    let q = db('forum_categories').select('id');

    if (!isStaff) q = q.where({ staff_only: false });

    // Staff do NOT get to read guild halls. Moderation powers are not an excuse
    // to sit in on a private board; a staff member sees only their own guild's.
    q = q.where((b) => {
        b.whereNull('guild_id');
        if (player?.guild_id) b.orWhere('guild_id', player.guild_id);
    });

    const rows = await q;
    return rows.map((r) => r.id);
}

async function canSeeCategory(playerId: number, categoryId: number): Promise<boolean> {
    if (!Number.isFinite(categoryId)) return false;
    const allowed = await visibleCategoryIds(playerId);
    return allowed.includes(Number(categoryId));
}

/** The category a thread belongs to, or null if the thread does not exist. */
async function categoryOfThread(threadId: number): Promise<number | null> {
    const t = await db('forum_threads').where({ id: threadId }).select('category_id').first();
    return t ? Number(t.category_id) : null;
}

/** The category a post belongs to, via its thread. */
async function categoryOfPost(postId: number): Promise<number | null> {
    const row = await db('forum_posts')
        .join('forum_threads', 'forum_posts.thread_id', 'forum_threads.id')
        .where('forum_posts.id', postId)
        .select('forum_threads.category_id')
        .first();
    return row ? Number(row.category_id) : null;
}

async function guardPoll(playerId: number, pollId: number, res: Response): Promise<boolean> {
    const row = await db('forum_polls')
        .join('forum_threads', 'forum_polls.thread_id', 'forum_threads.id')
        .where('forum_polls.id', pollId)
        .select('forum_threads.category_id')
        .first();

    if (!row || !await canSeeCategory(playerId, Number(row.category_id))) {
        res.status(404).json({ error: 'Poll not found.' });
        return false;
    }
    return true;
}

/**
 * Guard for any endpoint acting on a thread. Returns false and answers the
 * request when the player may not see it. Deliberately 404 rather than 403: a
 * private board should not confirm that it exists.
 */
async function guardThread(playerId: number, threadId: number, res: Response): Promise<boolean> {
    const categoryId = await categoryOfThread(threadId);
    if (categoryId === null || !await canSeeCategory(playerId, categoryId)) {
        res.status(404).json({ error: 'Thread not found.' });
        return false;
    }
    return true;
}

async function guardPost(playerId: number, postId: number, res: Response): Promise<boolean> {
    const categoryId = await categoryOfPost(postId);
    if (categoryId === null || !await canSeeCategory(playerId, categoryId)) {
        res.status(404).json({ error: 'Post not found.' });
        return false;
    }
    return true;
}

// Get all categories (filtered by staff status)
router.get('/categories', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const visible = await visibleCategoryIds(playerId);

        const categories = await db('forum_categories')
            .whereIn('id', visible)
            .orderBy('sort_order', 'asc');

        // Get thread/post counts for each category
        const categoriesWithStats = await Promise.all(categories.map(async cat => {
            const threadCount = await db('forum_threads')
                .where({ category_id: cat.id, is_deleted: false })
                .count('id as count').first();
            const lastThread = await db('forum_threads')
                .where({ category_id: cat.id, is_deleted: false })
                .orderBy('last_post_at', 'desc')
                .join('players', 'forum_threads.last_post_by', 'players.id')
                .select('forum_threads.id', 'forum_threads.title', 'forum_threads.last_post_at', 'players.username as last_post_username')
                .first();

            return {
                ...cat,
                threadCount: parseInt(threadCount?.count as string) || 0,
                lastThread: lastThread || null,
            };
        }));

        res.json({ categories: categoriesWithStats });
    } catch (err) {
        logger.error(`Forum categories error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get recent posts for forum home
router.get('/recent', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const visible = await visibleCategoryIds(playerId);

        const recentThreads = await db('forum_threads')
            .join('forum_categories', 'forum_threads.category_id', 'forum_categories.id')
            .join('players as last_poster', 'forum_threads.last_post_by', 'last_poster.id')
            .join('players as author', 'forum_threads.author_id', 'author.id')
            .where('forum_threads.is_deleted', false)
            .whereIn('forum_threads.category_id', visible)
            .orderBy('forum_threads.last_post_at', 'desc')
            .limit(20)
            .select(
                'forum_threads.id as thread_id',
                'forum_threads.title as thread_title',
                'forum_threads.last_post_at',
                'forum_categories.id as category_id',
                'forum_categories.name as category_name',
                'last_poster.username as last_poster_name',
            );

        res.json({ recentThreads });
    } catch (err) {
        logger.error(`Forum recent error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get threads in a category
router.get('/categories/:id/threads', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const categoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const page = parseInt(req.query.page as string) || 1;
    const limit = 25;
    const offset = (page - 1) * limit;

    try {
        const player = await db('players').where({ id: playerId }).first();
        const isStaff = player.is_admin || player.is_mod;

        const category = await db('forum_categories').where({ id: categoryId }).first();
        if (!category) {
            res.status(404).json({ error: 'Category not found.' });
            return;
        }

        // Covers staff_only and private guild halls in one place.
        if (!await canSeeCategory(playerId, categoryId)) {
            res.status(404).json({ error: 'Category not found.' });
            return;
        }

        const threads = await db('forum_threads')
            .where({ category_id: categoryId, is_deleted: false })
            .join('players as author', 'forum_threads.author_id', 'author.id')
            .leftJoin('players as last_poster', 'forum_threads.last_post_by', 'last_poster.id')
            .orderBy('forum_threads.is_pinned', 'desc')
            .orderBy('forum_threads.last_post_at', 'desc')
            .limit(limit)
            .offset(offset)
            .select(
                'forum_threads.*',
                'author.username as author_name',
                'last_poster.username as last_poster_name',
            );

        const totalCount = await db('forum_threads')
            .where({ category_id: categoryId, is_deleted: false })
            .count('id as count').first();

        res.json({
            category,
            threads,
            totalCount: parseInt(totalCount?.count as string) || 0,
            page,
            totalPages: Math.ceil((parseInt(totalCount?.count as string) || 0) / limit),
        });
    } catch (err) {
        logger.error(`Forum threads error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get a single thread with posts
router.get('/threads/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const threadId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const page = parseInt(req.query.page as string) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    try {
        if (!await guardThread(playerId, threadId, res)) return;

        const player = await db('players').where({ id: playerId }).first();
        const isStaff = player.is_admin || player.is_mod;

        const thread = await db('forum_threads')
            .where({ 'forum_threads.id': threadId, is_deleted: false })
            .join('forum_categories', 'forum_threads.category_id', 'forum_categories.id')
            .join('players as author', 'forum_threads.author_id', 'author.id')
            .select('forum_threads.*', 'forum_categories.name as category_name', 'forum_categories.has_voting', 'forum_categories.staff_only', 'author.username as author_name')
            .first();

        if (!thread) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        if (thread.staff_only && !isStaff) {
            res.status(403).json({ error: 'Access denied.' });
            return;
        }

        // Increment view count
        await db('forum_threads').where({ id: threadId }).increment('view_count', 1);

        const posts = await db('forum_posts')
            .where({ thread_id: threadId, is_deleted: false })
            .join('players', 'forum_posts.author_id', 'players.id')
            .orderBy('forum_posts.created_at', 'asc')
            .limit(limit)
            .offset(offset)
            .select(
                'forum_posts.*',
                'players.username as author_name',
                'players.avatar_url',
                'players.forum_signature',
                'players.forum_post_count',
                'players.guild_tag',
                'players.created_at as player_joined',
                'players.is_admin',
                'players.is_mod',
            );

        // Get vote data for each post if category has voting
        let postsWithVotes = posts;
        if (thread.has_voting) {
            postsWithVotes = await Promise.all(posts.map(async post => {
                const myVote = await db('forum_post_votes')
                    .where({ post_id: post.id, player_id: playerId })
                    .first();
                return { ...post, myVote: myVote?.vote || 0 };
            }));
        }

        // Get poll if exists
        const poll = await db('forum_polls')
            .where({ thread_id: threadId })
            .first();

        let pollData = null;
        if (poll) {
            const options = await db('forum_poll_options')
                .where({ poll_id: poll.id });
            const myVote = await db('forum_poll_votes')
                .where({ poll_id: poll.id, player_id: playerId })
                .first();
            pollData = { ...poll, options, myVoteOptionId: myVote?.option_id || null };
        }

        const totalCount = await db('forum_posts')
            .where({ thread_id: threadId, is_deleted: false })
            .count('id as count').first();

        res.json({
            thread,
            posts: postsWithVotes,
            poll: pollData,
            totalCount: parseInt(totalCount?.count as string) || 0,
            page,
            totalPages: Math.ceil((parseInt(totalCount?.count as string) || 0) / limit),
            myRole: { isAdmin: player.is_admin, isMod: player.is_mod },
        });
    } catch (err) {
        logger.error(`Forum thread error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a thread
router.post('/threads', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { categoryId, title, content, pollQuestion, pollOptions } = req.body;

    try {
        if (!await canSeeCategory(playerId, parseInt(String(categoryId)))) {
            res.status(404).json({ error: 'Category not found.' });
            return;
        }

        const player = await db('players').where({ id: playerId }).first();
        const isStaff = player.is_admin || player.is_mod;
        if (player.is_forum_banned) {
            const now = new Date();
            if (!player.forum_banned_until || new Date(player.forum_banned_until) > now) {
                res.status(403).json({ error: 'You are banned from the forum.' });
                return;
            } else {
                await db('players').where({ id: playerId }).update({ is_forum_banned: false, forum_banned_until: null });
            }
        }

        const category = await db('forum_categories').where({ id: categoryId }).first();
        if (!category) {
            res.status(404).json({ error: 'Category not found.' });
            return;
        }

        if (category.staff_only && !isStaff) {
            res.status(403).json({ error: 'Access denied.' });
            return;
        }

        if (category.admin_post_only && !player.is_admin) {
            res.status(403).json({ error: 'Only admins can post in this category.' });
            return;
        }

        if (!title?.trim() || !content?.trim()) {
            res.status(400).json({ error: 'Title and content are required.' });
            return;
        }

        const now = new Date();

        const [thread] = await db('forum_threads').insert({
            category_id: categoryId,
            author_id: playerId,
            title: title.trim(),
            is_pinned: false,
            is_locked: false,
            is_deleted: false,
            reply_count: 0,
            view_count: 0,
            last_post_at: now,
            last_post_by: playerId,
        }).returning('*');

        await db('forum_posts').insert({
            thread_id: thread.id,
            author_id: playerId,
            content: content.trim(),
            is_first_post: true,
            is_deleted: false,
        });

        // Increment post count
        await db('players').where({ id: playerId }).increment('forum_post_count', 1);

        // Create poll if provided
        if (pollQuestion && pollOptions && pollOptions.length >= 2) {
            const [poll] = await db('forum_polls').insert({
                thread_id: thread.id,
                question: pollQuestion.trim(),
                is_closed: false,
            }).returning('*');

            await db('forum_poll_options').insert(
                pollOptions.map((opt: string) => ({
                    poll_id: poll.id,
                    option_text: opt.trim(),
                    vote_count: 0,
                }))
            );
        }

        logger.info(`Player ${playerId} created thread ${thread.id} in category ${categoryId}`);
        // Emit forum notification to world chat
        {
            const forumPlayer = await db('players').where({ id: playerId }).first();
            const forumCategory = await db('forum_categories').where({ id: categoryId }).first();

            // Save to chat_messages for persistence
            await db('chat_messages').insert({
                player_id: playerId,
                channel: 'world',
                region: null,
                guild_id: null,
                message: `__FORUM__${thread.id}__${forumPlayer.username} posted "${thread.title}" in ${forumCategory.name}`,
                player_name: '📋',
                guild_tag: null,
                sent_at: now,
            });

            io.emit('forum_thread_created', {
                threadId: thread.id,
                title: thread.title,
                authorName: forumPlayer.username,
                categoryName: forumCategory.name,
                createdAt: now,
            });
        }
        res.json({ success: true, threadId: thread.id });
    } catch (err) {
        logger.error(`Create thread error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reply to a thread
router.post('/threads/:id/reply', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const threadId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { content } = req.body;

    try {
        if (!await guardThread(playerId, threadId, res)) return;

        const thread = await db('forum_threads').where({ id: threadId, is_deleted: false }).first();
        if (!thread) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        if (thread.is_locked) {
            res.status(403).json({ error: 'This thread is locked.' });
            return;
        }

        if (!content?.trim()) {
            res.status(400).json({ error: 'Reply content is required.' });
            return;
        }

        const player = await db('players').where({ id: playerId }).first();
        if (player.is_forum_banned) {
            const now = new Date();
            if (!player.forum_banned_until || new Date(player.forum_banned_until) > now) {
                res.status(403).json({ error: 'You are banned from the forum.' });
                return;
            } else {
                await db('players').where({ id: playerId }).update({ is_forum_banned: false, forum_banned_until: null });
            }
        }

        await db('forum_posts').insert({
            thread_id: threadId,
            author_id: playerId,
            content: content.trim(),
            is_first_post: false,
            is_deleted: false,
        });

        const now = new Date();
        await db('forum_threads').where({ id: threadId }).update({
            reply_count: thread.reply_count + 1,
            last_post_at: now,
            last_post_by: playerId,
        });

        await db('players').where({ id: playerId }).increment('forum_post_count', 1);

        logger.info(`Player ${playerId} replied to thread ${threadId}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Reply error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Vote on a post (feedback category)
router.post('/posts/:id/vote', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const postId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { vote } = req.body; // 1 or -1

    try {
        if (!await guardPost(playerId, postId, res)) return;

        if (vote !== 1 && vote !== -1) {
            res.status(400).json({ error: 'Invalid vote.' });
            return;
        }

        const existing = await db('forum_post_votes')
            .where({ post_id: postId, player_id: playerId })
            .first();

        if (existing) {
            if (existing.vote === vote) {
                // Remove vote
                await db('forum_post_votes').where({ id: existing.id }).delete();
                await db('forum_posts').where({ id: postId }).update({
                    upvotes: db.raw(`upvotes - ${vote === 1 ? 1 : 0}`),
                    downvotes: db.raw(`downvotes - ${vote === -1 ? 1 : 0}`),
                });
                res.json({ success: true, removed: true });
            } else {
                // Change vote
                await db('forum_post_votes').where({ id: existing.id }).update({ vote });
                await db('forum_posts').where({ id: postId }).update({
                    upvotes: db.raw(`upvotes + ${vote === 1 ? 1 : -1}`),
                    downvotes: db.raw(`downvotes + ${vote === -1 ? 1 : -1}`),
                });
                res.json({ success: true, changed: true });
            }
        } else {
            await db('forum_post_votes').insert({ post_id: postId, player_id: playerId, vote });
            await db('forum_posts').where({ id: postId }).update({
                upvotes: db.raw(`upvotes + ${vote === 1 ? 1 : 0}`),
                downvotes: db.raw(`downvotes + ${vote === -1 ? 1 : 0}`),
            });
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Vote on a poll
router.post('/polls/:id/vote', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const pollId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { optionId } = req.body;

    try {
        if (!await guardPoll(playerId, pollId, res)) return;

        const poll = await db('forum_polls').where({ id: pollId, is_closed: false }).first();
        if (!poll) {
            res.status(404).json({ error: 'Poll not found or closed.' });
            return;
        }

        const existing = await db('forum_poll_votes')
            .where({ poll_id: pollId, player_id: playerId })
            .first();

        if (existing) {
            res.status(400).json({ error: 'You have already voted.' });
            return;
        }

        await db('forum_poll_votes').insert({
            poll_id: pollId,
            option_id: optionId,
            player_id: playerId,
        });

        await db('forum_poll_options').where({ id: optionId }).increment('vote_count', 1);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a post (own post or mod/admin)
router.delete('/posts/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const postId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    try {
        if (!await guardPost(playerId, postId, res)) return;

        const player = await db('players').where({ id: playerId }).first();
        const post = await db('forum_posts').where({ id: postId }).first();

        if (!post) {
            res.status(404).json({ error: 'Post not found.' });
            return;
        }

        if (post.author_id !== playerId && !player.is_admin && !player.is_mod) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        // If this is the first post, delete the entire thread
        if (post.is_first_post) {
            await db('forum_threads').where({ id: post.thread_id }).update({ is_deleted: true });
        } else {
            await db('forum_posts').where({ id: postId }).update({ is_deleted: true });
            await db('forum_threads').where({ id: post.thread_id }).decrement('reply_count', 1);
        }

        res.json({ success: true });
    } catch (err) {
        logger.error(`Delete post error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a thread (own thread or mod/admin)
router.delete('/threads/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const threadId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    try {
        if (!await guardThread(playerId, threadId, res)) return;

        const player = await db('players').where({ id: playerId }).first();
        const thread = await db('forum_threads').where({ id: threadId }).first();

        if (!thread) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        if (thread.author_id !== playerId && !player.is_admin && !player.is_mod) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        await db('forum_threads').where({ id: threadId }).update({ is_deleted: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Pin/unpin a thread (mod/admin only)
router.post('/threads/:id/pin', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const threadId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.is_admin && !player.is_mod) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        // Staff moderation powers stop at the door of a guild hall they are not
        // a member of; guardThread enforces that, not the is_admin check above.
        if (!await guardThread(playerId, threadId, res)) return;

        const thread = await db('forum_threads').where({ id: threadId }).first();
        await db('forum_threads').where({ id: threadId }).update({ is_pinned: !thread.is_pinned });
        res.json({ success: true, pinned: !thread.is_pinned });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Lock/unlock a thread (mod/admin only)
router.post('/threads/:id/lock', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const threadId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { reason } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.is_admin && !player.is_mod) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

        if (!await guardThread(playerId, threadId, res)) return;

        const thread = await db('forum_threads').where({ id: threadId }).first();
        const nowLocked = !thread.is_locked;
        await db('forum_threads').where({ id: threadId }).update({
            is_locked: nowLocked,
            locked_at: nowLocked ? new Date() : null,
            locked_reason: nowLocked ? (reason || null) : null,
        });
        res.json({ success: true, locked: nowLocked });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Edit a post
router.put('/posts/:postId', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const postId = parseInt(req.params.postId as string);
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
        res.status(400).json({ error: 'Content cannot be empty.' });
        return;
    }

    try {
        if (!await guardPost(playerId, postId, res)) return;

        const post = await db('forum_posts').where({ id: postId, is_deleted: false }).first();
        if (!post) {
            res.status(404).json({ error: 'Post not found.' });
            return;
        }

        const player = await db('players').where({ id: playerId }).first();
        const canEdit = post.author_id === playerId || player.is_admin || player.is_mod;

        if (!canEdit) {
            res.status(403).json({ error: 'You cannot edit this post.' });
            return;
        }

        await db('forum_posts').where({ id: postId }).update({
            content: content.trim(),
            edited_at: new Date(),
        });

        logger.info(`Player ${playerId} edited post ${postId}`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`Edit post error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;