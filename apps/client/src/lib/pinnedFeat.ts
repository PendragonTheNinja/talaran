import { useEffect, useState } from 'react'

/**
 * The one feat a player keeps on screen (Nathan, 2026-11-22), and where its
 * window sits. Kept on this device, like the chat size: a phone and a desk
 * can want it in different places, or not at all.
 */

const SLUG_KEY = 'talaran-pinned-feat'
const BOX_KEY = 'talaran-pinned-feat-box'
const EVENT = 'talaran:feat-pinned'

export interface PinBox { x: number; y: number; width: number; height: number }

function read(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string | null) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* private mode: this visit only */ }
}

let slug: string | null = read(SLUG_KEY)

export function pinnedFeat(): string | null { return slug }

export function setPinnedFeat(next: string | null) {
    slug = next
    write(SLUG_KEY, next)
    window.dispatchEvent(new CustomEvent(EVENT))
}

/** The pinned feat's slug, following every change. */
export function usePinnedFeat(): string | null {
    const [value, setValue] = useState<string | null>(slug)
    useEffect(() => {
        const on = () => setValue(slug)
        window.addEventListener(EVENT, on)
        return () => window.removeEventListener(EVENT, on)
    }, [])
    return value
}

export function pinBox(fallback: PinBox): PinBox {
    try {
        const v = JSON.parse(read(BOX_KEY) ?? 'null')
        if (v && [v.x, v.y, v.width, v.height].every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) return v
    } catch { /* fall through */ }
    return fallback
}

export function savePinBox(box: PinBox) { write(BOX_KEY, JSON.stringify(box)) }
