import { apiUrl } from './api'

// Player avatars (services/avatars.ts on the server). The stored URL is a
// server path (/api/avatars/…); anything else (an older absolute URL) is used
// as it is.

/** The most the server accepts for an upload, checked here first so a big file fails fast. */
export const AVATAR_MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function avatarSrc(url: string | null | undefined): string | null {
    if (!url) return null
    return url.startsWith('/api/') ? apiUrl(url) : url
}

/** Fired when your own picture changes, so every place showing it can update. */
export const AVATAR_CHANGED = 'talaran:avatar-changed'

export function announceAvatar(url: string | null) {
    window.dispatchEvent(new CustomEvent<string | null>(AVATAR_CHANGED, { detail: url }))
}

/** Open Settings at a tab (GameLayout listens). */
export function openSettings(tab?: string) {
    window.dispatchEvent(new CustomEvent<{ tab?: string }>('talaran:open-settings', { detail: { tab } }))
}
