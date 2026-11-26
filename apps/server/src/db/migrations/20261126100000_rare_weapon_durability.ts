import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Rare weapons last a long while (Nathan, 2026-11-26). The Hodag Horn and its
// two Taiar siblings were meant to be at 5,000 sure uses, set once through the
// admin content browser, but live still held 2,000 (the 2026-11-10 export, and
// a player's Wearsight readings after a few hundred kills): a farmer working
// toward the next rare weapon with the last one wore out most of it. As a
// migration it cannot go missing.
//
// Antura's three follow the gear durability ladder (durability_tiers: tier 2
// is 1.25 times tier 1's sure uses and 0.85 times its break chance after).

const WEAPONS: { name: string; uses: number; breakPct: number }[] = [
    { name: 'Hodag Horn', uses: 5000, breakPct: 0.2 },
    { name: "Wrecker's Cutlass", uses: 5000, breakPct: 0.2 },
    { name: "Gouger's Legbone", uses: 5000, breakPct: 0.2 },
    { name: 'Eagle Talons', uses: 6250, breakPct: 0.17 },
    { name: "Reaver's Dane Axe", uses: 6250, breakPct: 0.17 },
    { name: 'Dripstone Cudgel', uses: 6250, breakPct: 0.17 },
];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const w of WEAPONS) {
        const n = await knex('items').where({ name: w.name }).update({ durability_uses: w.uses, durability_break_pct: w.breakPct });
        if (n !== 1) throw new Error(`rare_weapon_durability: no item named ${w.name}`);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    for (const w of WEAPONS) {
        await knex('items').where({ name: w.name }).update({ durability_uses: 2000, durability_break_pct: 0.2 });
    }
}
