import type { Knex } from 'knex';

const WOODS = [
    { type: 'lanai', word: 'Lanai' },
    { type: 'hatch', word: 'Hatch' },
    { type: 'bearn', word: 'Bearn' },
    { type: 'mirrith', word: 'Mirrith' },
    { type: 'craxial', word: 'Craxial' },
];
const BARK_PCT: Record<string, number> = { poor: 50, fine: 75, excellent: 100 };

export async function up(knex: Knex): Promise<void> {
    // ── Percent-chance column on the drop engine ──────────────
    const hasCol = await knex.schema.hasColumn('drop_table_entries', 'chance_percent');
    if (!hasCol) {
        await knex.schema.alterTable('drop_table_entries', (table) => {
            table.decimal('chance_percent', 6, 3).nullable(); // 0–100; takes precedence over chance_one_in when set
        });
    }

    // ── Items: generic Sawdust + per-wood Bark ────────────────
    async function ensureItem(name: string, description: string): Promise<number> {
        let item = await knex('items').where({ name }).first();
        if (!item) {
            const [inserted] = await knex('items').insert({
                name, type: 'material', subtype: null, quality: null, tier: 1,
                slot: null, level_required: 1, description, stackable: true, is_active: true,
            }).returning('*');
            item = inserted;
        }
        return item.id;
    }

    const sawdustId = await ensureItem('Sawdust', 'Fine wood powder left over from sawing. Burns well and has its uses.');

    const barkIds: Record<string, number> = {};
    for (const w of WOODS) {
        barkIds[w.type] = await ensureItem(`${w.word} Bark`, `Rough bark stripped from ${w.word} logs.`);
    }

    // ── Drop rows: one Sawdust (100%) + one Bark (quality %) per (wood, quality) ──
    async function ensureEntry(sourceKey: string, itemId: number, opts: { pct?: number; oneIn?: number }) {
        const exists = await knex('drop_table_entries').where({ source_key: sourceKey, item_id: itemId }).first();
        if (exists) return;
        await knex('drop_table_entries').insert({
            source_key: sourceKey,
            item_id: itemId,
            chance_one_in: opts.oneIn ?? 1,
            chance_percent: opts.pct ?? null,
            min_qty: 1,
            max_qty: 1,
            discovery_xp: 0,
        });
    }

    for (const w of WOODS) {
        for (const quality of ['poor', 'fine', 'excellent']) {
            const key = `carpentry:saw:${w.type}:${quality}`;
            await ensureEntry(key, sawdustId, { pct: 100 });
            await ensureEntry(key, barkIds[w.type], { pct: BARK_PCT[quality] });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const w of WOODS) {
        for (const quality of ['poor', 'fine', 'excellent']) {
            await knex('drop_table_entries').where({ source_key: `carpentry:saw:${w.type}:${quality}` }).del();
        }
    }
    if (await knex.schema.hasColumn('drop_table_entries', 'chance_percent')) {
        await knex.schema.alterTable('drop_table_entries', (t) => t.dropColumn('chance_percent'));
    }
}