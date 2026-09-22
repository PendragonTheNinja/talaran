import type { Knex } from 'knex';

/**
 * Calves turn up twice as often. Foals do not.
 *
 * A calf was a flat 1.5% per hunt: about 67 hunts expected for one, 200 for a
 * full paddock of three, and nothing a player could do to improve the odds.
 * Every dairy product in the game sits behind that roll — milk, then butter and
 * cheese, then every provision that needs them — so the longest chain in
 * Talaran was gated on variance rather than on effort.
 *
 * 3% halves the expected hunts, and services/hunting.ts now scales calf finds
 * with Husbandry level on top (3% per level above 9, capped at double), so a
 * stockman who knows cattle reaches roughly 6% and a full paddock in a quarter
 * of the hunts it used to take.
 *
 * Foals are deliberately untouched: a horse should stay a rare thing to happen
 * upon, and the Rouncey and Palfrey tiers are doing what they were designed to.
 *
 * Drop tables are JSON on huntable_animals, so this rewrites the Calf entry in
 * place and leaves every other entry in the table exactly as it is.
 */

const CALF = 'Calf';
const FROM_CHANCE = 1.5;
const TO_CHANCE = 3;

async function setCalfChance(knex: Knex, to: number, from: number): Promise<number> {
    const animals = await knex('huntable_animals').select('id', 'name', 'drop_table');
    let changed = 0;

    for (const animal of animals) {
        let table: any[];
        try {
            table = typeof animal.drop_table === 'string'
                ? JSON.parse(animal.drop_table)
                : animal.drop_table;
        } catch {
            continue;
        }
        if (!Array.isArray(table)) continue;

        let touched = false;
        for (const entry of table) {
            // Only move it if it is where we left it: a chance that has been
            // hand-tuned since is somebody's decision, not drift to correct.
            if (entry?.itemName === CALF && Number(entry.chance) === from) {
                entry.chance = to;
                touched = true;
            }
        }
        if (!touched) continue;

        await knex('huntable_animals')
            .where({ id: animal.id })
            .update({ drop_table: JSON.stringify(table) });
        changed++;
    }
    return changed;
}

export async function up(knex: Knex): Promise<void> {
    const changed = await setCalfChance(knex, TO_CHANCE, FROM_CHANCE);
    if (changed === 0) {
        throw new Error(
            'calf_find_chance: no hunt table had a Calf entry at 1.5%. '
            + 'The husbandry sources migration must run first, or the chance has '
            + 'already been tuned by hand — check before forcing this through.',
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await setCalfChance(knex, FROM_CHANCE, TO_CHANCE);
}
