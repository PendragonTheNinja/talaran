import webpush from 'web-push';
import db from '../db';
import { logger } from '../lib/logger';
import { onPlayerPush } from '../lib/realtime';
import { gameOnScreen } from '../lib/pageVisibility';

// ── Push notifications ────────────────────────────────────────────────────────
//
// The game reaching a player's phone or desktop when it needs them and they
// are not looking: the screen is off, the browser is closed, or (on a PC) the
// game tab is behind another one (lib/pageVisibility.ts).
//
// Nothing that runs the game knows about this. Every moment worth a
// notification is already pushed to the player's socket (a bot check, an
// action stopping); this listens to those pushes (lib/realtime.ts onPlayerPush)
// and turns the ones the player chose into a notification. An "action stopped"
// carries the server's own sentence for why, so each kind of work already
// reads differently ("Your hearth has gone cold...").
//
// Keys: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or
// https: address) in .env. Without them notifications are simply off, and
// Settings says so. Generate a pair once with `npx web-push generate-vapid-keys`.

export interface PushType {
    key: string
    label: string
    description: string
    /** On for a player who has never changed their choices. */
    byDefault: boolean
}

/** The kinds of notification, in the order Settings lists them. */
export const PUSH_TYPES: PushType[] = [
    { key: 'bot_check', label: 'Bot checks', description: 'A bot check is waiting and your work has paused.', byDefault: true },
    { key: 'action_stopped', label: 'Work stopped', description: 'Your action stopped and needs you: out of materials, a full pack, a cold hearth, a fight ended.', byDefault: true },
    { key: 'journey', label: 'Journey\'s end', description: 'You have arrived where you were going.', byDefault: false },
    { key: 'stone_full', label: 'A stone is full', description: 'A gem filling at the Rift is full of light.', byDefault: false },
    { key: 'trap', label: 'Traps', description: 'Something is caught in one of your traps. Only while you are at the place the trap is set.', byDefault: false },
    { key: 'whisper', label: 'Whispers', description: 'Someone whispers to you.', byDefault: false },
    { key: 'guild_request', label: 'Storehouse requests', description: 'A request you made from your guild storehouse was approved and is waiting for you.', byDefault: false },
];

export const DEFAULT_PUSH_TYPES = PUSH_TYPES.filter(t => t.byDefault).map(t => t.key);
const KNOWN = new Set(PUSH_TYPES.map(t => t.key));

/** A notification about to be sent. `tag` makes a newer one replace an older one of its kind. */
export interface Notice {
    type: string
    title: string
    body: string
    tag: string
    /** Only send while the player stands here (traps: Nathan, 2026-11-02). */
    atLocation?: number
}

const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
const subject = process.env.VAPID_SUBJECT ?? '';
let configured = false;

/** The key browsers sign up with, or null while notifications are off. */
export function pushPublicKey(): string | null {
    return configured ? publicKey : null;
}

/** A player's chosen types, read from player_settings (null there means the defaults). */
export async function pushTypesFor(playerId: number): Promise<string[]> {
    const row = await db('player_settings').where({ player_id: playerId }).first('push_types');
    const raw = row?.push_types;
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? safeParse(raw) : null;
    return list ? list.filter((k: unknown): k is string => typeof k === 'string' && KNOWN.has(k)) : DEFAULT_PUSH_TYPES;
}

function safeParse(s: string): unknown[] | null {
    try { const v = JSON.parse(s); return Array.isArray(v) ? v : null } catch { return null }
}

export async function setPushTypes(playerId: number, types: string[]): Promise<string[]> {
    const clean = [...new Set(types.filter(k => KNOWN.has(k)))];
    await db('player_settings')
        .insert({ player_id: playerId, push_types: JSON.stringify(clean) })
        .onConflict('player_id')
        .merge({ push_types: JSON.stringify(clean) });
    return clean;
}

/** One sentence, never more than a notification shows comfortably. */
function clip(text: string, max = 160): string {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * Which socket pushes become which notifications. Everything else is ignored.
 * The words are the server's own where it already has them.
 */
export function noticeFor(event: string, payload: any): Notice | null {
    switch (event) {
        case 'bot_check_required':
            return { type: 'bot_check', title: 'Talaran', body: 'A bot check is waiting. Your work is paused until you answer it.', tag: 'bot-check' };
        case 'action_failed':
            return { type: 'action_stopped', title: 'Talaran', body: clip(payload?.error || 'Your work has stopped.'), tag: 'action-stopped' };
        case 'action_limit_reached':
            return { type: 'action_stopped', title: 'Talaran', body: clip(payload?.message || 'You have done as many as you asked.'), tag: 'action-stopped' };
        case 'travel_complete': {
            const where = payload?.result?.destination;
            return { type: 'journey', title: 'Talaran', body: where ? `You have arrived at ${where}.` : 'You have arrived.', tag: 'journey' };
        }
        case 'action_complete': {
            const name = payload?.result?.itemName;
            if (payload?.actionType !== 'talar_fill' || !name) return null;
            return { type: 'stone_full', title: 'Talaran', body: `Your stone is full of light: one ${name}.`, tag: 'stone-full' };
        }
        case 'guild_request_approved':
            return { type: 'guild_request', title: 'Talaran', body: 'Your request from the guild storehouse was approved. It is set aside for you at the hall.', tag: 'guild-request' };
        case 'trap_sprung':
            return { type: 'trap', title: 'Talaran', body: 'Something is caught in one of your traps.', tag: 'trap', atLocation: Number(payload?.locationId) || undefined };
        case 'whisper': {
            const from = payload?.from;
            return from ? { type: 'whisper', title: `${from} whispers`, body: clip(payload?.message ?? ''), tag: `whisper-${from}` } : null;
        }
        default:
            return null;
    }
}

/** Last send per player and tag, so a burst of the same thing is one notification. */
const lastSent = new Map<string, number>();
const SAME_TAG_GAP_MS = 30_000;

/**
 * Send to every device the player signed up. Removes devices the push service
 * says are gone (404, 410). `force` skips the on-screen and repeat checks: the
 * Settings test button.
 */
export async function sendNotice(playerId: number, notice: Notice, force = false): Promise<{ sent: number; devices: number }> {
    if (!configured) return { sent: 0, devices: 0 };
    if (!force) {
        if (gameOnScreen(playerId)) return { sent: 0, devices: 0 };
        const key = `${playerId}:${notice.tag}`;
        const now = Date.now();
        if (now - (lastSent.get(key) ?? 0) < SAME_TAG_GAP_MS) return { sent: 0, devices: 0 };
        if (!(await pushTypesFor(playerId)).includes(notice.type)) return { sent: 0, devices: 0 };
        if (notice.atLocation) {
            const here = await db('players').where({ id: playerId }).first('current_location_id');
            if (Number(here?.current_location_id) !== notice.atLocation) return { sent: 0, devices: 0 };
        }
        lastSent.set(key, now);
    }

    const subs = await db('push_subscriptions').where({ player_id: playerId });
    const body = JSON.stringify({ title: notice.title, body: notice.body, tag: notice.tag, url: '/' });
    let sent = 0;
    await Promise.all(subs.map(async (s: any) => {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                body,
                // An hour to live: a bot check from yesterday is no use to anyone.
                // topic: the push service replaces an undelivered one of the same kind.
                { TTL: 3600, urgency: 'high', topic: notice.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'talaran' },
            );
            sent++;
            await db('push_subscriptions').where({ id: s.id }).update({ last_sent_at: db.fn.now() });
        } catch (err: any) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
                await db('push_subscriptions').where({ id: s.id }).delete();
                logger.info(`push: removed a device player ${playerId} no longer has`);
            } else {
                logger.warn(`push: send to player ${playerId} failed (${err?.statusCode ?? ''} ${err?.message ?? err})`);
            }
        }
    }));
    return { sent, devices: subs.length };
}

/** Called once at boot from index.ts. Turns itself off without keys. */
export function startPushNotifications(): void {
    if (!publicKey || !privateKey || !subject) {
        logger.info('push: VAPID keys not set; push notifications are off');
        return;
    }
    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
    } catch (err) {
        logger.error(`push: VAPID keys rejected (${(err as Error).message}); push notifications are off`);
        return;
    }
    configured = true;
    onPlayerPush((playerId, event, payload) => {
        const notice = noticeFor(event, payload);
        if (!notice) return;
        sendNotice(playerId, notice).catch(err => logger.warn(`push: ${err}`));
    });
    logger.info('push: notifications on');
}
