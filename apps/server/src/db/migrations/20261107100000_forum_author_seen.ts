import type { Knex } from 'knex';

// Replies to your own threads (Nathan, 2026-11-07): the Forum button shows how
// many replies other players have left on threads you started since you last
// opened each one, as Messages shows unread messages (routes/forum.ts).
// Replying to someone else's thread never counts.
//
// forum_threads.author_seen_at is when the thread's starter last opened it.
// Existing threads start as seen now, so the first count after the deploy is
// replies from here on, not every reply ever written.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('forum_threads', 'author_seen_at'))) {
        await knex.schema.alterTable('forum_threads', (t) => {
            t.timestamp('author_seen_at', { useTz: true }).nullable();
        });
        await knex('forum_threads').whereNull('author_seen_at').update({ author_seen_at: knex.fn.now() });
    }
    await knex.raw('CREATE INDEX IF NOT EXISTS forum_threads_author_id_index ON forum_threads (author_id)');
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP INDEX IF EXISTS forum_threads_author_id_index');
    if (await knex.schema.hasColumn('forum_threads', 'author_seen_at')) {
        await knex.schema.alterTable('forum_threads', (t) => { t.dropColumn('author_seen_at'); });
    }
}
