import { useCallback, useState } from 'react'

// Drafts: whatever a player is typing survives closing the window.
//
// Players lost long forum posts by backing out of the Forum a moment too soon,
// and a news post is no different. Every editor that holds writing keeps it
// here as it is typed, under a key naming exactly what is being written
// ("forum:reply:42", "messages:compose:body"), so reopening the same editor
// finds the text waiting. A draft is cleared when it is sent, and forgotten
// after DRAFT_DAYS untouched.
//
// Drafts belong to the account that wrote them: two players sharing a browser
// never see each other's.

const PREFIX = 'talaran:draft:'
const DRAFT_DAYS = 7

interface Stored { v: string; t: number }

/** The signed-in player's id, so drafts are kept per account. */
function scope(): string {
    try {
        const p = JSON.parse(localStorage.getItem('talaran_player') || 'null')
        return p?.id ? String(p.id) : 'anon'
    } catch {
        return 'anon'
    }
}

function storageKey(key: string): string {
    return `${PREFIX}${scope()}:${key}`
}

/** The saved draft for this key, or '' when there is none. */
export function readDraft(key: string): string {
    try {
        const raw = localStorage.getItem(storageKey(key))
        if (!raw) return ''
        return (JSON.parse(raw) as Stored).v ?? ''
    } catch {
        return ''
    }
}

/** Save a draft; an empty one is removed rather than stored. */
export function writeDraft(key: string, value: string): void {
    try {
        if (value.trim() === '') localStorage.removeItem(storageKey(key))
        else localStorage.setItem(storageKey(key), JSON.stringify({ v: value, t: Date.now() } satisfies Stored))
    } catch {
        // Storage full or blocked (private browsing): typing still works, it
        // just is not kept.
    }
}

export function clearDraft(key: string): void {
    try { localStorage.removeItem(storageKey(key)) } catch { /* see writeDraft */ }
}

// Forget drafts nobody has touched for DRAFT_DAYS, once per page load.
try {
    const cutoff = Date.now() - DRAFT_DAYS * 24 * 60 * 60 * 1000
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (!k?.startsWith(PREFIX)) continue
        try {
            if ((JSON.parse(localStorage.getItem(k) || '{}') as Stored).t < cutoff) localStorage.removeItem(k)
        } catch {
            localStorage.removeItem(k)
        }
    }
} catch { /* storage unavailable */ }

/**
 * Like useState for a piece of writing, but kept as a draft under `key`.
 * Change the key (another thread, another post) and the value follows it.
 * A null key keeps the text in memory only.
 *
 * Returns [text, setText, clear]: call clear() once the text has been sent.
 */
export function useDraft(key: string | null): [string, (value: string) => void, () => void] {
    // Edits made in this component, by key. Anything not edited here yet is
    // read from storage as the component renders, so no effect is needed to
    // load it when the key changes.
    const [edited, setEdited] = useState<Record<string, string>>({})
    const slot = key ?? '\u0000memory'
    const value = slot in edited ? edited[slot] : key === null ? '' : readDraft(key)

    const set = useCallback((next: string) => {
        setEdited(prev => ({ ...prev, [slot]: next }))
        if (key !== null) writeDraft(key, next)
    }, [key, slot])

    const clear = useCallback(() => {
        setEdited(prev => ({ ...prev, [slot]: '' }))
        if (key !== null) clearDraft(key)
    }, [key, slot])

    return [value, set, clear]
}
