import fs from 'fs';
import path from 'path';
import db from '../db';
import { logger } from '../index';
import { runManualQuery, listManualQueries } from '../routes/manual';

// Manual search.
//
// Three things are searchable and they are not alike, so they are kept apart in
// the results rather than blended into one ranked list:
//
//   pages   the Geographer's writing, matched on prose and headings
//   tables  the live data blocks, matched row by row
//   items   every active item, which is usually what somebody wanted
//
// A reader searching "boarhide" wants the item page. One searching "vein" wants
// the paragraph explaining veins. One searching "Grundagr" wants every table row
// mentioning it. Blending those into one list buries whichever the reader
// actually meant, so the client shows all three and lets them choose.
//
// PAGE CONTENT lives in two places. manual_pages holds admin overrides, and the
// shipped markdown under apps/client/public/manual is the fallback the client
// uses when no override exists. Both are read here, with the override winning,
// so search finds what the reader would actually see.

const MANUAL_DIR = path.resolve(__dirname, '../../../client/public/manual');

/** How long the index is trusted before it is rebuilt. */
const INDEX_TTL_MS = 5 * 60 * 1000;

export interface PageHit {
    section: string;
    slug: string;
    title: string;
    heading: string | null;
    snippet: string;
}

export interface TableHit {
    query: string;
    label: string;
    columns: string[];
    values: string[];
}

export interface ItemHit {
    name: string;
    type: string;
}

interface Index {
    built: number;
    pages: { section: string; slug: string; title: string; blocks: { heading: string | null; text: string }[] }[];
    tables: { query: string; label: string; columns: string[]; rows: string[][] }[];
    items: ItemHit[];
}

let cache: Index | null = null;
let building: Promise<Index> | null = null;

function walkMarkdown(): { section: string; slug: string; text: string }[] {
    const out: { section: string; slug: string; text: string }[] = [];
    if (!fs.existsSync(MANUAL_DIR)) {
        logger.warn(`[search] manual directory not found at ${MANUAL_DIR}; pages will only be searched via overrides`);
        return out;
    }
    for (const section of fs.readdirSync(MANUAL_DIR)) {
        const dir = path.join(MANUAL_DIR, section);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.md')) continue;
            out.push({
                section,
                slug: file.replace(/\.md$/, ''),
                text: fs.readFileSync(path.join(dir, file), 'utf8'),
            });
        }
    }
    return out;
}

/**
 * Splits a page into blocks under their headings, so a hit can say which part
 * of the page it came from rather than just naming the page.
 */
function blocksOf(markdown: string): { heading: string | null; text: string }[] {
    const blocks: { heading: string | null; text: string }[] = [];
    let heading: string | null = null;
    let buffer: string[] = [];

    const flush = () => {
        const text = buffer.join(' ')
            .replace(/\{\{[^}]*\}\}/g, ' ')     // directives are not prose
            .replace(/[*_`#>|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (text) blocks.push({ heading, text });
        buffer = [];
    };

    for (const line of markdown.split('\n')) {
        const h = line.match(/^#{2,3}\s+(.*)$/);
        if (h) {
            flush();
            heading = h[1].trim();
            continue;
        }
        buffer.push(line);
    }
    flush();
    return blocks;
}

async function build(): Promise<Index> {
    const overrides = await db('manual_pages')
        .where({ is_published: true })
        .select('section', 'slug', 'title', 'content');

    const titles = new Map<string, string>();
    for (const o of overrides) titles.set(`${o.section}/${o.slug}`, o.title);

    const byKey = new Map<string, { section: string; slug: string; title: string; text: string }>();
    for (const f of walkMarkdown()) {
        const key = `${f.section}/${f.slug}`;
        byKey.set(key, {
            section: f.section,
            slug: f.slug,
            title: titles.get(key) || f.slug.replace(/-/g, ' '),
            text: f.text,
        });
    }
    // An override replaces the shipped file entirely, because that is what the
    // reader is being shown.
    for (const o of overrides) {
        byKey.set(`${o.section}/${o.slug}`, {
            section: o.section, slug: o.slug, title: o.title, text: o.content || '',
        });
    }

    const pages = [...byKey.values()].map(p => ({
        section: p.section,
        slug: p.slug,
        title: p.title,
        blocks: blocksOf(p.text),
    }));

    // Every registered data block, flattened to rows of strings. Running all of
    // them is the expensive part, which is the whole reason for the cache.
    const tables: Index['tables'] = [];
    for (const q of listManualQueries()) {
        try {
            const table = await runManualQuery(q.key);
            if (!table) continue;
            tables.push({
                query: q.key,
                label: table.title || q.label,
                columns: table.columns.map(c => c.label),
                rows: table.rows.map(r => table.columns.map(c => String(r[c.key] ?? ''))),
            });
        } catch {
            // One broken query must not take search down with it.
        }
    }

    const items = await db('items')
        .where({ is_active: true })
        .orderBy('name')
        .select('name', 'type');

    return { built: Date.now(), pages, tables, items };
}

async function getIndex(): Promise<Index> {
    if (cache && Date.now() - cache.built < INDEX_TTL_MS) return cache;
    // Concurrent callers share one build rather than each starting their own.
    if (!building) {
        building = build()
            .then((i) => { cache = i; return i; })
            .finally(() => { building = null; });
    }
    return building;
}

/** Drops the cache. Call after a content import so search reflects it at once. */
export function invalidateSearchIndex(): void {
    cache = null;
}

function snippetAround(text: string, q: string, span = 130): string {
    const at = text.toLowerCase().indexOf(q);
    if (at < 0) return text.slice(0, span);
    const start = Math.max(0, at - Math.floor(span / 3));
    const end = Math.min(text.length, start + span);
    return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export async function searchManual(query: string): Promise<{
    pages: PageHit[];
    tables: TableHit[];
    items: ItemHit[];
}> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { pages: [], tables: [], items: [] };

    const index = await getIndex();

    const pages: PageHit[] = [];
    for (const p of index.pages) {
        for (const b of p.blocks) {
            if (!b.text.toLowerCase().includes(q) && !(b.heading || '').toLowerCase().includes(q)) continue;
            pages.push({
                section: p.section,
                slug: p.slug,
                title: p.title,
                heading: b.heading,
                snippet: snippetAround(b.text, q),
            });
            if (pages.length >= 25) break;
        }
        if (pages.length >= 25) break;
    }

    const tables: TableHit[] = [];
    for (const t of index.tables) {
        for (const row of t.rows) {
            if (!row.some(v => v.toLowerCase().includes(q))) continue;
            tables.push({ query: t.query, label: t.label, columns: t.columns, values: row });
            if (tables.length >= 25) break;
        }
        if (tables.length >= 25) break;
    }

    // Exact and prefix matches first: somebody typing "lanai" wants Lanai
    // Planks before Fine Lanai Log.
    const items = index.items
        .filter(i => i.name.toLowerCase().includes(q))
        .sort((a, b) => {
            const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
            const rank = (n: string) => (n === q ? 0 : n.startsWith(q) ? 1 : 2);
            return rank(an) - rank(bn) || an.localeCompare(bn);
        })
        .slice(0, 25);

    return { pages, tables, items };
}
