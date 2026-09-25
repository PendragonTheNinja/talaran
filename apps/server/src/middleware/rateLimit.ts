import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';
import { verifyToken } from '../config/jwt';

// Behind Cloudflare, req.ip depends on the trust-proxy hop count being right.
// CF-Connecting-IP is set by the edge on every request and is the one value
// that is definitively the visitor, so it wins where present. ipKeyGenerator
// normalises IPv6 to a /56, otherwise a single client can walk through a whole
// subnet's worth of limits one address at a time.
function clientKey(req: Request): string {
    const cf = req.headers['cf-connecting-ip'];
    const ip = (Array.isArray(cf) ? cf[0] : cf) || req.ip || 'unknown';
    return ipKeyGenerator(ip);
}

/**
 * Key a logged-in player by their id, falling back to the client address only
 * when there is no usable token.
 *
 * Keying gameplay by address is wrong twice over. A household, campus or office
 * shares one bucket, so one active player throttles everyone beside them. And
 * if the trust-proxy hop count is ever off, req.ip becomes Cloudflare's edge
 * address and the entire playerbase shares a single allowance, which is the
 * likeliest reason the limit was so easy to trip.
 *
 * The token is VERIFIED, not just decoded (audit H8). This used to decode
 * without checking the signature, on the reasoning that a forged token only
 * picks a different bucket. The bucket it picks is the victim's: anyone could
 * mint { playerId: <victim> }, spend that player's allowance from their own
 * machine, and the victim would get 429 on every request while it lasted.
 * Verification is one HMAC over a few hundred bytes, microseconds per request.
 *
 * A token that fails (forged, expired, malformed) is keyed by the sender's
 * address, so the sender spends their own allowance and nobody else's. The
 * route behind still does full authentication, session version included; this
 * only decides whose budget a request comes out of.
 */
function playerKey(req: Request): string {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
        try {
            const { playerId } = verifyToken(auth.slice(7));
            if (Number.isInteger(playerId) && playerId > 0) return `player:${playerId}`;
        } catch {
            // Not a token we signed, or no longer valid: the address pays.
        }
    }
    return clientKey(req);
}

/**
 * General API limit.
 *
 * Raised from 200 because one click fans out into several calls: starting an
 * action also refreshes inventory, location, skills and player state. Someone
 * moving briskly through the UI could hit 200/min without doing anything
 * unusual, and then wore a full minute of lockout for it.
 */
export const generalLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    keyGenerator: playerKey,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth limit, 10 attempts per 15 minutes. Address-keyed on purpose: there is
// no trustworthy player id before a successful login.
export const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: clientKey,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat send limit — 30 messages per minute
export const chatLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: playerKey,
    message: { error: 'You are sending messages too quickly.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat history read limit — generous, just for history fetching
export const chatReadLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    keyGenerator: playerKey,
    message: { error: 'Too many requests.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Forum limit — 10 posts per minute
export const forumLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: playerKey,
    message: { error: 'You are posting too quickly.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Guest creation — 5 per hour per client.
//
// This is unauthenticated account creation: every call writes a players row
// plus a full set of skills, stats and starter items. The general auth limit
// already covers it, but sharing a budget with login means a few guest
// sessions could lock someone out of signing in, and the two deserve separate
// allowances. Five is well clear of anyone legitimately trying the game,
// including several people behind one office or campus address.
export const guestLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: clientKey,
    message: { error: 'Too many guest sessions started from here. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
