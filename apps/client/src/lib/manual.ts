// Manual content plumbing (docs/manual-spec.md §2, §4).
//
// Prose is markdown served as a static asset from /manual/. The nav is built from
// manifest.json, so adding a page is a content operation: drop the file in, add a
// manifest entry, no code change.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface ManualPageRef {
    slug: string
    title: string
    blurb?: string
}

export interface ManualSection {
    key: string
    title: string
    blurb?: string
    pages: ManualPageRef[]
}

export interface ManualManifest {
    sections: ManualSection[]
}

export interface ManualTable {
    title: string
    columns: { key: string; label: string; align?: 'left' | 'right'; icon?: string }[]
    rows: Record<string, string | number>[]
    note?: string
    /** Item name for an icon beside the table title. */
    icon?: string
}

// ── content nodes ───────────────────────────────────────────────────────────
// A page is a sequence of prose, live data blocks, and collapsible sections.
// Tables and <details> can't come from markdown: lib/markdown.ts strips both
// (ALLOWED_TAGS has no table/details), so they must be real components.

export type ManualNode =
    | { type: 'prose'; text: string }
    | { type: 'data'; query: string; param?: string }
    | { type: 'details'; label: string; children: ManualNode[] }
    | { type: 'tabs'; tabs: { label: string; children: ManualNode[] }[] }

const DATA_RE = /\{\{data:([a-z-]+)(?::([^}]+))?\}\}/i
const DETAILS_OPEN_RE = /\{\{details:([^}]+)\}\}/i
const DETAILS_CLOSE = '{{/details}}'
const TABS_OPEN = '{{tabs}}'
const TABS_CLOSE = '{{/tabs}}'
const TAB_RE = /\{\{tab:([^}]+)\}\}/g

/** Splits prose and {{data:...}} directives. No nesting at this level. */
function parseFlat(text: string): ManualNode[] {
    const nodes: ManualNode[] = []
    let rest = text

    for (;;) {
        const m = rest.match(DATA_RE)
        if (!m || m.index === undefined) break

        const before = rest.slice(0, m.index)
        if (before.trim()) nodes.push({ type: 'prose', text: before.trim() })

        nodes.push({ type: 'data', query: m[1].toLowerCase(), param: m[2]?.trim() })
        rest = rest.slice(m.index + m[0].length)
    }

    if (rest.trim()) nodes.push({ type: 'prose', text: rest.trim() })
    return nodes
}

/** Handles {{details:Label}} … {{/details}} wrapping flat content. */
function parseDetails(content: string): ManualNode[] {
    const nodes: ManualNode[] = []
    let rest = content

    for (;;) {
        const open = rest.match(DETAILS_OPEN_RE)
        if (!open || open.index === undefined) break

        const before = rest.slice(0, open.index)
        nodes.push(...parseFlat(before))

        const after = rest.slice(open.index + open[0].length)
        const closeAt = after.indexOf(DETAILS_CLOSE)

        // Unclosed block: treat the remainder as its body rather than losing it.
        const body = closeAt === -1 ? after : after.slice(0, closeAt)
        nodes.push({
            type: 'details',
            label: open[1].trim(),
            children: parseFlat(body),
        })

        rest = closeAt === -1 ? '' : after.slice(closeAt + DETAILS_CLOSE.length)
    }

    nodes.push(...parseFlat(rest))
    return nodes
}

/**
 * Full parse. Tabs are outermost so a tab may contain details and data blocks:
 *
 *   {{tabs}}
 *   {{tab:Hunting}}   …
 *   {{tab:Trapping}}  …
 *   {{/tabs}}
 *
 * Tabs exist so one page can hold several faces of a single skill (Hunting and
 * Trapping; Crafting and its disciplines) without splitting them into separate
 * entries in the contents. They are one skill, so they are one page.
 */
export function parseManual(content: string): ManualNode[] {
    const nodes: ManualNode[] = []
    let rest = content

    for (;;) {
        const openAt = rest.indexOf(TABS_OPEN)
        if (openAt === -1) break

        nodes.push(...parseDetails(rest.slice(0, openAt)))

        const after = rest.slice(openAt + TABS_OPEN.length)
        const closeAt = after.indexOf(TABS_CLOSE)
        const body = closeAt === -1 ? after : after.slice(0, closeAt)

        const tabs: { label: string; children: ManualNode[] }[] = []
        const marks = [...body.matchAll(TAB_RE)]

        marks.forEach((mark, i) => {
            const start = (mark.index ?? 0) + mark[0].length
            const end = i + 1 < marks.length ? marks[i + 1].index : body.length
            tabs.push({
                label: mark[1].trim(),
                children: parseDetails(body.slice(start, end)),
            })
        })

        // A {{tabs}} block with no {{tab:}} markers is malformed; render its body
        // as ordinary content rather than swallowing it.
        if (tabs.length > 0) nodes.push({ type: 'tabs', tabs })
        else nodes.push(...parseDetails(body))

        rest = closeAt === -1 ? '' : after.slice(closeAt + TABS_CLOSE.length)
    }

    nodes.push(...parseDetails(rest))
    return nodes
}

/** Directives and markdown syntax stripped, for search matching and previews. */
export function toPlainText(content: string): string {
    return content
        .replace(/\{\{[^}]*\}\}/g, ' ')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*_`>]/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
}

// ── loading ─────────────────────────────────────────────────────────────────

interface OverrideRef {
    section: string
    slug: string
    title?: string | null
    blurb?: string | null
    sort_order?: number | null
}

/**
 * The shipped manifest.json, merged with any live overrides from the admin
 * editor. A matching section+slug replaces the file page's title and blurb; a
 * new one is appended to its section. If the override request fails for any
 * reason the shipped manifest is used unchanged, so the manual never goes dark
 * because the database is unhappy.
 */
export async function loadManifest(): Promise<ManualManifest> {
    const res = await fetch('/manual/manifest.json')
    if (!res.ok) throw new Error('Could not load the manual index.')
    const manifest: ManualManifest = await res.json()

    let overrides: OverrideRef[] = []
    try {
        const live = await fetch(`${API_URL}/api/manual/pages`)
        if (live.ok) overrides = (await live.json()).pages || []
    } catch {
        return manifest
    }

    if (overrides.length === 0) return manifest

    for (const section of manifest.sections) {
        const mine = overrides.filter(o => o.section === section.key)

        for (const o of mine) {
            const existing = section.pages.find(p => p.slug === o.slug)
            if (existing) {
                if (o.title) existing.title = o.title
                if (o.blurb) existing.blurb = o.blurb
            } else {
                section.pages.push({
                    slug: o.slug,
                    title: o.title || o.slug,
                    blurb: o.blurb || undefined,
                })
            }
        }

        // Explicit sort_order wins; anything without one keeps its existing place.
        const order = new Map(mine.filter(o => o.sort_order != null).map(o => [o.slug, o.sort_order as number]))
        if (order.size > 0) {
            section.pages.sort((a, b) => {
                const av = order.has(a.slug) ? (order.get(a.slug) as number) : Number.MAX_SAFE_INTEGER
                const bv = order.has(b.slug) ? (order.get(b.slug) as number) : Number.MAX_SAFE_INTEGER
                return av - bv
            })
        }
    }

    return manifest
}

/**
 * An override if one exists, otherwise the shipped markdown file. A 404 from the
 * override endpoint is the normal case, not an error.
 */
export async function loadPage(section: string, slug: string): Promise<string> {
    try {
        const live = await fetch(`${API_URL}/api/manual/page/${section}/${slug}`)
        if (live.ok) {
            const data = await live.json()
            if (typeof data.content === 'string') return data.content
        }
    } catch {
        // Fall through to the file.
    }

    const res = await fetch(`/manual/${section}/${slug}.md`)
    if (!res.ok) throw new Error('That page is not in the manual.')
    return res.text()
}

/** The shipped file only, ignoring overrides. The editor needs this to diff. */
export async function loadShippedPage(section: string, slug: string): Promise<string | null> {
    const res = await fetch(`/manual/${section}/${slug}.md`)
    return res.ok ? res.text() : null
}

export async function loadData(query: string, param?: string): Promise<ManualTable> {
    const url = param
        ? `${API_URL}/api/manual/data/${query}/${encodeURIComponent(param)}`
        : `${API_URL}/api/manual/data/${query}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`No ledger for "${query}".`)
    return res.json()
}

// ── search ──────────────────────────────────────────────────────────────────
// Deliberately dumb: ~25 small files, fetched once and substring-matched.

export interface SearchHit {
    section: string
    sectionTitle: string
    slug: string
    title: string
    excerpt: string
}

let corpus: { section: string; sectionTitle: string; slug: string; title: string; body: string }[] | null = null

export async function buildCorpus(manifest: ManualManifest): Promise<void> {
    if (corpus) return

    const entries = manifest.sections.flatMap(s =>
        s.pages.map(p => ({ section: s.key, sectionTitle: s.title, slug: p.slug, title: p.title })),
    )

    corpus = await Promise.all(
        entries.map(async e => {
            let body = ''
            try {
                body = toPlainText(await loadPage(e.section, e.slug))
            } catch {
                body = ''
            }
            return { ...e, body }
        }),
    )
}

export function searchCorpus(query: string, limit = 12): SearchHit[] {
    const q = query.trim().toLowerCase()
    if (!corpus || q.length < 2) return []

    const hits: SearchHit[] = []

    for (const page of corpus) {
        const inTitle = page.title.toLowerCase().includes(q)
        const at = page.body.toLowerCase().indexOf(q)
        if (!inTitle && at === -1) continue

        const start = at === -1 ? 0 : Math.max(0, at - 60)
        const raw = page.body.slice(start, start + 160)

        hits.push({
            section: page.section,
            sectionTitle: page.sectionTitle,
            slug: page.slug,
            title: page.title,
            excerpt: (start > 0 ? '…' : '') + raw + (page.body.length > start + 160 ? '…' : ''),
        })

        if (hits.length >= limit) break
    }

    // Title matches first — they're almost always what someone meant.
    return hits.sort((a, b) => {
        const at = a.title.toLowerCase().includes(q) ? 0 : 1
        const bt = b.title.toLowerCase().includes(q) ? 0 : 1
        return at - bt
    })
}
