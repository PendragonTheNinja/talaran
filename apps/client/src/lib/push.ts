import { apiFetch } from './api'

/**
 * This device's side of push notifications (server services/pushNotify.ts):
 * the service worker that shows them (public/sw.js) and the browser's
 * sign-up for this device. Which kinds a player receives is chosen on the
 * account and applies to every device.
 */

export type PushSupport =
    | 'supported'
    | 'unsupported'      // this browser has no notifications at all
    | 'needs-home-screen' // an iPhone or iPad: only once added to the home screen

function isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function pushSupport(): PushSupport {
    const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (isIos() && !isStandalone()) return 'needs-home-screen'
    return has ? 'supported' : 'unsupported'
}

async function registration(): Promise<ServiceWorkerRegistration> {
    return navigator.serviceWorker.register('/sw.js')
}

/** This device's current sign-up, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
    if (pushSupport() !== 'supported') return null
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    return reg ? reg.pushManager.getSubscription() : null
}

/** The server's key, base64url, as the bytes the browser wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
    const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
    const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(new ArrayBuffer(raw.length))
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
}

/**
 * Ask the browser (its own prompt), sign this device up, and tell the server.
 * Resolves to a sentence for the player when something stops it.
 */
export async function subscribeThisDevice(publicKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
        return { ok: false, error: permission === 'denied'
            ? 'Notifications are blocked for Talaran in this browser. Allow them in the browser\'s site settings, then try again.'
            : 'No notifications without your say-so. Try again when you are ready.' }
    }
    try {
        const reg = await registration()
        await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
        await apiFetch('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) })
        return { ok: true }
    } catch (err) {
        return { ok: false, error: (err as { message?: string }).message || 'This device would not sign up.' }
    }
}

/** Stop notifications on this device only. */
export async function unsubscribeThisDevice(): Promise<void> {
    const sub = await currentSubscription()
    if (!sub) return
    await apiFetch('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => { })
    await sub.unsubscribe().catch(() => { })
}
