import { Response, NextFunction } from 'express';
import db from '../db';
import { io, logger } from '../index';
import { AuthRequest } from '../middleware/auth';

export const BOT_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes

// A check is "pending" whenever an unanswered question is stored on the player.
// players.bot_check_answer is the single source of truth: non-null = outstanding.
export function hasPendingBotCheck(player: any): boolean {
    return player.bot_check_answer !== null && player.bot_check_answer !== undefined;
}

// Due = no outstanding check AND it's been >= the interval since the last pass.
export function isBotCheckDue(player: any, now: Date = new Date()): boolean {
    if (hasPendingBotCheck(player)) return false;
    const last = player.last_bot_check
        ? new Date(player.last_bot_check)
        : new Date(player.last_login || player.created_at);
    return now.getTime() - last.getTime() >= BOT_CHECK_INTERVAL;
}

// Generate a fresh question, store the expected answer on the player, and emit it.
// Does NOT touch last_bot_check — that only advances when the player passes.
/** Each addend runs 1 to this. Both together top out at twice it. */
export const BOT_CHECK_MAX_ADDEND = 50;

export async function issueBotCheck(playerId: number): Promise<void> {
    const a = Math.floor(Math.random() * BOT_CHECK_MAX_ADDEND) + 1;
    const b = Math.floor(Math.random() * BOT_CHECK_MAX_ADDEND) + 1;
    await db('players').where({ id: playerId }).update({ bot_check_answer: a + b });
    io.to(`player_${playerId}`).emit('bot_check_required', { a, b });
    logger.info(`Bot check issued for player ${playerId}`);
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
            await issueBotCheck(playerId);
            res.status(423).json({ error: 'Bot check required.', botCheck: true });
            return;
        }
        next();
    } catch (err) {
        logger.error(`Bot check gate error: ${err}`);
        next();
    }
}