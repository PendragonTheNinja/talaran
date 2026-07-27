import type { Knex } from 'knex';

// Reverts 20260726020000_guild_forum_categories.
//
// That migration put guild boards inside the PUBLIC forum as forum_categories
// rows carrying a guild_id, and relied on visibility filtering in
// routes/forum.ts to keep them private. The approach was replaced by dedicated
// guild_forum_* tables (20260726020000_guild_forum) and the filtering code was
// rolled back, which left those rows publicly readable.
//
// This removes them. Written as a forward migration rather than a rollback
// because both migrations share a timestamp and landed in the same batch, so
// `migrate:down` would take the working guild forum with it.
//
// Deleting the categories cascades to their threads and posts. Any content
// posted in a guild hall during the window is lost, which is the correct
// outcome: it was written on the assumption of privacy it did not have.

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn('forum_categories', 'guild_id');
    if (!hasColumn) return;

    const doomed = await knex('forum_categories').whereNotNull('guild_id').select('id', 'name');

    if (doomed.length > 0) {
        // Cascades to forum_threads and forum_posts via their foreign keys.
        await knex('forum_categories').whereNotNull('guild_id').delete();
    }

    await knex.schema.alterTable('forum_categories', (table) => {
        table.dropColumn('guild_id');
    });
}

export async function down(knex: Knex): Promise<void> {
    // Puts the column back but not the boards. Recreating publicly readable
    // guild halls is not something a rollback should do on its own.
    const hasColumn = await knex.schema.hasColumn('forum_categories', 'guild_id');
    if (hasColumn) return;

    await knex.schema.alterTable('forum_categories', (table) => {
        table.integer('guild_id').unsigned().nullable()
            .references('id').inTable('guilds').onDelete('CASCADE');
        table.index(['guild_id']);
    });
}
