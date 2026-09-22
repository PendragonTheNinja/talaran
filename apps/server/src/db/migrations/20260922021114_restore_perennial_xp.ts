import type { Knex } from 'knex';

/**
 * Put the perennials' XP back where it belongs, now that the rule is right.
 *
 * Strawberry and Raspberry were cut to a tenth of their seeded XP by hand on
 * live, as a stopgap: they paid full per-seed XP on every regrowth, forever, for
 * a seed sown once, and players only had to check back whenever they fruited.
 *
 * services/farming.ts now handles that properly — a perennial pays in full on
 * its first harvest and PERENNIAL_REGROWTH_SHARE of it on every regrowth after —
 * so the stopgap has to come off. Left in place under the new rule, a first
 * harvest would pay a tenth and every regrowth a fiftieth, and perennials would
 * be pointless to plant.
 *
 * Guarded, because the live values were set by hand rather than by a migration:
 *   - at the seeded value already     -> nothing to do
 *   - at roughly a tenth of it         -> restore
 *   - anything else                    -> someone tuned it deliberately; leave it
 *                                         alone and say so in the log
 */

const SEEDED: Record<string, number> = {
    Strawberry: 534,
    Raspberry: 622,
};

export async function up(knex: Knex): Promise<void> {
    for (const [name, seeded] of Object.entries(SEEDED)) {
        const crop = await knex('crops').where({ name }).first();
        if (!crop) {
            throw new Error(`restore_perennial_xp: no crop named "${name}". The farming content migration must run first.`);
        }

        const current = Number(crop.xp_per_seed);
        if (current === seeded) continue;

        const stopgap = Math.round(seeded / 10);
        if (Math.abs(current - stopgap) <= 1) {
            await knex('crops').where({ id: crop.id }).update({ xp_per_seed: seeded });
            continue;
        }

        // eslint-disable-next-line no-console
        console.warn(
            `restore_perennial_xp: ${name} is at ${current} XP per seed, which is neither `
            + `the seeded ${seeded} nor the stopgap ${stopgap}. Leaving it as set.`,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    // Restores the stopgap, since that is what this replaced.
    for (const [name, seeded] of Object.entries(SEEDED)) {
        await knex('crops')
            .where({ name, xp_per_seed: seeded })
            .update({ xp_per_seed: Math.round(seeded / 10) });
    }
}
