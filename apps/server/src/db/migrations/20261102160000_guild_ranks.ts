import type { Knex } from 'knex';

// Guild ranks (services/guildRanks.ts; Nathan, 2026-11-02): Recruit, Member,
// Officer, Leader, with the founder holding 'founder' (the Leader rank) only
// while they lead.
//
//   guilds.rank_permissions   what Officers, Members and Recruits may do, as a
//                             JSON map set by the leader. Null = the defaults.
//   founders who handed the   become Officers. They kept 'founder' before,
//   guild on                  which passed every leader check, so a guild had
//                             two people with a leader's powers.
//   forum categories          min_role_view/post move to the new scale. Old:
//                             member 1, leader 2, founder 3. New: recruit 1,
//                             member 2, officer 3, leader 4. "All members" (1)
//                             stays 1 so recruits read what members did;
//                             leader-only and founder-only both become 4.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('guilds', 'rank_permissions'))) {
        await knex.schema.alterTable('guilds', t => { t.jsonb('rank_permissions').nullable(); });

        // Inside the column guard, so a re-run never remaps twice.
        await knex('guild_forum_categories').whereIn('min_role_view', [2, 3]).update({ min_role_view: 4 });
        await knex('guild_forum_categories').whereIn('min_role_post', [2, 3]).update({ min_role_post: 4 });
    }

    const handedOn = await knex('guild_members as gm')
        .join('guilds as g', 'g.id', 'gm.guild_id')
        .where('gm.role', 'founder')
        .whereRaw('g.leader_id <> gm.player_id')
        .select('gm.player_id');
    const ids = handedOn.map((r: { player_id: number }) => r.player_id);
    if (ids.length) {
        await knex('guild_members').whereIn('player_id', ids).update({ role: 'officer' });
        await knex('players').whereIn('id', ids).update({ guild_role: 'officer' });
    }
}

export async function down(knex: Knex): Promise<void> {
    // Officers and Recruits did not exist before: they go back to Member, and
    // the founder who handed the guild on gets 'founder' back.
    await knex('guild_members').whereIn('role', ['officer', 'recruit']).update({ role: 'member' });
    await knex('players').whereIn('guild_role', ['officer', 'recruit']).update({ guild_role: 'member' });
    const founders = await knex('guilds').select('founder_id', 'id');
    for (const g of founders) {
        await knex('guild_members').where({ guild_id: g.id, player_id: g.founder_id }).update({ role: 'founder' });
        await knex('players').where({ id: g.founder_id, guild_id: g.id }).update({ guild_role: 'founder' });
    }
    if (await knex.schema.hasColumn('guilds', 'rank_permissions')) {
        // New 1-2 were "everyone" before (1); new 3-4 were leader-only (2).
        await knex.raw(`UPDATE guild_forum_categories SET
            min_role_view = CASE WHEN min_role_view >= 3 THEN 2 ELSE 1 END,
            min_role_post = CASE WHEN min_role_post >= 3 THEN 2 ELSE 1 END`);
        await knex.schema.alterTable('guilds', t => { t.dropColumn('rank_permissions'); });
    }
}
