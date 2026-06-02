import rateLimit from 'express-rate-limit';

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