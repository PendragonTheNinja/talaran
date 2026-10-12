// Which exhibit an item belongs in (docs/WORLD-EVENTS-AND-MUSEUMS.md, Part 2).
//
// Each exhibit carries its own rule as data: `match` is a list of
// { type, subtype? } or { name } patterns. An item goes to the exhibit with the
// most specific match (a name beats a type AND subtype, which beats a type
// alone; ties go to the earlier exhibit), or to the museum's catch-all when
// nothing matches. A name is for the few items whose kind is shared with
// others that belong elsewhere: a creature's trophy has the same kind as a
// hunter's, and only the creature's belongs with the spoils of a fight.
//
// Pure, with no database, so the migration that first fills the museum and
// services/museum.ts, which places new items as they are first found, use the
// one rule. Change what goes where by editing the exhibits' `match` rows.

export interface ExhibitRule {
    id: number
    display_order: number
    match: unknown
    is_catch_all: boolean
}

export interface ItemKind { type: string | null; subtype: string | null; name?: string | null }

type Pattern = { type?: string; subtype?: string; name?: string };

function patterns(match: unknown): Pattern[] {
    const list = typeof match === 'string' ? safeParse(match) : match;
    if (!Array.isArray(list)) return [];
    return list.filter((p): p is Pattern => !!p && (typeof p.type === 'string' || typeof p.name === 'string'));
}

function safeParse(s: string): unknown {
    try { return JSON.parse(s); } catch { return []; }
}

/** The exhibit id for an item, or null when the museum has no rule and no catch-all for it. */
export function exhibitFor(item: ItemKind, exhibits: ExhibitRule[]): number | null {
    const type = (item.type ?? '').toLowerCase();
    const subtype = (item.subtype ?? '').toLowerCase();
    const name = (item.name ?? '').toLowerCase();
    let best: { id: number; score: number; order: number } | null = null;
    for (const e of exhibits) {
        for (const p of patterns(e.match)) {
            let score: number;
            if (typeof p.name === 'string') {
                if (!name || p.name.toLowerCase() !== name) continue;
                score = 3;
            } else if (!p.type || p.type.toLowerCase() !== type) continue;
            else if (p.subtype === undefined || p.subtype === null) score = 1;
            else if (String(p.subtype).toLowerCase() === subtype) score = 2;
            else continue;
            if (!best || score > best.score || (score === best.score && e.display_order < best.order)) {
                best = { id: e.id, score, order: e.display_order };
            }
        }
    }
    if (best) return best.id;
    return exhibits.find((e) => e.is_catch_all)?.id ?? null;
}
