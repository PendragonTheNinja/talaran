import type { Knex } from 'knex';

// ── Working beside your guild (Nathan, 2026-11-02) ───────────────────────────
//
// A small XP bonus for doing the same work at the same place as a guildmate:
// 1%, so that it is a nicety and never something a player needs. "The same
// work" is the same kind of action (two woodcutters, two smiths, two fighters)
// running for both of them at the place the player stands; a guildmate frozen
// on a bot check does not count.
//
// 1% of a short action's XP is a fraction of a point. Rounding it up would
// make a 20-second rock worth far more than 1% (it was Nathan's worry), so
// the bonus is exact on average instead: the whole part every time, and one
// more point with a chance equal to what is left over. 1% of 11 XP is 0.11,
// so an extra point 11% of the time. Actions worth 100 XP or more get at
// least a point every time.
//
// Applied in awardXp (services/xp.ts), the one XP writer, after any world
// event bonus, so every skill is covered. The result card is told through a
// short-lived note, as event XP is (takeGuildXp, read in gameTick's emit).

export const GUILD_BONUS_RATE = 0.01;

/** The extra XP for working beside a guildmate, or 0. */
export async function guildCompanionBonus(playerId: number, xp: number, x: Knex | Knex.Transaction): Promise<number> {
    if (xp <= 0) return 0;
    const me = await x('players').where({ id: playerId }).first('guild_id', 'current_location_id');
    if (!me?.guild_id || !me.current_location_id) return 0;
    const mine = await x('player_actions').where({ player_id: playerId }).first('action_type');
    if (!mine) return 0;
    const mate = await x('player_actions as a')
        .join('players as p', 'p.id', 'a.player_id')
        .where('p.guild_id', me.guild_id)
        .whereNot('a.player_id', playerId)
        .where('a.action_type', mine.action_type)
        .where('p.current_location_id', me.current_location_id)
        .where('a.bot_check_pending', false)
        .first('a.id');
    if (!mate) return 0;
    const exact = xp * GUILD_BONUS_RATE;
    const whole = Math.floor(exact);
    return whole + (Math.random() < exact - whole ? 1 : 0);
}

// What the result card is told, as worldEvents notes event XP.
const NOTE_TTL_MS = 60_000;
const notes = new Map<number, { skill: string; xp: number; at: number }>();

export function noteGuildXp(playerId: number, skillName: string, extra: number): void {
    const prev = notes.get(playerId);
    const same = prev && prev.skill === skillName && Date.now() - prev.at < NOTE_TTL_MS;
    notes.set(playerId, { skill: skillName, xp: (same ? prev.xp : 0) + extra, at: Date.now() });
}

/** The guild bonus in a player's last award of this skill, once; 0 when none. */
export function takeGuildXp(playerId: number, skillName: string | null | undefined): number {
    const note = notes.get(playerId);
    if (!note) return 0;
    notes.delete(playerId);
    if (!skillName || note.skill !== skillName || Date.now() - note.at > NOTE_TTL_MS) return 0;
    return note.xp;
}
