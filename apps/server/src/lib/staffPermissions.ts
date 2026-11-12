import db from '../db';

// What a member of staff may do (mod_permissions; Admin > Players > a moderator).
// An admin may do everything. A moderator may do what their row ticks, and
// nothing without a row. One reader for the admin routes and the forum: the
// forum used to let every moderator pin, lock, delete and edit whatever they
// liked, and can_moderate_forum was read nowhere (audit 2026-11-09).

export const STAFF_PERMISSIONS = [
    'can_moderate_chat',
    'can_moderate_forum',
    'can_view_players',
    'can_send_messages',
    'can_ban',
] as const;

export type StaffPermission = typeof STAFF_PERMISSIONS[number];

/** Whether this player may do this. */
export async function hasPermission(playerId: number, permission: StaffPermission | string): Promise<boolean> {
    const player = await db('players').where({ id: playerId }).first('is_admin', 'is_mod');
    if (!player) return false;
    if (player.is_admin) return true;
    if (!player.is_mod) return false;
    const perms = await db('mod_permissions').where({ player_id: playerId }).first();
    return !!perms && perms[permission] === true;
}
