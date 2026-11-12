import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireTrusted } from '../lib/trust';
import { logger } from '../lib/logger';
import { pushToAll, pushToPlayer } from '../lib/realtime';
import { readText, TEXT_LIMITS } from '../lib/textLimits';
import { cleanPublicText, FilterRefusal, SWEAR_NOTICE } from '../services/wordFilter';

const router = Router();

/**
 * Is this player barred from writing on the forum? A timed ban that has run
 * out is lifted here, the first time it is checked. One helper for every write
 * path: thread, reply and edit used to carry their own copies, and edit had none
 * (audit L-5), so a forum-banned player could still rewrite old posts.
 */
async function forumBanned(player: { id: number; is_forum_banned: boolean; forum_banned_until: Date | string | null }): Promise<boolean> {
    if (!player.is_forum_banned) return false;
    if (!player.forum_banned_until || new Date(player.forum_banned_until) > new Date()) return true;
    await db('players').where({ id: player.id }).update({ is_forum_banned: false, forum_banned_until: null });
    return false;
}

// ── Replies to threads you follow (Nathan, 2026-11-07; follows 2026-11-12) ──
// The Forum button counts replies other players have left on threads you
// follow since you last opened each one, as Messages counts unread messages.
// Starting a thread or replying to one follows it; anyone may follow or
// unfollow from the thread (forum_thread_follows). Opening a thread stamps its
// seen_at; a reply pushes 'forum_replies_changed' to every other follower.
// forum_threads.author_seen_at is no longer read: the follows replaced it.

const POSTS_PER_PAGE = 20;

interface ThreadWithReplies { thread_id: number; title: string; newReplies: number; firstNewPage: number; lastReplyAt: string }

/**
 * New replies on the threads this player follows (forum_thread_follows): every
 * thread they started or replied to unless they unfollowed it, and any they
 * chose to follow (forum, 2026-11-10). It used to be the threads they started,
 * and no way to stop.
 */
async function repliesToMyThreads(playerId: number): Promise<ThreadWithReplies[]> {
    const player = await db('players').where({ id: playerId }).first('is_admin', 'is_mod');
    const isStaff = !!(player?.is_admin || player?.is_mod);
    const rows = await db('forum_threads as t')
        .join('forum_thread_follows as f', function () {
            this.on('f.thread_id', '=', 't.id').andOn('f.player_id', '=', db.raw('?', [playerId]))
        })
        .join('forum_posts as p', 'p.thread_id', 't.id')
        .join('forum_categories as c', 'c.id', 't.category_id')
        .where('f.following', true)
        .where('t.is_deleted', false)
        .where('p.is_deleted', false)
        .whereNot('p.author_id', playerId)
        .whereRaw('p.created_at > f.seen_at')
        .modify(q => { if (!isStaff) q.where('c.staff_only', false); })
        .groupBy('t.id', 't.title')
        .orderByRaw('MAX(p.created_at) DESC')
        .select<{ thread_id: number; title: string; n: string; first_new: Date; last_new: Date }[]>(
            't.id as thread_id', 't.title', db.raw('COUNT(p.id) AS n'),
            db.raw('MIN(p.created_at) AS first_new'), db.raw('MAX(p.created_at) AS last_new'));
    const out: ThreadWithReplies[] = [];
    for (const r of rows) {
        // The page the first new reply is on, so the list opens straight to it.
        const before = await db('forum_posts')
            .where({ thread_id: r.thread_id, is_deleted: false })
            .where('created_at', '<', r.first_new)
            .count('id as count').first();
        out.push({
            thread_id: Number(r.thread_id), title: r.title, newReplies: Number(r.n),
            firstNewPage: Math.floor((Number(before?.count) || 0) / POSTS_PER_PAGE) + 1,
            lastReplyAt: new Date(r.last_new).toISOString(),
        });
    }
    return out;
}

/** GET /api/forum/replies/count: new replies on threads this player started. */
router.get('/replies/count', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const threads = await repliesToMyThreads(req.player!.playerId);
        res.json({ count: threads.reduce((n, t) => n + t.newReplies, 0) });
    } catch (err) {
        logger.error(`Forum reply count error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

/** GET /api/forum/replies: which of this player's threads have new replies. */
router.get('/replies', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        res.json({ threads: await repliesToMyThreads(req.player!.playerId) });
    } catch (err) {
        logger.error(`Forum replies error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all categories (filtered by staff status)
router.get('/categories', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const player = await db('players').where({ id: playerId }).first();
        const isStaff = player.is_admin || player.is_mod;

        let query = db('forum_categories').orderBy('sort_order', 'asc');
        if (!isStaff) {
            query = query.where({ staff_only: false });
        }

        const categories = await query;

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
        const player = await db('players').where({ id: playerId }).first();
        const isStaff = player.is_admin || player.is_mod;

        const recentThreads = await db('forum_threads')
            .join('forum_categories', 'forum_threads.category_id', 'forum_categories.id')
            .join('players as last_poster', 'forum_threads.last_post_by', 'last_poster.id')
            .join('players as author', 'forum_threads.author_id', 'author.id')
            .where('forum_threads.is_deleted', false)
            .modify(query => {
                if (!isStaff) query.where('forum_categories.staff_only', false);
            })
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

        if (category.staff_only && !isStaff) {
            res.status(403).json({ error: 'Access denied.' });
            return;
        }

        const threads = await db('forum_threads')
            .where({ category_id: categoryId, is_deleted: false })
            .join('players as author', 'forum_threads.author_id', 'author.id')
            .leftJoin('players as last_poster', 'forum_threads.last_post_by', 'last_poster.id')
            // Pinned to the top, locked to the bottom, everything else by recency.
            // Locked threads are usually settled business — an idea that has since
            // been built, a bug already fixed — so they were surfacing above live
            // discussion purely because locking bumped last_post_at.
            .orderBy('forum_threads.is_pinned', 'desc')
            .orderBy('forum_threads.is_locked', 'asc')
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
    const limit = POSTS_PER_PAGE;
    const offset = (page - 1) * limit;

    try {
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

        // A follower has now seen every reply: their Forum count drops, in
        // every tab they have open.
        const seen = await db('forum_thread_follows').where({ player_id: playerId, thread_id: threadId })
            .update({ seen_at: db.fn.now() }).returning('following');
        const following = !!seen[0]?.following;
        if (following) pushToPlayer(playerId, 'forum_replies_changed', { threadId });

        const posts = await db('forum_posts')
            .where({ thread_id: threadId, is_deleted: false })
            .join('players', 'forum_posts.author_id', 'players.id')
            // Joined for the badge's fallback glyph, so a badge with no art yet
            // still draws something.
            .leftJoin('feats as bf', 'bf.badge_key', 'players.worn_badge')
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
                // Worn title and badge. The author block already has room for a
                // phrase, which chat does not, so the forum is the natural place
                // for a title to be seen.
                'players.worn_title',
                'players.worn_badge as badge_key',
                'bf.badge as badge',
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
            following,
        });
    } catch (err) {
        logger.error(`Forum thread error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a thread
router.post('/threads', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const { categoryId, title, content, pollQuestion, pollOptions } = req.body;

    try {
        const player = await db('players').where({ id: playerId }).first();
        const isStaff = player.is_admin || player.is_mod;
        if (await forumBanned(player)) {
            res.status(403).json({ error: 'You are banned from the forum.' });
            return;
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

        // Everything is read and checked before the first insert, so a bad
        // poll can no longer leave a thread behind without one.
        const cleanTitle = readText(title, { label: 'Title', max: TEXT_LIMITS.forumTitle, singleLine: true });
        if (!cleanTitle.ok) { res.status(400).json({ error: cleanTitle.error }); return; }
        const cleanContent = readText(content, { label: 'Post', max: TEXT_LIMITS.forumPost });
        if (!cleanContent.ok) { res.status(400).json({ error: cleanContent.error }); return; }

        // A poll is asked for when either half of it is sent. Asking for one and
        // then leaving it half-filled is refused rather than quietly dropped.
        let poll: { question: string; options: string[] } | null = null;
        if ((pollQuestion !== undefined && pollQuestion !== null) || (pollOptions !== undefined && pollOptions !== null)) {
            const question = readText(pollQuestion, { label: 'Poll question', max: TEXT_LIMITS.pollQuestion, singleLine: true });
            if (!question.ok) { res.status(400).json({ error: question.error }); return; }

            if (!Array.isArray(pollOptions)) {
                res.status(400).json({ error: 'Poll options are missing.' });
                return;
            }
            const options: string[] = [];
            for (const raw of pollOptions) {
                const option = readText(raw, { label: 'A poll option', max: TEXT_LIMITS.pollOption, required: false, singleLine: true });
                if (!option.ok) { res.status(400).json({ error: option.error }); return; }
                if (option.value) options.push(option.value);
            }
            if (options.length < TEXT_LIMITS.pollOptionsMin || options.length > TEXT_LIMITS.pollOptionsMax) {
                res.status(400).json({
                    error: `A poll needs ${TEXT_LIMITS.pollOptionsMin} to ${TEXT_LIMITS.pollOptionsMax} options.`,
                });
                return;
            }
            poll = { question: question.value!, options };
        }

        // The language filter (services/wordFilter.ts): swears become silly
        // words, a slur refuses the post (caught below).
        let filterChanged = false;
        const clean = async (place: string, text: string) => {
            const c = await cleanPublicText(playerId, place, text);
            filterChanged ||= c.changed;
            return c.text;
        };
        cleanTitle.value = await clean('forum:title', cleanTitle.value!);
        cleanContent.value = await clean('forum:post', cleanContent.value!);
        if (poll) {
            poll.question = await clean('forum:poll', poll.question);
            for (let i = 0; i < poll.options.length; i++) poll.options[i] = await clean('forum:poll', poll.options[i]);
        }

        const now = new Date();

        const [thread] = await db('forum_threads').insert({
            category_id: categoryId,
            author_id: playerId,
            title: cleanTitle.value,
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
            content: cleanContent.value,
            is_first_post: true,
            is_deleted: false,
        });

        // Increment post count
        await db('players').where({ id: playerId }).increment('forum_post_count', 1);

        // The starter follows their own thread; they may unfollow it.
        await db('forum_thread_follows').insert({ player_id: playerId, thread_id: thread.id, following: true })
            .onConflict(['player_id', 'thread_id']).ignore();

        if (poll) {
            const [created] = await db('forum_polls').insert({
                thread_id: thread.id,
                question: poll.question,
                is_closed: false,
            }).returning('*');

            await db('forum_poll_options').insert(
                poll.options.map((text) => ({
                    poll_id: created.id,
                    option_text: text,
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

            pushToAll('forum_thread_created', {
                threadId: thread.id,
                title: thread.title,
                authorName: forumPlayer.username,
                categoryName: forumCategory.name,
                createdAt: now,
            });
        }
        res.json({ success: true, threadId: thread.id, notice: filterChanged ? SWEAR_NOTICE : null });
    } catch (err) {
        if (err instanceof FilterRefusal) { res.status(400).json({ error: err.message }); return; }
        logger.error(`Create thread error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reply to a thread
router.post('/threads/:id/reply', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const threadId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { content } = req.body;

    try {
        const thread = await db('forum_threads').where({ id: threadId, is_deleted: false }).first();
        if (!thread) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }

        if (thread.is_locked) {
            res.status(403).json({ error: 'This thread is locked.' });
            return;
        }

        const cleanContent = readText(content, { label: 'Reply', max: TEXT_LIMITS.forumPost });
        if (!cleanContent.ok) { res.status(400).json({ error: cleanContent.error }); return; }
        const filteredReply = await cleanPublicText(playerId, 'forum:post', cleanContent.value!);
        cleanContent.value = filteredReply.text;

        const player = await db('players').where({ id: playerId }).first();

        // A staff-only thread is hidden from non-staff everywhere else, but a
        // reply by thread id used to go through (audit L-5).
        const category = await db('forum_categories').where({ id: thread.category_id }).first();
        if (category?.staff_only && !(player.is_admin || player.is_mod)) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }
        if (await forumBanned(player)) {
            res.status(403).json({ error: 'You are banned from the forum.' });
            return;
        }

        await db('forum_posts').insert({
            thread_id: threadId,
            author_id: playerId,
            content: cleanContent.value,
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

        // Replying follows the thread, unless the player had unfollowed it
        // (that row is kept, so a reply does not undo their "no"). Seen now:
        // their own reply is not news to them.
        await db('forum_thread_follows').insert({ player_id: playerId, thread_id: threadId, following: true })
            .onConflict(['player_id', 'thread_id']).merge({ seen_at: db.fn.now() });
        // Every other follower is told, in every tab they have open.
        const followers: number[] = (await db('forum_thread_follows')
            .where({ thread_id: threadId, following: true }).whereNot({ player_id: playerId })
            .pluck('player_id')).map(Number);
        for (const id of followers) pushToPlayer(id, 'forum_replies_changed', { threadId });

        logger.info(`Player ${playerId} replied to thread ${threadId}`);
        res.json({ success: true, notice: filteredReply.changed ? SWEAR_NOTICE : null });
    } catch (err) {
        if (err instanceof FilterRefusal) { res.status(400).json({ error: err.message }); return; }
        logger.error(`Reply error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// Vote on a post (feedback category)
router.post('/posts/:id/vote', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const postId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { vote } = req.body; // 1 or -1

    try {
        if (vote !== 1 && vote !== -1) {
            res.status(400).json({ error: 'Invalid vote.' });
            return;
        }

        // The vote row is the truth and the counters are recounted from it,
        // under a lock on the post. They used to be adjusted by +1/-1 from a
        // read made before the write, so parallel clicks drifted them and could
        // drive them below zero (audit L-6).
        const outcome = await db.transaction(async (trx) => {
            const post = await trx('forum_posts').where({ id: postId, is_deleted: false }).forUpdate().first();
            if (!post) return null;

            const existing = await trx('forum_post_votes').where({ post_id: postId, player_id: playerId }).first();
            let result: { removed?: true; changed?: true };
            if (existing && existing.vote === vote) {
                await trx('forum_post_votes').where({ id: existing.id }).delete();
                result = { removed: true };
            } else if (existing) {
                await trx('forum_post_votes').where({ id: existing.id }).update({ vote });
                result = { changed: true };
            } else {
                await trx('forum_post_votes').insert({ post_id: postId, player_id: playerId, vote });
                result = {};
            }

            const [counts] = await trx('forum_post_votes').where({ post_id: postId })
                .select(trx.raw('count(*) FILTER (WHERE vote = 1)::int AS up'), trx.raw('count(*) FILTER (WHERE vote = -1)::int AS down'));
            await trx('forum_posts').where({ id: postId }).update({ upvotes: counts.up, downvotes: counts.down });
            return result;
        });

        if (!outcome) {
            res.status(404).json({ error: 'Post not found.' });
            return;
        }
        res.json({ success: true, ...outcome });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Vote on a poll
router.post('/polls/:id/vote', requireAuth, requireTrusted, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const pollId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { optionId } = req.body;

    try {
        const poll = await db('forum_polls').where({ id: pollId, is_closed: false }).first();
        if (!poll) {
            res.status(404).json({ error: 'Poll not found or closed.' });
            return;
        }

        // The option must belong to THIS poll: it was never checked, so a vote
        // on one poll could count for an option of another.
        const option = await db('forum_poll_options').where({ id: optionId, poll_id: pollId }).first();
        if (!option) {
            res.status(400).json({ error: 'That is not an option in this poll.' });
            return;
        }

        // One vote per player per poll, held by the unique key: the vote and its
        // count go in together or not at all.
        const counted = await db.transaction(async (trx) => {
            const [vote] = await trx('forum_poll_votes')
                .insert({ poll_id: pollId, option_id: optionId, player_id: playerId })
                .onConflict(['poll_id', 'player_id'])
                .ignore()
                .returning('id');
            if (!vote) return false;
            await trx('forum_poll_options').where({ id: optionId }).increment('vote_count', 1);
            return true;
        });
        if (!counted) {
            res.status(400).json({ error: 'You have already voted.' });
            return;
        }

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
// Follow or unfollow a thread: be told of new replies to it, or not.
router.post('/threads/:id/follow', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const threadId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const follow = req.body?.follow === true;
    try {
        const player = await db('players').where({ id: playerId }).first('is_admin', 'is_mod');
        const thread = await db('forum_threads as t').join('forum_categories as c', 'c.id', 't.category_id')
            .where({ 't.id': threadId, 't.is_deleted': false }).first('t.id', 'c.staff_only');
        if (!thread || (thread.staff_only && !(player?.is_admin || player?.is_mod))) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }
        await db('forum_thread_follows').insert({ player_id: playerId, thread_id: threadId, following: follow })
            .onConflict(['player_id', 'thread_id']).merge({ following: follow, seen_at: db.fn.now() });
        pushToPlayer(playerId, 'forum_replies_changed', { threadId });
        res.json({ success: true, following: follow });
    } catch (err) {
        logger.error(`Forum follow error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/threads/:id/pin', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const threadId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    try {
        const player = await db('players').where({ id: playerId }).first();
        if (!player.is_admin && !player.is_mod) {
            res.status(403).json({ error: 'No permission.' });
            return;
        }

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

        const thread = await db('forum_threads').where({ id: threadId }).first();
        if (!thread) {
            res.status(404).json({ error: 'Thread not found.' });
            return;
        }
        const cleanReason = readText(reason, { label: 'Reason', max: TEXT_LIMITS.lockReason, required: false, singleLine: true });
        if (!cleanReason.ok) { res.status(400).json({ error: cleanReason.error }); return; }
        const nowLocked = !thread.is_locked;
        await db('forum_threads').where({ id: threadId }).update({
            is_locked: nowLocked,
            locked_at: nowLocked ? new Date() : null,
            locked_reason: nowLocked ? cleanReason.value : null,
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

    try {
        const player = await db('players').where({ id: playerId }).first();
        const isStaff = player.is_admin || player.is_mod;
        // Staff get the longer cap: they edit the Announcements copies of news
        // posts, which run past a player's (TEXT_LIMITS.staffPost).
        const cleanContent = readText(req.body?.content, {
            label: 'Post', max: isStaff ? TEXT_LIMITS.staffPost : TEXT_LIMITS.forumPost,
        });
        if (!cleanContent.ok) {
            res.status(400).json({ error: cleanContent.error });
            return;
        }
        const filteredEdit = await cleanPublicText(playerId, 'forum:edit', cleanContent.value!);
        cleanContent.value = filteredEdit.text;

        const post = await db('forum_posts').where({ id: postId, is_deleted: false }).first();
        if (!post) {
            res.status(404).json({ error: 'Post not found.' });
            return;
        }

        const canEdit = post.author_id === playerId || isStaff;

        if (!canEdit) {
            res.status(403).json({ error: 'You cannot edit this post.' });
            return;
        }
        if (!isStaff && await forumBanned(player)) {
            res.status(403).json({ error: 'You are banned from the forum.' });
            return;
        }

        await db('forum_posts').where({ id: postId }).update({
            content: cleanContent.value,
            edited_at: new Date(),
        });

        logger.info(`Player ${playerId} edited post ${postId}`);
        res.json({ success: true, content: cleanContent.value, notice: filteredEdit.changed ? SWEAR_NOTICE : null });
    } catch (err) {
        if (err instanceof FilterRefusal) { res.status(400).json({ error: err.message }); return; }
        logger.error(`Edit post error: ${err}`);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;