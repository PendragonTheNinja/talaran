import { apiFetch } from './api'

/**
 * What the scene says while an action runs, and what the stop button reads.
 *
 * Both used to be hard-coded `currentAction === '...'` chains in GameView with
 * no default branch, so a new action type rendered no flavour text and no
 * cancel button, silently. Fishing shipped that way. The strings now live in
 * the action_presentation table; this is the lookup, with a fallback that works
 * for an action type nobody has written a line for yet.
 *
 * Fetched once per session. The rows are static content and change on deploy,
 * not during play.
 */

export interface PresentationRow {
    action_type: string
    kind: string | null
    scene_text: string | null
    cancel_label: string
}

/** Keyed `type` and `type:kind`, which is exactly how it is looked up. */
export type PresentationMap = Record<string, PresentationRow>

const GENERIC_SCENE_TEXT = 'You set to work.'
const GENERIC_CANCEL_LABEL = 'Stop'

let cache: PresentationMap | null = null
let inFlight: Promise<PresentationMap> | null = null

function index(rows: PresentationRow[]): PresentationMap {
    const map: PresentationMap = {}
    for (const row of rows) {
        map[row.kind ? `${row.action_type}:${row.kind}` : row.action_type] = row
    }
    return map
}

/**
 * Load the table, once.
 *
 * Concurrent callers share the same request, and a failure resolves to an empty
 * map rather than rejecting: with no rows every action still gets the generic
 * sentence and a working Stop button, which is the entire point of having
 * fallbacks. It retries on the next call.
 */
export async function loadActionPresentation(): Promise<PresentationMap> {
    if (cache) return cache
    if (inFlight) return inFlight

    inFlight = apiFetch<{ presentation: PresentationRow[] }>('/api/actions/presentation')
        .then(data => {
            cache = index(data.presentation || [])
            return cache
        })
        .catch(() => ({} as PresentationMap))
        .finally(() => { inFlight = null })

    return inFlight
}

/**
 * The row for an action, most specific first: the exact sub-kind, then the
 * action type on its own, then nothing.
 */
function rowFor(map: PresentationMap, actionType: string, kind?: string | null): PresentationRow | null {
    if (kind && map[`${actionType}:${kind}`]) return map[`${actionType}:${kind}`]
    return map[actionType] ?? null
}

/**
 * The sentence shown under the timer.
 *
 * `live` is text computed at render time that no table can hold: the travel
 * message, the hunt's current phase, a habitat's own scene text, a recipe's
 * flavour. It wins when present, which keeps those four behaviours exactly as
 * they were.
 */
export function sceneTextFor(
    map: PresentationMap,
    actionType: string,
    kind?: string | null,
    live?: string | null,
): string {
    if (live) return live
    return rowFor(map, actionType, kind)?.scene_text || GENERIC_SCENE_TEXT
}

/** The stop button's label. Always returns something clickable. */
export function cancelLabelFor(
    map: PresentationMap,
    actionType: string,
    kind?: string | null,
): string {
    return rowFor(map, actionType, kind)?.cancel_label || GENERIC_CANCEL_LABEL
}
