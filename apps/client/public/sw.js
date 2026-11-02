/*
 * Talaran's service worker: push notifications only (server
 * services/pushNotify.ts). It caches nothing and never touches page loads.
 *
 * A push carries { title, body, tag, url }. The tag makes a newer notification
 * of the same kind replace the older one instead of stacking. Tapping one
 * brings an open Talaran tab to the front, or opens the game.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
    let data = {}
    try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
    const title = data.title || 'Talaran'
    event.waitUntil(self.registration.showNotification(title, {
        body: data.body || '',
        tag: data.tag || 'talaran',
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { url: data.url || '/' },
    }))
})

self.addEventListener('notificationclick', event => {
    event.notification.close()
    const url = (event.notification.data && event.notification.data.url) || '/'
    event.waitUntil((async () => {
        const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const c of open) {
            if (new URL(c.url).origin === self.location.origin) {
                await c.focus()
                return
            }
        }
        await self.clients.openWindow(url)
    })())
})
