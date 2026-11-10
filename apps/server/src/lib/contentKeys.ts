import type { Knex } from 'knex';

// What identifies a row of a content table, for the snapshot scripts
// (scripts/exportContent.ts, scripts/importContent.ts).
//
// Both used to assume every content table has an `id`. Most do, but a table may
// be keyed by something else: tool_durability_tiers and durability_tiers by
// `tier`, chronicle_deed_kinds by `key`. The export ordered by `id` and stopped
// dead at the first table without one (found on live, 2026-11-10: no snapshot
// could be taken once such a table was registered), and the import upserted on
// `id`, which fails wherever `id` is missing or is not the unique key. Asking
// the database for the real primary key keeps a new table's choice of key from
// breaking either script again.

/** The primary key columns of a table, in key order. Throws if it has none. */
export async function primaryKeyOf(x: Knex | Knex.Transaction, table: string): Promise<string[]> {
    const { rows } = await x.raw(
        `SELECT a.attname AS column_name
           FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
          WHERE i.indrelid = ?::regclass AND i.indisprimary
          ORDER BY array_position(i.indkey::int[], a.attnum::int)`,
        [`public.${table}`],
    );
    const columns = (rows as { column_name: string }[]).map((r) => r.column_name);
    if (!columns.length) {
        throw new Error(`${table} has no primary key, so its rows cannot be matched to a snapshot. Give it one, or take it out of the snapshot tables (lib/contentTables.ts).`);
    }
    return columns;
}

/** True when the table has a serial `id` whose sequence must be moved past imported rows. */
export async function hasSerialId(x: Knex | Knex.Transaction, table: string): Promise<boolean> {
    const { rows } = await x.raw(
        `SELECT pg_get_serial_sequence(?, 'id') AS seq
          WHERE EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = ? AND column_name = 'id')`,
        [`public.${table}`, table],
    );
    return !!(rows as { seq: string | null }[])[0]?.seq;
}

/**
 * The order to import snapshot tables in: every table after the tables its
 * foreign keys point at, read from the database's own constraints.
 *
 * The import used to trust the order tables are listed in lib/contentTables.ts
 * ("parents before children"). That held until npcs gained
 * hide_after_quest_id, a key into quests, which is listed far below it: from
 * then on a snapshot with a hiding NPC (Quank) could not be imported at all,
 * and nothing showed it because the committed snapshot predated the column.
 * Listed order is kept wherever the keys allow, so the output still reads the
 * way the registry does.
 */
export async function importOrder(x: Knex | Knex.Transaction, tables: string[]): Promise<string[]> {
    const { rows } = await x.raw(
        `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
           FROM pg_constraint c
          WHERE c.contype = 'f' AND c.conrelid <> c.confrelid
            AND c.connamespace = 'public'::regnamespace`,
    );
    const listed = new Set(tables);
    const parents = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
    for (const { child, parent } of rows as { child: string; parent: string }[]) {
        if (listed.has(child) && listed.has(parent)) parents.get(child)!.add(parent);
    }

    const ordered: string[] = [];
    const placed = new Set<string>();
    while (ordered.length < tables.length) {
        const next = tables.find((t) => !placed.has(t) && [...parents.get(t)!].every((p) => placed.has(p)));
        if (!next) {
            const stuck = tables.filter((t) => !placed.has(t));
            throw new Error(`Content tables reference each other in a circle and cannot be imported in any order: ${stuck.join(', ')}`);
        }
        ordered.push(next);
        placed.add(next);
    }
    return ordered;
}
