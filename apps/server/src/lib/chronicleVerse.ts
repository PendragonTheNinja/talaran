// Wenna's verses, filled in (docs/chronicle-spec.md §8). Pure, so the composer,
// the admin dry run and any test render the same line from the same deed.
//
// A verse is a template: {slots} filled from the deed, [one|two|three]
// alternates picked by a seed, so composing the same day twice gives the same
// page. A verse that names a slot the deed cannot fill is not used at all:
// nothing is ever left blank or guessed.

/** A small seeded random number generator, so a page is the same each time it is composed. */
export function seeded(key: string): () => number {
    // FNV-1a over the key, then mulberry32.
    let h = 2166136261
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    let a = h >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** A number from 0 up to 1 for a key, always the same for the same key. */
export function seededUnit(key: string): number {
    return seeded(key)()
}

/** The slots a verse names, as written: "player", "a item", "place2". */
export function slotsIn(text: string): string[] {
    return [...new Set([...text.matchAll(/\{([a-z0-9 ]+)\}/g)].map(m => m[1]))]
}

/** The values a deed can fill. A missing or empty one means the verse is not used. */
export type Slots = Partial<Record<string, string | number | null | undefined>>

/**
 * "a Squonk's Claw", "an Antler", "some Squonk Tears", and "Ol' Shellback"
 * with none, since a first word ending in an apostrophe marks a proper name. A name ending in a
 * plain plural s takes "some"; a double s, -us or -is is not a plural (Bass,
 * Crocus, Iris).
 */
export function withArticle(name: string): string {
    const n = name.trim()
    // A name like "Ol' Shellback" is somebody, not a kind of thing: no article.
    if (/^\S+'\s/.test(n)) return n
    if (/[^s'][s]$/i.test(n) && !/(ss|us|is)$/i.test(n)) return `some ${n}`
    return `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n}`
}

function slotValue(slot: string, slots: Slots): string | null {
    if (slot.startsWith('a ')) {
        const base = slotValue(slot.slice(2), slots)
        return base ? withArticle(base) : null
    }
    const v = slots[slot]
    if (v === null || v === undefined || v === '') return null
    return String(v)
}

/**
 * Fill a verse. Null when any slot it names cannot be filled. Alternates are
 * picked by `seedKey`; the first letter of the line is made a capital, since a
 * verse may open on "{a item}".
 */
export function renderVerse(text: string, slots: Slots, seedKey: string): string | null {
    const rng = seeded(seedKey)
    const picked = text.replace(/\[([^\]]+)\]/g, (_, group: string) => {
        const options = group.split('|')
        return options[Math.floor(rng() * options.length)] ?? options[0]
    })
    let missing = false
    const filled = picked.replace(/\{([a-z0-9 ]+)\}/g, (_, slot: string) => {
        const v = slotValue(slot, slots)
        if (v === null) { missing = true; return '' }
        return v
    })
    if (missing) return null
    return filled.charAt(0).toUpperCase() + filled.slice(1)
}

/** Whether a verse can be filled from these slots, without rendering it. */
export function canFill(text: string, slots: Slots): boolean {
    return slotsIn(text).every(s => slotValue(s, slots) !== null)
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** Small counts as words ("three strangers"), larger ones as figures ("250 kills"). */
export function countWord(n: number): string {
    return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : n.toLocaleString('en-US')
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ordinal(n: number): string {
    const tens = n % 100
    if (tens >= 11 && tens <= 13) return `${n}th`
    return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** "4th of November" for "2026-11-04". */
export function dayTitle(dayKey: string): string {
    const [, m, d] = dayKey.split('-').map(Number)
    return `${ordinal(d)} of ${MONTHS[m - 1]}`
}

/** The day key `n` days after (or before, when negative) another. */
export function addDays(dayKey: string, n: number): string {
    const [y, m, d] = dayKey.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1, d + n))
    return t.toISOString().slice(0, 10)
}

/** "Ellis, Corwin and Wren", or "Ellis, Corwin, Wren and 12 others" past the cap. */
export function nameList(names: string[], max: number): string {
    if (!names.length) return ''
    const shown = names.slice(0, max)
    const rest = names.length - shown.length
    if (rest > 0) return `${shown.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`
    if (shown.length === 1) return shown[0]
    return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}
