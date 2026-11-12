import db from '../db';

// Whether a player's chat mute is in force now. One rule for chat and private
// messages. A mute with no end date lasts until staff lift it; one whose date
// has passed is cleared here, so it never outlives itself.
//
// Private messages ignored mutes entirely, so a muted player could still write
// to anyone (audit 2026-11-09; Nathan, 2026-11-11: no private messages while
// muted). Guild chat stays open to a muted player, as before; that exception is
// the chat route's, not this rule's.
export async function isMutedNow(player: { id: number; is_chat_muted?: boolean | null; chat_muted_until?: Date | string | null }): Promise<boolean> {
    if (!player.is_chat_muted) return false;
    if (!player.chat_muted_until || new Date(player.chat_muted_until).getTime() > Date.now()) return true;
    await db('players').where({ id: player.id }).update({ is_chat_muted: false, chat_muted_until: null });
    return false;
}
