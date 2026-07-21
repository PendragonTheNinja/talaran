import { apiFetch } from './api'
import { applyPaletteTokens, clearPaletteTokens, initPaletteFromStorage, type PaletteTokens } from './palette'

// Talaran themes — Phase A of the Support Us plan (docs/support-spec.md §4).
// A theme is a token set: :root holds Tavern (the original look) and
// index.css defines an override block per additional theme. Applying a theme
// is just setting data-theme on <html>. Premium themes and custom palettes
// (Phase C) build on this same mechanism.

export type ThemeId = 'tavern' | 'scriptorium' | 'moonveil' | 'mosswood' | 'forgeheart'

export interface ThemeMeta {
    id: ThemeId
    name: string
    description: string
    /** Representative swatches for the picker: [page bg, panel, text, accent] */
    swatches: [string, string, string, string]
    /** Premium themes require the 'theme:<id>' unlock, sold in the store */
    premium?: boolean
}

export const THEMES: ThemeMeta[] = [
    {
        id: 'tavern',
        name: 'Tavern',
        description: 'The original look. Firelight, dark timber, and gold — Talaran by night.',
        swatches: ['#0d0a07', '#2a2118', '#e8d5a3', '#c8922a'],
    },
    {
        id: 'scriptorium',
        name: 'Scriptorium',
        description: 'Daylight and parchment. Iron-gall ink on cream pages, leafed in gold.',
        swatches: ['#d8c9a4', '#f2e8d3', '#3d2f1c', '#926c17'],
    },
    {
        id: 'moonveil',
        name: 'Moonveil',
        description: 'Cold slate and silver — Talaran under a winter moon.',
        swatches: ['#0a0c12', '#1f2536', '#d6dff2', '#8fa3c4'],
        premium: true,
    },
    {
        id: 'mosswood',
        name: 'Mosswood',
        description: 'Deep forest greens and lantern amber, far beneath the canopy.',
        swatches: ['#0a0e08', '#202c1a', '#d8e4c8', '#b0a133'],
        premium: true,
    },
    {
        id: 'forgeheart',
        name: 'Forgeheart',
        description: 'Coal-black iron and living ember — the smithy after dark.',
        swatches: ['#0b0a0a', '#241e1d', '#e6dcd4', '#cf5530'],
        premium: true,
    },
]

/** Preview a theme visually WITHOUT saving or remembering it. */
export function previewTheme(id: ThemeId) {
    document.documentElement.dataset.theme = id
}

const STORAGE_KEY = 'talaran-theme'
const DEFAULT_THEME: ThemeId = 'tavern'

function isThemeId(v: unknown): v is ThemeId {
    return THEMES.some(t => t.id === v)
}

/** Apply a theme to the document and remember it locally. */
export function applyTheme(id: ThemeId) {
    clearPaletteTokens()   // built-in themes are pure CSS; drop any inline palette
    document.documentElement.dataset.theme = id
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* private mode */ }
}

/** Apply a saved custom palette as the active theme. */
export function applyPalette(id: number, name: string, tokens: PaletteTokens) {
    applyPaletteTokens(tokens, { id, name })
}

export function currentTheme(): ThemeId {
    const v = document.documentElement.dataset.theme
    return isThemeId(v) ? v : DEFAULT_THEME
}

/** Called before first render: apply the locally remembered theme so there is
 *  no flash of the wrong palette while the app boots. */
export function initTheme() {
    if (initPaletteFromStorage()) return   // cached custom palette, no flash
    let stored: string | null = null
    try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* private mode */ }
    applyTheme(isThemeId(stored) ? stored : DEFAULT_THEME)
}

/** Called once after login: the server's saved preference wins over
 *  localStorage (so the theme follows the player across devices). */
export async function syncThemeFromServer() {
    try {
        const data = await apiFetch<{ theme?: string; paletteTokens?: PaletteTokens | null; paletteName?: string | null }>('/api/settings')
        if (data.theme?.startsWith('palette:') && data.paletteTokens) {
            applyPalette(parseInt(data.theme.slice(8)), data.paletteName ?? 'Custom', data.paletteTokens)
        } else if (isThemeId(data.theme) && data.theme !== currentTheme()) {
            applyTheme(data.theme)
        }
    } catch { /* not logged in yet or offline — local theme stands */ }
}

/** Persist a theme choice to the server ('tavern' | ... | 'palette:<id>'). */
export async function saveTheme(id: string) {
    await apiFetch('/api/settings/theme', {
        method: 'POST',
        body: JSON.stringify({ theme: id }),
    })
}
