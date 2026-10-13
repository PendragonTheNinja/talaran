/**
 * Run `fn` once, `ms` after the last of a burst of calls.
 *
 * For refreshes driven by server pushes: picking up a death pile one stack at
 * a time sends inventory_changed per stack, and every listener used to reload
 * on each one (the pack, the buff panel's two lookups), which ran a player into
 * the request limit (Nathan, 2026-10-12). Ten pickups in a row now reload once.
 */
export function coalesce(fn: () => void, ms = 300): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null
    return () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => { timer = null; fn() }, ms)
    }
}
