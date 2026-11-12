import type { Knex } from 'knex';

// Following forum threads (forum, 2026-11-10; Nathan, 2026-11-12). Replies were
// told only to a thread's starter, through forum_threads.author_seen_at. Now
// anyone may follow a thread: starting one follows it, replying follows it
// (unless the player had unfollowed it), and any follower may unfollow, the
// starter included. One row per player and thread; `following` false keeps an
// explicit "no" so a later reply does not undo it. seen_at is when the player
// last opened the thread: replies after it are new.
//
// Every thread's starter is carried over, seen where author_seen_at says, so
// nobody's notifications change on the day this runs.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('forum_thread_follows'))) {
        await knex.schema.createTable('forum_thread_follows', (t) => {
            t.integer('player_id').notNullable().references('id').inTable('players').onDelete('CASCADE');
            t.integer('thread_id').notNullable().references('id').inTable('forum_threads').onDelete('CASCADE');
            t.boolean('following').notNullable().defaultTo(true);
            t.timestamp('seen_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            t.primary(['player_id', 'thread_id']);
            t.index(['thread_id']);
        });
    }
    await knex.raw(`
        INSERT INTO forum_thread_follows (player_id, thread_id, following, seen_at)
        SELECT author_id, id, true, COALESCE(author_seen_at, created_at)
          FROM forum_threads
         WHERE author_id IS NOT NULL
        ON CONFLICT (player_id, thread_id) DO NOTHING`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('forum_thread_follows');
}
