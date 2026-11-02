/**
 * Chat text size, chosen per device (Nathan, 2026-11-02): the same player
 * often wants larger text on a phone than at a desk, so it lives in this
 * browser's storage, not on the account.
 *
 * Five steps, one smaller than today's and three larger, each a pixel on the
 * message text (15px at Normal). Capped on purpose: past the largest step the
 * fixed-height chat box shows too few lines to follow a conversation.
 * ChatPanel.css multiplies every message size by --chat-scale.
 */

export const CHAT_SIZES = [
    { id: 'small', label: 'Small', px: 14 },
    { id: 'normal', label: 'Normal', px: 15 },
    { id: 'large', label: 'Large', px: 16 },
    { id: 'larger', label: 'Larger', px: 17 },
    { id: 'largest', label: 'Largest', px: 18 },
] as const

export type ChatSizeId = typeof CHAT_SIZES[number]['id']

const STORAGE_KEY = 'talaran-chat-size'
const BASE_PX = 15

function apply(id: ChatSizeId) {
    const step = CHAT_SIZES.find(s => s.id === id) ?? CHAT_SIZES[1]
    document.documentElement.style.setProperty('--chat-scale', String(step.px / BASE_PX))
}

export function currentChatSize(): ChatSizeId {
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved && CHAT_SIZES.some(s => s.id === saved)) return saved as ChatSizeId
    } catch { /* private mode */ }
    return 'normal'
}

export function setChatSize(id: ChatSizeId) {
    apply(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* private mode: applies for this visit */ }
}

export function initChatSize() {
    apply(currentChatSize())
}
