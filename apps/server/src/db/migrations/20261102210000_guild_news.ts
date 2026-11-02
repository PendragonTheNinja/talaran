import type { Knex } from 'knex';

// Guild news (Nathan, 2026-11-02): every guild has a News board in its forum.
// Starting a thread there needs the post_news permission (services/
// guildRanks.ts; Officers by default); replying follows the board's own rank
// setting like any board. The three latest headlines show on the guild's
// Overview.
//
//   guild_forum_categories.is_news   marks a guild's News board. It cannot be
//                                    deleted, only renamed or re-ranked.
// Every guild that exists gets one, first in its list.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('guild_forum_categories', 'is_news'))) {
        await knex.schema.alterTable('guild_forum_categories', t => { t.boolean('is_news').notNullable().defaultTo(false); });
    }
    const guilds = await knex('guilds').select('id', 'founder_id', 'leader_id');
    for (const g of guilds) {
        const has = await knex('guild_forum_categories').where({ guild_id: g.id, is_news: true }).first('id');
        if (has) continue;
        await knex('guild_forum_categories').insert({
            guild_id: g.id, name: 'News', description: 'Word from the guild\'s officers.',
            sort_order: -1, min_role_view: 1, min_role_post: 1, is_news: true, created_by: g.leader_id ?? g.founder_id,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('guild_forum_categories', 'is_news'))) return;
    // Boards with posts are kept as ordinary boards; empty News boards go.
    const boards = await knex('guild_forum_categories').where({ is_news: true }).select('id');
    for (const b of boards) {
        const used = await knex('guild_forum_threads').where({ category_id: b.id }).first('id');
        if (!used) await knex('guild_forum_categories').where({ id: b.id }).delete();
    }
    await knex.schema.alterTable('guild_forum_categories', t => { t.dropColumn('is_news'); });
}
