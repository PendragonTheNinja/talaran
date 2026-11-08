import db from '../db'
import { logger } from '../lib/logger'
import { compileFilter, filterText, nameRefusal, type CompiledFilter, type FilterResult, type FilterWord } from '../lib/wordFilter'

// The language filter's list, kept in memory (lib/wordFilter.ts does the
// matching). Re-read once a minute, so a word added in the admin content
// browser applies within a minute and without a restart. Until the first read
// finishes, nothing is filtered rather than everything refused.

const REFRESH_MS = 60_000
let compiled: CompiledFilter | null = null
let loading: Promise<void> | null = null
let loadedAt = 0

async function load(): Promise<void> {
    try {
        const [words, subs, allow] = await Promise.all([
            db('filter_words').select('word', 'kind', 'embedded'),
            db('filter_substitutes').pluck('word'),
            db('filter_allow').pluck('word'),
        ])
        compiled = compileFilter(words as FilterWord[], subs.map(String), allow.map(String))
        loadedAt = Date.now()
    } catch (err) {
        logger.error(`[filter] could not load the word list: ${err}`)
    }
}

async function current(): Promise<CompiledFilter | null> {
    if (!compiled || Date.now() - loadedAt > REFRESH_MS) {
        loading ??= load().finally(() => { loading = null })
        if (!compiled) await loading
    }
    return compiled
}

/** Filters public text: swears swapped, slurs reported (the caller refuses). */
export async function filterPublic(text: string): Promise<FilterResult> {
    const f = await current()
    return f ? filterText(f, text) : { text, swears: [], slurs: [] }
}

/** Why a name is not allowed, or null. For usernames, guild names and tags, shop names. */
export async function namesRefusal(...names: (string | null | undefined)[]): Promise<string | null> {
    const f = await current()
    if (!f) return null
    for (const n of names) if (n && nameRefusal(f, n)) return 'That name is not allowed.'
    return null
}

/** The line a sender sees when their words were changed. */
export const SWEAR_NOTICE = 'Mind your language in public. Some of your words were changed.'
/** The refusal for a slur. */
export const SLUR_REFUSAL = 'That was not sent. Words like that are not allowed in Talaran, and staff have been told.'

/** Records a stopped slur for staff (admin panel, Players tab). Never throws. */
export async function flagSlur(playerId: number, place: string, text: string, matched: string[]): Promise<void> {
    try {
        await db('filter_flags').insert({ player_id: playerId, place, text: text.slice(0, 4000), matched: matched.join(', ').slice(0, 200) })
        logger.warn(`[filter] stopped a slur from player ${playerId} in ${place}`)
    } catch (err) {
        logger.error(`[filter] could not record a flag: ${err}`)
    }
}

/**
 * Keeps a swear the filter softened (filter_warnings), so staff can see a
 * player who keeps at it. Never throws, and never holds up the post.
 */
export function noteSwear(playerId: number, place: string, text: string, matched: string[]): void {
    db('filter_warnings')
        .insert({ player_id: playerId, place, text: text.slice(0, 1000), matched: matched.join(', ').slice(0, 200) })
        .catch((err: unknown) => logger.error(`[filter] could not record a warning: ${err}`))
}

/** How many warnings in a week make a player stand out to staff (admin Players tab). */
export const REPEAT_WARNINGS_PER_WEEK = 5

export class FilterRefusal extends Error {}

/**
 * Public text a player is about to post, filtered: the text to store and
 * whether anything was changed. A slur throws FilterRefusal after flagging.
 */
export async function cleanPublicText(playerId: number, place: string, text: string): Promise<{ text: string; changed: boolean }> {
    const r = await filterPublic(text)
    if (r.slurs.length) {
        await flagSlur(playerId, place, text, r.slurs)
        throw new FilterRefusal(SLUR_REFUSAL)
    }
    if (r.swears.length) noteSwear(playerId, place, text, r.swears)
    return { text: r.text, changed: r.swears.length > 0 }
}
