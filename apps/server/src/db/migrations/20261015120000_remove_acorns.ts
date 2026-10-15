import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Acorns leave the game (Nathan, 2026-10-15). They had no job: their flour
// recipe went in 20260722080000, and no animal eats them (husbandry feed is
// each species' feed_item_name, and none names Acorns).
//
//   • Every foraging habitat stops dropping them. The entries left behind have
//     their XP scaled so the habitat's weighted-average XP per find is what it
//     was, so Foraging XP per hour does not move, as 20260722080000 did.
//   • Acorns and Acorn Flour are switched off (is_active false), not deleted:
//     players may hold them, and an inactive item is off the museum and every
//     merchant's shelf.
//
// down() switches both back on. The drop tables are not put back: a re-add
// would be a balance change of its own.

const ITEMS = ['Acorns', 'Acorn Flour'];
const DROP = 'Acorns';

type Entry = { itemName: string; weight: number; xp?: number; [k: string]: unknown };

/** Weighted-average XP of one find. */
const avgXp = (entries: Entry[]) => {
    const w = entries.reduce((s, e) => s + Number(e.weight || 0), 0);
    return w ? entries.reduce((s, e) => s + Number(e.weight || 0) * Number(e.xp || 0), 0) / w : 0;
};

export async function up(knex: Knex): Promise<void> {
    // A fresh database before content:import (lib/migrationContent.ts).
    if (!(await hasContent(knex))) return;
    if (!(await knex('items').where({ name: DROP }).first())) throw new Error(`remove_acorns: no item named ${DROP}`);

    const habitats = await knex('foraging_habitats').select('id', 'name', 'drop_table');
    for (const h of habitats) {
        const table: Entry[] = typeof h.drop_table === 'string' ? JSON.parse(h.drop_table) : (h.drop_table ?? []);
        if (!Array.isArray(table) || !table.some(e => e.itemName === DROP)) continue;
        const kept = table.filter(e => e.itemName !== DROP);
        const before = avgXp(table);
        const after = avgXp(kept);
        const scale = after > 0 ? before / after : 1;
        const retuned = kept.map(e => (e.xp === undefined ? e : { ...e, xp: Math.max(1, Math.round(Number(e.xp) * scale)) }));
        await knex('foraging_habitats').where({ id: h.id }).update({ drop_table: JSON.stringify(retuned) });
    }

    await knex('items').whereIn('name', ITEMS).update({ is_active: false });
}

export async function down(knex: Knex): Promise<void> {
    await knex('items').whereIn('name', ITEMS).update({ is_active: true });
}
