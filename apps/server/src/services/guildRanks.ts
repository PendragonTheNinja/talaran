import db from '../db';

// ── Guild ranks and what each may do ─────────────────────────────────────────
//
// A fixed ladder (Nathan, 2026-11-02): Recruit, Member, Officer, Leader. The
// founder, while they lead, holds the rank 'founder', which is the Leader rank
// under another name; hand the guild on and they become an Officer like
// anyone else. Nothing anywhere compares role strings: everything asks for a
// rank number or a permission through this file.
//
// What a rank may do is the leader's choice (guilds.rank_permissions, a JSON
// map of rank to permission keys; null means the defaults below). The leader
// may always do everything. Whatever the permissions, a member only ever acts
// on members ranked below them, and only the leader hands out Officer.
//
// guild_members.role is the record; players.guild_role is a copy for the
// places that already read it (chat, the player profile). setRole writes both.

export const RANKS = ['recruit', 'member', 'officer', 'leader'] as const;
export type Rank = typeof RANKS[number];
export type Role = Rank | 'founder';

const LEVEL: Record<string, number> = { recruit: 1, member: 2, officer: 3, leader: 4, founder: 4 };

/** The rank number of a role: Recruit 1 up to Leader 4. Unknown counts as Recruit. */
export function rankOf(role: string | null | undefined): number {
    return LEVEL[role ?? ''] ?? 1;
}

export const RANK_LABELS: Record<Role, string> = {
    recruit: 'Recruit', member: 'Member', officer: 'Officer', leader: 'Leader', founder: 'Founder',
};

export interface GuildPermission { key: string; label: string }

/** Everything a rank below Leader can be allowed, in the order Settings lists them. */
export const GUILD_PERMISSIONS: GuildPermission[] = [
    { key: 'invite', label: 'Invite players and accept applications' },
    { key: 'kick', label: 'Remove lower ranks from the guild' },
    { key: 'promote', label: 'Promote and demote lower ranks' },
    { key: 'withdraw_items', label: 'Take items from the storehouse' },
    { key: 'withdraw_gold', label: 'Take gold from the storehouse' },
    { key: 'approve_requests', label: 'Approve requests from the storehouse' },
    { key: 'manage_forum', label: 'Manage the guild forum' },
    { key: 'post_news', label: 'Post guild news' },
];
const PERMISSION_KEYS = new Set(GUILD_PERMISSIONS.map(p => p.key));

/** The ranks whose permissions the leader sets. */
export const CONFIGURABLE_RANKS = ['officer', 'member', 'recruit'] as const;
type ConfigurableRank = typeof CONFIGURABLE_RANKS[number];

export const DEFAULT_RANK_PERMISSIONS: Record<ConfigurableRank, string[]> = {
    officer: ['invite', 'kick', 'promote', 'withdraw_items', 'withdraw_gold', 'approve_requests', 'manage_forum', 'post_news'],
    member: ['withdraw_items'],
    recruit: [],
};

/** A guild's permissions by rank, defaults filled in, unknown keys dropped. */
export function rankPermissions(raw: unknown): Record<ConfigurableRank, string[]> {
    const parsed = typeof raw === 'string' ? safeJson(raw) : raw;
    const out = { ...DEFAULT_RANK_PERMISSIONS };
    if (parsed && typeof parsed === 'object') {
        for (const rank of CONFIGURABLE_RANKS) {
            const list = (parsed as Record<string, unknown>)[rank];
            if (Array.isArray(list)) out[rank] = list.filter((k): k is string => typeof k === 'string' && PERMISSION_KEYS.has(k));
        }
    }
    return out;
}

function safeJson(s: string): unknown {
    try { return JSON.parse(s); } catch { return null; }
}

/** Clean a leader's edit: only known ranks and keys survive. */
export function cleanRankPermissions(input: unknown): Record<ConfigurableRank, string[]> | null {
    if (!input || typeof input !== 'object') return null;
    const out = {} as Record<ConfigurableRank, string[]>;
    for (const rank of CONFIGURABLE_RANKS) {
        const list = (input as Record<string, unknown>)[rank];
        if (!Array.isArray(list)) return null;
        out[rank] = [...new Set(list.filter((k): k is string => typeof k === 'string' && PERMISSION_KEYS.has(k)))];
    }
    return out;
}

export interface Membership {
    guildId: number
    role: Role
    rank: number
    isLeader: boolean
    /** True when this member may do `permission` (the leader always may). */
    can: (permission: string) => boolean
    guild: any
}

/**
 * A player's standing in their guild, read from guild_members (the record),
 * or null when they are in none. Pass a transaction to read inside it; add
 * `lock` to hold the membership row while acting on it.
 */
export async function membershipOf(playerId: number, x: any = db, lock = false): Promise<Membership | null> {
    const q = x('guild_members').where({ player_id: playerId });
    const row = await (lock ? q.forUpdate() : q).first();
    if (!row) return null;
    const guild = await x('guilds').where({ id: row.guild_id }).first();
    if (!guild) return null;
    const role = row.role as Role;
    const rank = rankOf(role);
    const isLeader = Number(guild.leader_id) === playerId;
    const perms = rankPermissions(guild.rank_permissions);
    return {
        guildId: guild.id,
        role,
        rank,
        isLeader,
        guild,
        can: (permission: string) => isLeader || (rank < 4 && (perms[role as ConfigurableRank] ?? []).includes(permission)),
    };
}

/** Set a member's role in both places it is kept. */
export async function setRole(x: any, guildId: number, playerId: number, role: Role): Promise<void> {
    await x('guild_members').where({ guild_id: guildId, player_id: playerId }).update({ role });
    await x('players').where({ id: playerId }).update({ guild_role: role });
}

/** The role a new leader takes: 'founder' for the founder, 'leader' for anyone else. */
export function leaderRoleFor(guild: { founder_id: number }, playerId: number): Role {
    return Number(guild.founder_id) === playerId ? 'founder' : 'leader';
}
