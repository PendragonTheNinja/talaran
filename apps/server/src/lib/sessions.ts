/**
 * Every session is issued here and checked here (audit H1).
 *
 * A token used to be checked for its signature and nothing else, for thirty
 * days. So a ban changed the database and left the banned player's saved token
 * working, and a password reset after an account was taken over left the thief
 * logged in. Now:
 *
 *   - every token carries `tv`, the player's token_version when it was issued;
 *   - every request and every socket connection compares that against the
 *     current value, and checks the ban and guest columns in the same lookup;
 *   - endSessions() bumps the version, which ends every session issued before.
 *
 * The lookup is cached per player for SESSION_CACHE_MS, so a player clicking
 * about costs one indexed query every half minute rather than one per request.
 * endSessions clears the cache for that player immediately in this process, so
 * a ban here bites on the very next request; the cache only ever delays it on
 * another process, and there is exactly one (see ecosystem.config.cjs).
 */
import type { Knex } from 'knex';
import db from '../db';
import { signToken } from '../config/jwt';
import { afterCommit } from './afterCommit';
import { realtimeServer } from './realtime';
import type { JwtPayload } from '../types';

const SESSION_CACHE_MS = 30_000;

/** How long a full account's token lasts. */
export const ACCOUNT_SESSION_SECONDS = 60 * 60 * 24 * 30;
/** A guest's token; the guest deadline column is the real limit. */
export const GUEST_SESSION_SECONDS = 60 * 60 * 24;

interface SessionRow {
    token_version: number;
    is_banned: boolean;
    banned_until: Date | null;
    is_guest: boolean;
    guest_expires_at: Date | null;
}

const cache = new Map<number, { row: SessionRow | null; at: number }>();

async function loadSessionRow(playerId: number): Promise<SessionRow | null> {
    const hit = cache.get(playerId);
    if (hit && Date.now() - hit.at < SESSION_CACHE_MS) return hit.row;

    const row = await db('players')
        .select('token_version', 'is_banned', 'banned_until', 'is_guest', 'guest_expires_at')
        .where({ id: playerId })
        .first();
    const value: SessionRow | null = row
        ? {
            token_version: Number(row.token_version ?? 0),
            is_banned: !!row.is_banned,
            banned_until: row.banned_until ? new Date(row.banned_until) : null,
            is_guest: !!row.is_guest,
            guest_expires_at: row.guest_expires_at ? new Date(row.guest_expires_at) : null,
        }
        : null;
    cache.set(playerId, { row: value, at: Date.now() });
    return value;
}

/** Forget the cached state for a player, so the next check reads the database. */
export function forgetSession(playerId: number): void {
    cache.delete(playerId);
}

/**
 * Issue a token for a player at their current session version.
 *
 * The only place a token is signed. Every sign-in route (register, login,
 * guest, claiming a guest) and every route that hands the caller a fresh token
 * after ending their other sessions goes through here, so no token is ever
 * missing its version.
 */
export async function issueSession(
    playerId: number,
    opts: { isGuest?: boolean } = {},
    x: Knex | Knex.Transaction = db,
): Promise<string> {
    const row = await x('players').select('token_version').where({ id: playerId }).first();
    const payload: JwtPayload = {
        playerId,
        tv: Number(row?.token_version ?? 0),
        ...(opts.isGuest ? { isGuest: true } : {}),
    };
    return signToken(payload, opts.isGuest ? GUEST_SESSION_SECONDS : ACCOUNT_SESSION_SECONDS);
}

/**
 * End every session the player has, from this moment.
 *
 * Bumps token_version, so every token issued before it fails its next check.
 * Pass the transaction if there is one: the bump then commits or rolls back
 * with the change that caused it, and the cache is cleared only once it has
 * committed.
 */
export async function endSessions(
    playerId: number,
    x: Knex | Knex.Transaction = db,
    opts: { disconnect?: boolean } = {},
): Promise<void> {
    await x('players').where({ id: playerId }).increment('token_version', 1);
    afterCommit(x, () => {
        forgetSession(playerId);
        // A socket is only checked when it connects, so one opened before the
        // ban would otherwise stay live until it happened to reconnect. Used for
        // bans and password resets. Not for a player ending their own other
        // sessions: the socket of the tab doing it would go with them.
        if (opts.disconnect) {
            realtimeServer()?.in(`player_${playerId}`).disconnectSockets(true);
        }
    });
    // Cleared now as well: a request racing the commit on the plain connection
    // must not keep reading the old version from the cache.
    forgetSession(playerId);
}

export type SessionVerdict =
    | { ok: true }
    | { ok: false; status: 401 | 403; error: string; reason: string };

/**
 * Is this verified token still a live session?
 *
 * 401 for anything that should send the player back to the login screen: the
 * account is gone, the session was ended, or the account is banned (the login
 * route then explains the ban, once the password is proven). 403 with
 * reason 'guest_expired' keeps its old meaning: the token is fine, the trial is
 * over, and the client shows the claim-your-character panel.
 */
export async function checkSession(payload: JwtPayload): Promise<SessionVerdict> {
    const row = await loadSessionRow(payload.playerId);
    if (!row) {
        return { ok: false, status: 401, error: 'This session has ended.', reason: 'session_ended' };
    }

    // A token from before versions existed carries none, and reads as 0.
    if (Number(payload.tv ?? 0) !== row.token_version) {
        return { ok: false, status: 401, error: 'This session has ended. Please log in again.', reason: 'session_ended' };
    }

    if (row.is_banned || (row.banned_until && row.banned_until.getTime() > Date.now())) {
        return { ok: false, status: 401, error: 'This account is banned.', reason: 'banned' };
    }

    // A guest deadline is set once, at creation, and never moves. See the note
    // in middleware/auth.ts.
    if (row.is_guest && row.guest_expires_at && row.guest_expires_at.getTime() <= Date.now()) {
        return {
            ok: false, status: 403, reason: 'guest_expired',
            error: 'Your guest session has ended. Claim your character to keep playing.',
        };
    }

    return { ok: true };
}
