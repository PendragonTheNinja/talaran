import type { Knex } from 'knex';

// Bait for traps, drawn from the SAME pouch fishing already uses.
//
// The problem: a snare picks from a weighted table and that is the whole story.
// Nesting Hen sits at weight 90 of 1135, about eight percent, and no amount of
// skill or intent moves it. Husbandry needs those Chicks, which makes a dice
// roll a prerequisite for an entire trade.
//
// Bait turns waiting into aiming. A baited snare multiplies its target's weight
// by BAIT_WEIGHT_MULT and leaves everything else alone, so you still catch other
// things, you simply catch far more of what you came for:
//
//   Nesting Hen   7.9% -> 40.8%      Wild Sow   4.0% -> 24.8%
//   Squonk        0.4% ->  3.4%      grain narrows to rabbit and pheasant
//
// NO NEW ITEMS. bait_values already maps ordinary food to five categories, and
// player_bait is already a pouch players fill by breaking things down. Trapping
// reuses both. The three animals anyone actually chases each get a category to
// themselves; grain is shared by the two commons, which is fine, because baiting
// grain is really a way of excluding the rest.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('trap_targets', 'bait_category'))) {
        await knex.schema.alterTable('trap_targets', (t) => {
            // One of BAIT_CATEGORIES in services/fishing.ts. Null means this
            // target cannot be aimed at, which is a valid thing to be.
            t.string('bait_category', 20).nullable();
        });
    }

    if (!(await knex.schema.hasColumn('player_traps', 'bait_category'))) {
        await knex.schema.alterTable('player_traps', (t) => {
            // Recorded on the trap, not the player: bait is spent when the snare
            // is set and belongs to that snare from then on.
            t.string('bait_category', 20).nullable();
        });
    }

    const pairs: Array<[string, string]> = [
        ['Rabbit', 'grain'],
        ['Pheasant', 'grain'],
        // Not hunger. A broody hen is looking for somewhere to sit, and decoy
        // eggs are how you persuade one for real.
        ['Nesting Hen', 'egg'],
        // Omnivore, and not a fussy one. She will come to carrion.
        ['Wild Sow', 'meat'],
        ['Squonk', 'spawn'],
    ];

    for (const [target, category] of pairs) {
        await knex('trap_targets').where({ name: target }).update({ bait_category: category });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('player_traps', 'bait_category')) {
        await knex.schema.alterTable('player_traps', (t) => t.dropColumn('bait_category'));
    }
    if (await knex.schema.hasColumn('trap_targets', 'bait_category')) {
        await knex.schema.alterTable('trap_targets', (t) => t.dropColumn('bait_category'));
    }
}
