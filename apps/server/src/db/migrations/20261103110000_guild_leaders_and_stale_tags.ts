import type { Knex } from 'knex';

// Guilds, after 1.23 (forum, 2026-11-03):
//
//  1. Leaders. The old guild system let a guild have any number of "leaders".
//     1.23's ranks kept their role but gave powers only to the guild's head
//     (guilds.leader_id), so those members held the top rank with no
//     permissions, and nobody could change it. A guild now has at most two
//     Leaders, the head included (services/guildRanks.ts MAX_LEADERS), named by
//     the head. Every member holding the Leader rank who is not the head
//     becomes an Officer here; the head names a second Leader from there.
//     Officers can invite by default, so they keep that.
//
//  2. The head always holds the Leader rank ('founder' if they founded it).
//
//  3. Stale tags. Disbanding cleared players.guild_id (ON DELETE SET NULL) but
//     not players.guild_tag or guild_role, so chat kept showing a disbanded
//     guild's tag. Anyone in no guild loses both.
//
// Idempotent: a second run finds nothing to change.

export async function up(knex: Knex): Promise<void> {
    const extras = await knex('guild_members as gm')
        .join('guilds as g', 'g.id', 'gm.guild_id')
        .whereIn('gm.role', ['leader', 'founder'])
        .whereRaw('gm.player_id <> g.leader_id')
        .select('gm.player_id');
    const ids = extras.map((r: { player_id: number }) => Number(r.player_id));
    if (ids.length) {
        await knex('guild_members').whereIn('player_id', ids).update({ role: 'officer' });
        await knex('players').whereIn('id', ids).update({ guild_role: 'officer' });
    }

    const heads = await knex('guilds as g')
        .join('guild_members as gm', function () { this.on('gm.guild_id', 'g.id').andOn('gm.player_id', 'g.leader_id'); })
        .whereNotIn('gm.role', ['leader', 'founder'])
        .select('g.id as guild_id', 'g.leader_id', 'g.founder_id');
    for (const h of heads) {
        const role = Number(h.founder_id) === Number(h.leader_id) ? 'founder' : 'leader';
        await knex('guild_members').where({ guild_id: h.guild_id, player_id: h.leader_id }).update({ role });
        await knex('players').where({ id: h.leader_id }).update({ guild_role: role });
    }

    await knex('players').whereNull('guild_id')
        .where(function () { this.whereNotNull('guild_tag').orWhereNotNull('guild_role'); })
        .update({ guild_tag: null, guild_role: null });
}

export async function down(): Promise<void> {
    // A data repair: the old extra "leaders" had no permissions under 1.23's
    // ranks, so there is nothing useful to put back, and a stale tag is not
    // worth restoring.
}
