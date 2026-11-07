// The language filter (Nathan, 2026-11-07): swears in public text become
// silly words, slurs are refused, and names with either are not allowed.
// Pure, so chat, the forum, names and the tests all run the same rules. The
// word list is data (filter_words, filter_substitutes); services/wordFilter.ts
// loads it and keeps it fresh.
//
// How it catches tricks without catching innocent words:
//   1. Every word is NORMALISED before it is compared: lower case, accents
//      dropped, look-alike letters from other alphabets mapped to Latin ones
//      (Cyrillic а, о, е...), and number and symbol stand-ins read as letters
//      (0 o, 1 i, 3 e, 4 a, @ a, $ s, 5 s, 7 t). Hidden characters are removed.
//   2. A listed word matches a WHOLE word only, with any letter repeated
//      ("fuuuck") and a common ending (-s, -ed, -er, -ing). So "Scunthorpe",
//      "classic", "assassin", "cocktail" and "cumin" are never touched: a listed
//      word inside a longer word is not a match.
//   3. Starred-out letters count as any letter ("f**k", "sh#t").
//   4. Letters spaced out or dotted ("f u c k", "f.u.c.k") are joined and
//      checked as one word.
//   5. Words marked `embedded` (the strongest ones, which hide inside nothing
//      innocent) are ALSO caught inside longer words: in names
//      ("xXfuckXx"), and in run-together compounds in chat ("fuckface").

export type FilterKind = 'swear' | 'slur'

export interface FilterWord {
    word: string
    kind: FilterKind
    /** Also caught inside a longer word (names, compounds). */
    embedded: boolean
}

export interface FilterResult {
    /** The text with every swear replaced; unchanged when nothing matched. */
    text: string
    /** Listed swears found (their list form). */
    swears: string[]
    /** Listed slurs found. When any, the text must not be posted. */
    slurs: string[]
}

const LEET: Record<string, string> = {
    '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a',
    '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '€': 'e', '£': 'l',
}

// Letters from other alphabets that look like Latin ones.
const HOMOGLYPH: Record<string, string> = {
    'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p',
    'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd',
    'ɡ': 'g', 'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p',
    'τ': 't', 'υ': 'u', 'χ': 'x', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe',
}

/** Characters that only hide things: zero-width spaces, joiners, soft hyphens. */
const INVISIBLE = /[­​-‏⁠-⁤﻿]/g

/** Wildcards a player uses to star a word out. */
const MASK = new Set(['*', '#', '%', '_'])

/** Endings any listed word may carry and still match. */
const ENDINGS = '(?:s|es|ed|d|er|ers|ing|z)?'

/** One character as the filter reads it: a lower-case letter, '?' for a mask, or '' to drop. */
function readChar(ch: string): string {
    if (MASK.has(ch)) return '?'
    const lower = ch.toLowerCase()
    if (HOMOGLYPH[lower]) return HOMOGLYPH[lower]
    if (LEET[lower]) return LEET[lower]
    const plain = lower.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    return /^[a-z]+$/.test(plain) ? plain : ''
}

/** A word normalised for comparison: letters only, masks as '?'. */
export function normalise(word: string): string {
    let out = ''
    for (const ch of word.replace(INVISIBLE, '')) out += readChar(ch)
    return out
}

/**
 * Letters of a listed word, each standing once or stretched to three or more
 * ("fuuuck"), never exactly twice: a doubled letter is ordinary spelling, and
 * allowing it caught "poorness" (porn) and "hommos" (homo) in the dictionary
 * test.
 */
function letterPattern(word: string): string {
    return [...word].map(c => `${c}(?:${c}{2,})?`).join('')
}

export interface CompiledFilter {
    whole: { entry: FilterWord; re: RegExp }[]
    inside: { entry: FilterWord; re: RegExp }[]
    substitutes: string[]
    /** Innocent words that hold an embedded one ("snigger"), taken out before looking inside. */
    allowInside: string[]
}

/**
 * `allowInside` lists innocent words that contain an embedded listed word
 * ("snigger", "swank"); they are removed from a word before it is searched
 * inside, so they never trip it.
 */
export function compileFilter(words: FilterWord[], substitutes: string[], allowInside: string[] = []): CompiledFilter {
    const clean = words
        .map(w => ({ ...w, word: normalise(w.word) }))
        .filter(w => w.word.length >= 2)
    return {
        whole: clean.map(entry => ({ entry, re: new RegExp(`^${letterPattern(entry.word)}${ENDINGS}$`) })),
        inside: clean.filter(e => e.embedded).map(entry => ({ entry, re: new RegExp(letterPattern(entry.word)) })),
        substitutes: substitutes.length ? substitutes : ['fiddlesticks'],
        allowInside: allowInside.map(normalise).filter(Boolean).sort((a, b) => b.length - a.length),
    }
}

/** Does a normalised word match a listed one? Masks ('?') stand for any letter. */
function matchWhole(f: CompiledFilter, norm: string): FilterWord | null {
    if (!norm) return null
    if (norm.includes('?')) {
        // A starred word: it must be mostly letters, and fit some listed word
        // letter for letter, with the stars standing in for the rest.
        const letters = norm.replace(/\?/g, '').length
        if (letters < 1 || letters < norm.length / 3) return null
        for (const { entry } of f.whole) {
            if (entry.word.length !== norm.length) continue
            if ([...norm].every((c, i) => c === '?' || c === entry.word[i]) && norm[0] === entry.word[0]) return entry
        }
        return null
    }
    for (const { entry, re } of f.whole) if (re.test(norm)) return entry
    return null
}

function matchInside(f: CompiledFilter, norm: string): FilterWord | null {
    let rest = norm
    for (const ok of f.allowInside) rest = rest.split(ok).join(' ')
    for (const { entry, re } of f.inside) if (re.test(rest)) return entry
    return null
}

/** The replacement in the same case as what it replaces: SHOUTED, Capitalised or plain. */
function inCase(model: string, word: string): string {
    const letters = model.replace(/[^\p{L}]/gu, '')
    if (letters.length > 1 && letters === letters.toUpperCase()) return word.toUpperCase()
    if (letters && letters[0] === letters[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1)
    return word
}

function pick(f: CompiledFilter, seed: string): string {
    let h = 0
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return f.substitutes[h % f.substitutes.length]
}

/** A word in the text: a run of letters, digits, stand-ins and masks, with its place. */
const WORD = /[\p{L}\p{N}@$!|+*#%€£'­​-‏⁠-⁤﻿]+/gu

interface Token { start: number; end: number; raw: string }

function tokens(text: string): Token[] {
    const out: Token[] = []
    for (const m of text.matchAll(WORD)) out.push({ start: m.index!, end: m.index! + m[0].length, raw: m[0] })
    return out
}

/**
 * Filters a piece of public text. Swears are replaced by silly words, in the
 * same case; slurs are reported so the caller can refuse the text.
 */
export function filterText(f: CompiledFilter, text: string): FilterResult {
    const found: { start: number; end: number; entry: FilterWord; model: string }[] = []
    const toks = tokens(text)

    for (const t of toks) {
        // Stand-ins at the ends are usually punctuation ("shit!", "@you"), so
        // try the word with them trimmed as well as read as letters.
        const lead = /^[^\p{L}\p{N}*#%]*/u.exec(t.raw)![0].length
        const tail = /[^\p{L}\p{N}*#%]*$/u.exec(t.raw)![0].length
        const trimmed = t.raw.slice(lead, t.raw.length - tail)
        // Each form with the span it would replace: the trimmed word keeps the
        // punctuation round it ("shit!" becomes "turnips!").
        const forms: { n: string; start: number; end: number }[] = [
            { n: normalise(trimmed), start: t.start + lead, end: t.end - tail },
            { n: normalise(t.raw), start: t.start, end: t.end },
            { n: normalise(t.raw.replace(/'/g, '')), start: t.start, end: t.end },
        ]
        let hit: FilterWord | null = null
        let span = forms[0]
        for (const fm of forms) { hit = matchWhole(f, fm.n); if (hit) { span = fm; break } }
        if (!hit) for (const fm of forms) { if (fm.n.length > 4) { hit = matchInside(f, fm.n); if (hit) { span = fm; break } } }
        if (hit) found.push({ start: span.start, end: span.end, entry: hit, model: text.slice(span.start, span.end) })
    }

    // Letters spelled out one at a time: "f u c k", "f.u.c.k", "s-h-i-t".
    for (let i = 0; i < toks.length; i++) {
        if (normalise(toks[i].raw).length !== 1) continue
        let j = i
        while (j + 1 < toks.length && normalise(toks[j + 1].raw).length === 1
            && /^[\s.\-_,]{1,2}$/.test(text.slice(toks[j].end, toks[j + 1].start))) j++
        if (j - i >= 2) {
            const joined = toks.slice(i, j + 1).map(t => normalise(t.raw)).join('')
            const hit = matchWhole(f, joined)
            if (hit && !found.some(x => x.start >= toks[i].start && x.end <= toks[j].end)) {
                found.push({ start: toks[i].start, end: toks[j].end, entry: hit, model: toks.slice(i, j + 1).map(t => t.raw).join('') })
            }
        }
        i = j
    }

    if (!found.length) return { text, swears: [], slurs: [] }
    found.sort((a, b) => a.start - b.start)
    let out = ''
    let at = 0
    for (const x of found) {
        out += text.slice(at, x.start)
        out += x.entry.kind === 'slur' ? '****' : inCase(x.model, pick(f, `${x.entry.word}:${x.start}:${text.length}`))
        at = x.end
    }
    out += text.slice(at)
    return {
        text: out,
        swears: [...new Set(found.filter(x => x.entry.kind === 'swear').map(x => x.entry.word))],
        slurs: [...new Set(found.filter(x => x.entry.kind === 'slur').map(x => x.entry.word))],
    }
}

/**
 * Whether a name may be used: refused if any listed word, swear or slur, is a
 * word in it, or an `embedded` word appears anywhere in it once its spaces and
 * stand-ins are taken out ("xXSh1tLordXx").
 */
export function nameRefusal(f: CompiledFilter, name: string): string | null {
    const words = name.split(/[\s_\-.]+/).filter(Boolean)
    for (const w of words) if (matchWhole(f, normalise(w))) return 'That name is not allowed.'
    const squashed = normalise(name)
    if (matchWhole(f, squashed) || matchInside(f, squashed)) return 'That name is not allowed.'
    return null
}
