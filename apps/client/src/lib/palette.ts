// Custom palette engine (Support Us C2). A palette is a map of the 27 color
// tokens below to hex values — nothing structural is expressible, so a
// palette can recolor Talaran but never break it. Shadows and overlays are
// derived here from background luminance rather than stored.

export const PALETTE_TOKENS = [
    'bg-deepest', 'bg-deep', 'bg-dark', 'bg-mid', 'bg-panel', 'bg-raised', 'bg-hover',
    'gold-dim', 'gold', 'gold-bright', 'gold-shine',
    'red-dark', 'red', 'red-bright', 'red-glow',
    'text-dim', 'text-muted', 'text-base', 'text-bright', 'text-white',
    'border-dark', 'border-mid', 'border-gold', 'border-bright',
    'health', 'mana', 'xp',
] as const

export type PaletteTokens = Record<string, string>

export const TOKEN_GROUPS: { title: string; tokens: string[] }[] = [
    { title: 'Backgrounds', tokens: ['bg-deepest', 'bg-deep', 'bg-dark', 'bg-mid', 'bg-panel', 'bg-raised', 'bg-hover'] },
    { title: 'Accent', tokens: ['gold-dim', 'gold', 'gold-bright', 'gold-shine'] },
    { title: 'Danger', tokens: ['red-dark', 'red', 'red-bright', 'red-glow'] },
    { title: 'Text', tokens: ['text-dim', 'text-muted', 'text-base', 'text-bright', 'text-white'] },
    { title: 'Borders', tokens: ['border-dark', 'border-mid', 'border-gold', 'border-bright'] },
    { title: 'Bars', tokens: ['health', 'mana', 'xp'] },
]

// --- Color math -------------------------------------------------------------

function hexToHsl(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h = 0
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
    return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360 / 360
    s = Math.min(1, Math.max(0, s))
    l = Math.min(1, Math.max(0, l))
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
    }
    let r: number, g: number, b: number
    if (s === 0) { r = g = b = l }
    else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const p = 2 * l - q
        r = hue2rgb(p, q, h + 1 / 3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1 / 3)
    }
    const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
    return `#${to(r)}${to(g)}${to(b)}`
}

export function luminance(hex: string): number {
    return hexToHsl(hex)[2]
}

// --- Generation: three seeds -> full coherent palette ----------------------
// bg seed = the page's deepest color; accent = the "gold" family hue;
// ink = the main text color. Ramps go the right direction automatically:
// dark palettes elevate lighter, light palettes elevate lighter still
// (paper) with a darker page behind — matching Tavern/Scriptorium behavior.

export function generatePalette(bgSeed: string, accentSeed: string, inkSeed: string): PaletteTokens {
    const [bh, bs, bl] = hexToHsl(bgSeed)
    const [ah, as_, al] = hexToHsl(accentSeed)
    const [ih, is_, il] = hexToHsl(inkSeed)
    const dark = bl < 0.5

    const step = dark ? 1 : 1            // elevation always heads lighter
    const bgStep = (n: number) => hslToHex(bh, bs, bl + step * n * (dark ? 0.035 : 0.03))

    const p: PaletteTokens = {
        'bg-deepest': hslToHex(bh, bs, bl),
        'bg-deep': bgStep(1),
        'bg-dark': bgStep(2),
        'bg-mid': bgStep(3),
        'bg-panel': bgStep(4),
        'bg-raised': bgStep(5),
        'bg-hover': dark ? hslToHex(bh, Math.min(1, bs * 1.3), bl + 0.16) : hslToHex(bh, Math.min(1, bs * 1.2), bl - 0.06),

        'gold-dim': hslToHex(ah, as_ * 0.6, dark ? al * 0.75 : Math.min(0.62, al + 0.12)),
        'gold': hslToHex(ah, as_, al),
        'gold-bright': hslToHex(ah, as_, dark ? Math.min(0.85, al + 0.14) : Math.max(0.2, al - 0.1)),
        'gold-shine': hslToHex(ah, as_, dark ? Math.min(0.92, al + 0.26) : Math.max(0.3, al + 0.08)),

        'red-dark': hslToHex(4, 0.62, dark ? 0.26 : 0.36),
        'red': hslToHex(4, 0.64, dark ? 0.36 : 0.34),
        'red-bright': hslToHex(6, 0.66, dark ? 0.46 : 0.4),
        'red-glow': hslToHex(8, 0.7, dark ? 0.54 : 0.46),

        'text-dim': hslToHex(ih, is_ * 0.5, dark ? il * 0.55 : Math.min(0.6, il + 0.28)),
        'text-muted': hslToHex(ih, is_ * 0.7, dark ? il * 0.72 : Math.min(0.5, il + 0.16)),
        'text-base': hslToHex(ih, is_, il),
        'text-bright': hslToHex(ih, is_, dark ? Math.min(0.94, il + 0.12) : Math.max(0.08, il - 0.08)),
        'text-white': hslToHex(ih, is_ * 0.8, dark ? 0.97 : Math.max(0.04, il - 0.14)),

        'border-dark': dark ? bgStep(3) : hslToHex(bh, bs * 0.9, bl - 0.1),
        'border-mid': dark ? hslToHex(bh, bs, bl + 0.22) : hslToHex(bh, bs * 0.95, bl - 0.22),
        'border-gold': hslToHex(ah, as_ * 0.8, dark ? al * 0.85 : Math.max(0.24, al - 0.06)),
        'border-bright': hslToHex(ah, as_, al),

        'health': dark ? '#c0392b' : '#a02c22',
        'mana': dark ? '#6a5acd' : '#7448b0',
        'xp': dark ? '#4caf50' : '#1f8b4c',
    }
    return p
}

/** Palettes of the built-in themes, as generation starting points. */
export const BUILTIN_PALETTES: Record<string, PaletteTokens> = {
    tavern: {
        'bg-deepest': '#0d0a07', 'bg-deep': '#13100c', 'bg-dark': '#1a1611', 'bg-mid': '#221c15',
        'bg-panel': '#2a2118', 'bg-raised': '#332a1e', 'bg-hover': '#3d3020',
        'gold-dim': '#8a6d3b', 'gold': '#c8922a', 'gold-bright': '#e8b84b', 'gold-shine': '#ffd97a',
        'red-dark': '#6e1e14', 'red': '#8e2a1c', 'red-bright': '#b03a26', 'red-glow': '#c0392b',
        'text-dim': '#6b5a42', 'text-muted': '#9a8060', 'text-base': '#c9b896', 'text-bright': '#e8d5a3', 'text-white': '#f5ecd7',
        'border-dark': '#2a2118', 'border-mid': '#4a3820', 'border-gold': '#6e5626', 'border-bright': '#c8922a',
        'health': '#c0392b', 'mana': '#6a5acd', 'xp': '#4caf50',
    },
    scriptorium: {
        'bg-deepest': '#d2c29a', 'bg-deep': '#e0d3b2', 'bg-dark': '#e6dabc', 'bg-mid': '#ebe1c6',
        'bg-panel': '#f1e8d2', 'bg-raised': '#f6efdd', 'bg-hover': '#e4d3a8',
        'gold-dim': '#ab8f55', 'gold': '#926c17', 'gold-bright': '#7c5a0e', 'gold-shine': '#a87f1e',
        'red-dark': '#9c3a32', 'red': '#8f2a24', 'red-bright': '#a83226', 'red-glow': '#c0392b',
        'text-dim': '#8a795c', 'text-muted': '#6f5d40', 'text-base': '#3d2f1c', 'text-bright': '#2a1f10', 'text-white': '#1c1408',
        'border-dark': '#b8a678', 'border-mid': '#94804a', 'border-gold': '#8a6a28', 'border-bright': '#6f5310',
        'health': '#a02c22', 'mana': '#7448b0', 'xp': '#1f8b4c',
    },
}

// --- Application ------------------------------------------------------------

const PALETTE_STORAGE_KEY = 'talaran-palette'

/** Apply palette tokens live. Derives shadows/overlays from bg luminance. */
export function applyPaletteTokens(tokens: PaletteTokens, remember: { id: number; name: string } | null) {
    const el = document.documentElement
    el.dataset.theme = 'custom'
    for (const [key, value] of Object.entries(tokens)) {
        el.style.setProperty(`--color-${key}`, value)
    }
    const dark = luminance(tokens['bg-deepest'] ?? '#0d0a07') < 0.5
    const shadowBase = dark ? '0, 0, 0' : '61, 47, 28'
    const alpha = dark ? [0.5, 0.7, 0.9] : [0.18, 0.22, 0.3]
    el.style.setProperty('--shadow-sm', `0 1px 3px rgba(${shadowBase}, ${alpha[0]})`)
    el.style.setProperty('--shadow-md', `0 2px 8px rgba(${shadowBase}, ${alpha[1]})`)
    el.style.setProperty('--shadow-lg', `0 4px 16px rgba(${shadowBase}, ${alpha[2]})`)
    el.style.setProperty('--color-overlay', dark ? 'rgba(0, 0, 0, 0.4)' : `rgba(${shadowBase}, 0.14)`)
    el.style.setProperty('--color-overlay-soft', dark ? 'rgba(0, 0, 0, 0.3)' : `rgba(${shadowBase}, 0.08)`)
    const gold = tokens['gold'] ?? '#c8922a'
    el.style.setProperty('--shadow-gold', `0 0 8px ${gold}55`)

    if (remember) {
        try {
            localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify({ ...remember, tokens }))
            localStorage.setItem('talaran-theme', `palette:${remember.id}`)
        } catch { /* private mode */ }
    }
}

/** Remove inline palette styling (returning control to CSS theme blocks). */
export function clearPaletteTokens() {
    const el = document.documentElement
    for (const key of PALETTE_TOKENS) el.style.removeProperty(`--color-${key}`)
    for (const extra of ['--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-gold', '--color-overlay', '--color-overlay-soft']) {
        el.style.removeProperty(extra)
    }
    try { localStorage.removeItem(PALETTE_STORAGE_KEY) } catch { /* private mode */ }
}

/** Boot-time restore of a locally remembered palette (no flash). */
export function initPaletteFromStorage(): boolean {
    try {
        const stored = localStorage.getItem('talaran-theme')
        if (!stored?.startsWith('palette:')) return false
        const cached = localStorage.getItem(PALETTE_STORAGE_KEY)
        if (!cached) return false
        const parsed = JSON.parse(cached)
        if (parsed?.tokens) {
            applyPaletteTokens(parsed.tokens, null)
            return true
        }
    } catch { /* fall through */ }
    return false
}
