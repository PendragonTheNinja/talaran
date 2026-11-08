/**
 * Which chat channel opens when the page loads (Nathan, 2026-11-08): a
 * setting, and by default the channel you were last in. Kept on this device,
 * like the text size (lib/chatSize.ts), so a phone and a computer can differ.
 */

export const CHAT_START_CHOICES = [
    { id: 'last', label: 'Where I left off' },
    { id: 'world', label: 'World' },
    { id: 'region', label: 'Region' },
    { id: 'guild', label: 'Guild' },
    { id: 'trade', label: 'Trade' },
    { id: 'help', label: 'Help' },
] as const

export type ChatStartId = typeof CHAT_START_CHOICES[number]['id']

const START_KEY = 'talaran-chat-start'
const LAST_KEY = 'talaran-chat-last'
const CHANNELS = new Set(['world', 'region', 'guild', 'trade', 'help'])

function read(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* private mode: lasts this visit */ }
}

export function chatStartChoice(): ChatStartId {
    const saved = read(START_KEY)
    return CHAT_START_CHOICES.some(c => c.id === saved) ? saved as ChatStartId : 'last'
}

export function setChatStartChoice(id: ChatStartId) {
    write(START_KEY, id)
}

/** Remember the channel just opened, for "Where I left off". */
export function rememberChatChannel(channel: string) {
    if (CHANNELS.has(channel)) write(LAST_KEY, channel)
}

/** The channel chat should open on now. Guests only ever have Help. */
export function startingChatChannel(isGuest: boolean): string {
    if (isGuest) return 'help'
    const choice = chatStartChoice()
    if (choice !== 'last') return choice
    const last = read(LAST_KEY)
    return last && CHANNELS.has(last) ? last : 'world'
}
