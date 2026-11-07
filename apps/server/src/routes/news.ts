import { Router, Response, Request } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { readText, TEXT_LIMITS } from '../lib/textLimits';

const router = Router();

// The line under a news post's Announcements copy, kept in one place so an
// edit writes the copy exactly as creating it did.
const ANNOUNCEMENT_FOOTER = '\n\n---\n*This is an official Talaran announcement. Discuss it here.*';

// Public - get latest news (no auth required)
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const posts = await db('news_posts')
      .join('players', 'news_posts.author_id', 'players.id')
      .orderBy('news_posts.published_at', 'desc')
      .limit(10)
      .select(
        'news_posts.id',
        'news_posts.title',
        'news_posts.body',
        'news_posts.published_at',
        'news_posts.forum_thread_id',
        'players.username as author_name',
      );

    res.json({ posts });
  } catch (err) {
    logger.error(`News latest error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin - create news post
router.post('/create', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const { title, body } = req.body;

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player.is_admin) {
      res.status(403).json({ error: 'Admins only.' });
      return;
    }

    if (!title?.trim() || !body?.trim()) {
      res.status(400).json({ error: 'Title and body are required.' });
      return;
    }
    // Capped so its Announcements copy stays editable (TEXT_LIMITS.newsBody).
    const cleanBody = readText(body, { label: 'Body', max: TEXT_LIMITS.newsBody });
    if (!cleanBody.ok) {
      res.status(400).json({ error: cleanBody.error });
      return;
    }

    const now = new Date();

    // Find announcements category
    const announcementsCategory = await db('forum_categories')
      .where({ admin_post_only: true })
      .first();

    let forumThreadId = null;

    if (announcementsCategory) {
      // Create forum thread
      const [thread] = await db('forum_threads').insert({
        category_id: announcementsCategory.id,
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
        content: `${body.trim()}${ANNOUNCEMENT_FOOTER}`,
        is_first_post: true,
        is_deleted: false,
      });

      await db('players').where({ id: playerId }).increment('forum_post_count', 1);
      forumThreadId = thread.id;
    }

    const [post] = await db('news_posts').insert({
      author_id: playerId,
      title: title.trim(),
      body: body.trim(),
      forum_thread_id: forumThreadId,
      published_at: now,
    }).returning('*');

    logger.info(`Admin ${playerId} published news post: ${title}`);
    res.json({ success: true, post });
  } catch (err) {
    logger.error(`News create error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin - edit a news post from the News panel. Its Announcements thread is
// rewritten with it (title and first post), so the two never disagree.
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const postId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player?.is_admin) {
      res.status(403).json({ error: 'Admins only.' });
      return;
    }
    const cleanTitle = readText(req.body?.title, { label: 'Title', max: 200, singleLine: true });
    if (!cleanTitle.ok) { res.status(400).json({ error: cleanTitle.error }); return; }
    const cleanBody = readText(req.body?.body, { label: 'Body', max: TEXT_LIMITS.newsBody });
    if (!cleanBody.ok) { res.status(400).json({ error: cleanBody.error }); return; }

    const post = await db.transaction(async (trx) => {
      const [row] = await trx('news_posts').where({ id: postId })
        .update({ title: cleanTitle.value, body: cleanBody.value }).returning('*');
      if (!row) return null;
      if (row.forum_thread_id) {
        await trx('forum_threads').where({ id: row.forum_thread_id }).update({ title: cleanTitle.value, updated_at: trx.fn.now() });
        await trx('forum_posts').where({ thread_id: row.forum_thread_id, is_first_post: true })
          .update({ content: `${cleanBody.value}${ANNOUNCEMENT_FOOTER}`, edited_at: trx.fn.now(), updated_at: trx.fn.now() });
      }
      return row;
    });
    if (!post) { res.status(404).json({ error: 'There is no such news post.' }); return; }
    logger.info(`Admin ${playerId} edited news post ${postId}`);
    res.json({ success: true, post });
  } catch (err) {
    logger.error(`News edit error: ${err}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin - delete news post
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const playerId = req.player!.playerId;
  const postId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  try {
    const player = await db('players').where({ id: playerId }).first();
    if (!player.is_admin) {
      res.status(403).json({ error: 'Admins only.' });
      return;
    }

    await db('news_posts').where({ id: postId }).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;