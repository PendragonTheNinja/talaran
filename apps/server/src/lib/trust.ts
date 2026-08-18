import { Response, NextFunction } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';

// One predicate for "may this account touch other people's stuff?"
//
// A guest and an unverified account get the same answer, so they get the same
// check. Writing it once here means the enforcement points below never have to
// be revisited when email verification is switched on: today every existing
// account is backfilled verified, so the second clause is inert, and the day
// verification starts issuing NULLs it begins biting everywhere at once.
//
// What this gates is deliberately narrow. It is not "may this account play" —
// guests skill, travel, gather, craft and fight exactly like anyone else, and
// blocking that would defeat the entire point of a trial. It gates the paths
// where an account can move value to another account or broadcast to everyone:
// trading, the marketplace, player shops, dropping items, private messages,
// forum posts, world chat, and anything involving real money.

// Verification enforcement is behind a flag, and it has to be.
//
// The migration backfills every existing account as verified, but any account
// created *after* it gets NULL. With the verification half of the predicate
// live before the verify endpoint exists, every new registration would be
// permanently untrusted with no way out. So this stays false until step 3
// ships the token, the email and the endpoint, and it doubles afterwards as a
// kill switch if the mail provider goes down.
export const ENFORCE_EMAIL_VERIFICATION =
    process.env.ENFORCE_EMAIL_VERIFICATION === 'true';

export interface TrustState {
    isGuest: boolean;
    emailVerified: boolean;
    trusted: boolean;
    guestExpiresAt: Date | null;
}

export interface PlayerTrustRow {
    is_guest?: boolean | null;
    email_verified_at?: Date | string | null;
    guest_expires_at?: Date | string | null;
}

export function trustOf(player: PlayerTrustRow | undefined | null): TrustState {
    const isGuest = !!player?.is_guest;
    const emailVerified = !!player?.email_verified_at;
    return {
        isGuest,
        emailVerified,
        trusted: !isGuest && (!ENFORCE_EMAIL_VERIFICATION || emailVerified),
        guestExpiresAt: player?.guest_expires_at ? new Date(player.guest_expires_at) : null,
    };
}

/** True once a guest session is past its deadline. Real accounts never expire. */
export function isExpiredGuest(player: PlayerTrustRow | undefined | null): boolean {
    if (!player?.is_guest || !player.guest_expires_at) return false;
    return new Date(player.guest_expires_at).getTime() <= Date.now();
}

export async function loadTrust(playerId: number): Promise<TrustState> {
    const row = await db('players')
        .select('is_guest', 'email_verified_at', 'guest_expires_at')
        .where({ id: playerId })
        .first();
    return trustOf(row);
}

// Distinct messages per reason. "You cannot do that" tells a guest nothing
// about how to fix it, and the fix is different in each case: one upgrades,
// the other checks their inbox.
const GUEST_MESSAGE =
    'Guest accounts cannot do this. Claim your character to unlock trading, shops, and the forums.';
const UNVERIFIED_MESSAGE =
    'Verify your email address to unlock trading, shops, and the forums.';

/**
 * Blocks guests and unverified accounts. Assumes requireAuth has already run.
 * Responds 403 with a `reason` the client can branch on to show either the
 * upgrade panel or a resend-verification prompt.
 */
export async function requireTrusted(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const playerId = req.player?.playerId;
    if (!playerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const trust = await loadTrust(playerId);
        if (trust.trusted) {
            next();
            return;
        }
        res.status(403).json({
            error: trust.isGuest ? GUEST_MESSAGE : UNVERIFIED_MESSAGE,
            reason: trust.isGuest ? 'guest' : 'unverified',
        });
    } catch {
        // Fail closed. A database hiccup must not hand an ungated path to an
        // account that has not earned it.
        res.status(503).json({ error: 'Could not verify account status. Try again shortly.' });
    }
}

/** Guest-only block, for paths an unverified real account may still use. */
export async function blockGuests(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const playerId = req.player?.playerId;
    if (!playerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const trust = await loadTrust(playerId);
        if (!trust.isGuest) {
            next();
            return;
        }
        res.status(403).json({ error: GUEST_MESSAGE, reason: 'guest' });
    } catch {
        res.status(503).json({ error: 'Could not verify account status. Try again shortly.' });
    }
}
