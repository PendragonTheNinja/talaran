import { Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import db from '../db';
import { logger } from '../lib/logger';
import { AuthRequest } from '../middleware/auth';
import { pushToPlayer } from '../lib/realtime';

export const BOT_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * The waits a fighter may choose between bot checks (Settings > Combat,
 * player_settings.combat_bot_check_minutes). A check freezes a fight between
 * kills, so a shorter wait stops an unattended fight sooner: a player can take
 * on a creature that would wear them down in twenty minutes, knowing the fight
 * halts at five. Never longer than the normal interval.
 */
export const COMBAT_BOT_CHECK_MINUTES = [5, 10, 15, 20, 25, 30] as const;
export const DEFAULT_COMBAT_BOT_CHECK_MINUTES = 30;

// A check is "pending" whenever an unanswered question is stored on the player.
// players.bot_check_answer is the single source of truth: non-null = outstanding.
export function hasPendingBotCheck(player: any): boolean {
    return player.bot_check_answer !== null && player.bot_check_answer !== undefined;
}

// Due = no outstanding check AND it's been >= the interval since the last pass.
// A fight passes the player's chosen combat interval; everything else the default.
export function isBotCheckDue(player: any, now: Date = new Date(), intervalMs: number = BOT_CHECK_INTERVAL): boolean {
    if (hasPendingBotCheck(player)) return false;
    const last = player.last_bot_check
        ? new Date(player.last_bot_check)
        : new Date(player.last_login || player.created_at);
    return now.getTime() - last.getTime() >= intervalMs;
}

/** The player's chosen wait between bot checks while fighting, in ms. */
export async function combatBotCheckIntervalMs(x: Knex | Knex.Transaction, playerId: number): Promise<number> {
    const row = await x('player_settings').where({ player_id: playerId }).select('combat_bot_check_minutes').first();
    const minutes = Number(row?.combat_bot_check_minutes);
    const chosen = (COMBAT_BOT_CHECK_MINUTES as readonly number[]).includes(minutes) ? minutes : DEFAULT_COMBAT_BOT_CHECK_MINUTES;
    return chosen * 60 * 1000;
}

// Generate a fresh question, store the expected answer on the player, and emit it.
// Does NOT touch last_bot_check — that only advances when the player passes.
/** Each addend runs 1 to this. Both together top out at twice it. */
export const BOT_CHECK_MAX_ADDEND = 20;

export async function issueBotCheck(playerId: number): Promise<{ a: number; b: number }> {
    const a = Math.floor(Math.random() * BOT_CHECK_MAX_ADDEND) + 1;
    const b = Math.floor(Math.random() * BOT_CHECK_MAX_ADDEND) + 1;
    await db('players').where({ id: playerId }).update({ bot_check_answer: a + b });
    pushToPlayer(playerId, 'bot_check_required', { a, b });
    logger.info(`Bot check issued for player ${playerId}`);
    // Returned as well as emitted. The socket is one delivery route and it can
    // fail: a dropped connection, a sleeping tab, a blocked origin. When the
    // only copy of the question goes over a channel that is down, the player is
    // locked out of every action with no way to ask for it again.
    return { a, b };
}

// Middleware gating any "start an action / travel" route.
// Outstanding check OR newly due -> issue/re-issue a question and block the action.
// Fails open: a DB hiccup should never lock a player out of playing.
export async function botCheckGate(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const playerId = req.player!.playerId;
        const player = await db('players').where({ id: playerId }).first();
        if (!player) {
            next();
            return;
        }
        if (hasPendingBotCheck(player) || isBotCheckDue(player)) {
            const { a, b } = await issueBotCheck(playerId);
            // The question travels with the refusal. Any blocked action now
            // re-presents the check, so being stuck is self-correcting: the
            // player clicks something, the prompt appears, they answer it.
            res.status(423).json({ error: 'Bot check required.', botCheck: true, a, b });
            return;
        }
        next();
    } catch (err) {
        logger.error(`Bot check gate error: ${err}`);
        next();
    }
}