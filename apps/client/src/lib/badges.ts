import { useEffect, useState } from 'react'
import { apiUrl } from './api'

// What each feat badge is (GET /api/feats/badges), fetched once per page load
// and shared by every Badge, so a badge worn in chat, the location list, the
// forum or a profile says what it is on hover. Plain fetch, not apiFetch: the
// list is public and shows on pages a logged-out visitor reads.

export interface BadgeInfo {
    key: string
    name: string
    title: string | null
    description: string
}

let cache: Promise<Map<string, BadgeInfo>> | null = null

function load(): Promise<Map<string, BadgeInfo>> {
    if (!cache) {
        cache = fetch(apiUrl('/api/feats/badges'))
            .then(r => (r.ok ? r.json() : { badges: [] }))
            .then((d: { badges?: BadgeInfo[] }) => new Map((d.badges ?? []).map(b => [b.key, b])))
            .catch(() => {
                cache = null   // try again next time rather than remembering a failure
                return new Map<string, BadgeInfo>()
            })
    }
    return cache
}

/** The hover line for a badge: its title, then the feat that earns it. */
export function badgeHover(info: BadgeInfo): string {
    const feat = `${info.name}: ${info.description}`
    // A title that is the feat's own name (Curator of Taiar) is said once.
    if (!info.title || info.title.toLowerCase() === info.name.toLowerCase()) return feat
    return `${info.title.charAt(0).toUpperCase()}${info.title.slice(1)}. ${feat}`
}

export function useBadgeInfo(key: string | null | undefined): BadgeInfo | null {
    const [info, setInfo] = useState<BadgeInfo | null>(null)
    useEffect(() => {
        if (!key) return
        let live = true
        load().then(m => { if (live) setInfo(m.get(key) ?? null) })
        return () => { live = false }
    }, [key])
    return key ? info : null
}
