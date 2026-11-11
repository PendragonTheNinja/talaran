import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { PUSH_TYPES, pushPublicKey, pushTypesFor, sendNotice, setPushTypes } from '../services/pushNotify';
import { SERVER_ERROR } from '../lib/serviceResult';

// Push notifications (services/pushNotify.ts): Settings > Game signs devices
// up here and chooses which kinds of notification to receive.

const router = Router();

// GET /api/push - the key to sign up with (null while notifications are off),
// every type with whether this player has it on, and how many devices they have.
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    try {
        const [chosen, devices] = await Promise.all([
            pushTypesFor(playerId),
            db('push_subscriptions').where({ player_id: playerId }).count<{ n: string }[]>('id as n'),
        ]);
        res.json({
            publicKey: pushPublicKey(),
            types: PUSH_TYPES.map(t => ({ key: t.key, label: t.label, description: t.description, on: chosen.includes(t.key) })),
            devices: Number(devices[0]?.n ?? 0),
        });
    } catch (err) {
        logger.error(`push config error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

/**
 * The push services browsers deliver through. A sign-up naming any other host
 * is refused: the server posts to every endpoint a player registers whenever
 * one of their notices fires, so an open list let a player make it send
 * requests to any HTTPS address they liked, as many as they registered
 * (audit 2026-11-09, B10).
 */
const PUSH_HOSTS = [
    'fcm.googleapis.com',               // Chrome, Edge, Android
    'updates.push.services.mozilla.com', // Firefox
    'web.push.apple.com',               // Safari
]
const PUSH_HOST_SUFFIXES = ['.notify.windows.com', '.push.apple.com']

function isPushService(endpoint: string): boolean {
    let url: URL;
    try { url = new URL(endpoint); } catch { return false; }
    if (url.protocol !== 'https:' || url.port) return false;
    const host = url.hostname.toLowerCase();
    return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some(s => host.endsWith(s));
}

/** Devices kept per player; signing up one more drops the oldest. */
const MAX_DEVICES = 5;

/** The browser's PushSubscription, as JSON. Only the parts a send needs, checked. */
function readSubscription(body: any): { endpoint: string; p256dh: string; auth: string } | null {
    const s = body?.subscription;
    const endpoint = s?.endpoint, p256dh = s?.keys?.p256dh, auth = s?.keys?.auth;
    if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') return null;
    if (endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100) return null;
    if (!isPushService(endpoint)) return null;
    return { endpoint, p256dh, auth };
}

// POST /api/push/subscribe   { subscription } - this device says yes. A device
// already on file moves to whoever signed it up last (a shared computer).
router.post('/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    if (!pushPublicKey()) { res.status(400).json({ error: 'Notifications are not switched on for the game yet.' }); return; }
    const sub = readSubscription(req.body);
    if (!sub) { res.status(400).json({ error: 'That device did not send a usable sign-up.' }); return; }
    try {
        const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 300) || null;
        await db('push_subscriptions')
            .insert({ player_id: playerId, ...sub, user_agent: userAgent })
            .onConflict('endpoint')
            .merge({ player_id: playerId, p256dh: sub.p256dh, auth: sub.auth, user_agent: userAgent });
        // Keep the newest MAX_DEVICES; a browser that re-subscribes reuses its row.
        const keep = await db('push_subscriptions').where({ player_id: playerId })
            .orderBy('id', 'desc').limit(MAX_DEVICES).pluck('id');
        await db('push_subscriptions').where({ player_id: playerId }).whereNotIn('id', keep).delete();
        res.json({ success: true });
    } catch (err) {
        logger.error(`push subscribe error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

// POST /api/push/unsubscribe   { endpoint } - this device says no more.
router.post('/unsubscribe', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string') { res.status(400).json({ error: 'Which device?' }); return; }
    try {
        await db('push_subscriptions').where({ player_id: playerId, endpoint }).delete();
        res.json({ success: true });
    } catch (err) {
        logger.error(`push unsubscribe error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

// PUT /api/push/types   { types: string[] } - which kinds to receive, on every device.
router.put('/types', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    const types = req.body?.types;
    if (!Array.isArray(types) || types.some(t => typeof t !== 'string')) { res.status(400).json({ error: 'Choose from the list.' }); return; }
    try {
        res.json({ types: await setPushTypes(playerId, types) });
    } catch (err) {
        logger.error(`push types error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

// POST /api/push/test - one notification to every device this player signed up,
// even with the game on screen, so they can see what one looks like.
const lastTest = new Map<number, number>();
router.post('/test', requireAuth, async (req: AuthRequest, res: Response) => {
    const playerId = req.player!.playerId;
    if (!pushPublicKey()) { res.status(400).json({ error: 'Notifications are not switched on for the game yet.' }); return; }
    if (Date.now() - (lastTest.get(playerId) ?? 0) < 10_000) { res.status(429).json({ error: 'Give it a moment.' }); return; }
    lastTest.set(playerId, Date.now());
    try {
        const r = await sendNotice(playerId, { type: 'test', title: 'Talaran', body: 'This is how the game will call you back.', tag: 'test' }, true);
        res.json(r);
    } catch (err) {
        logger.error(`push test error: ${err}`);
        res.status(500).json({ error: SERVER_ERROR });
    }
});

export default router;
