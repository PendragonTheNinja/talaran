import type { Knex } from 'knex';

// DELIBERATELY EMPTY. DO NOT DELETE THIS FILE, AND DO NOT PUT CONTENT BACK.
//
// This filename was committed by accident: it is an older copy of
// 20260731160000_seed_husbandry_sources.ts, saved under the wrong timestamp
// during the Husbandry deploy. Both ran, in filename order, and because the old
// copy still referred to the quest by its former name ("The Stockman's Lesson")
// it did not recognise the row 160000 had just created and inserted a second
// quest with its own objectives. 20260731220000 then renamed that duplicate to
// match, leaving two identically named quests in production.
//
// It cannot simply be deleted: it has a row in knex_migrations on prod, and knex
// refuses to run when a recorded migration is missing from disk ("the migration
// directory is corrupt"). Same reasoning as the abandoned
// 20260726020000_guild_forum_categories.ts landmine in CLAUDE.md 5.
//
// So the file stays and does nothing. On prod it has already run and this change
// is inert. On any fresh database it runs as a no-op, which is what stops the
// duplicate quest being recreated.
//
// The real content lives, and has always lived, in
// 20260731160000_seed_husbandry_sources.ts.

export async function up(_knex: Knex): Promise<void> {
    // Intentionally empty. See above.
}

export async function down(_knex: Knex): Promise<void> {
    // Intentionally empty. See above.
}
