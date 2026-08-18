import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

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

// General API limit — 200 requests per minute
export const generalLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth limit — 10 attempts per 15 minutes
export const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat send limit — 30 messages per minute
export const chatLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'You are sending messages too quickly.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat history read limit — generous, just for history fetching
export const chatReadLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: 'Too many requests.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Forum limit — 10 posts per minute
export const forumLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
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
