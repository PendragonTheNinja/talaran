import type { Knex } from 'knex';

// Repair: the scene_text column + its flavour lines were added to migration
// 20260721040000 *after* that migration had already run on some databases, so
// Knex never re-executed it and those DBs have no per-habitat scene text (the
// client falls back to a generic line). This adds the column if it's missing and
// (re)populates the lines. Safe to run regardless of prior state.

const SCENE_TEXT: Record<string, string> = {
    'Sunlit Meadow': 'You move through a sunlit meadow, gathering as you go.',
    'Forest Floor': 'You forage across the shaded forest floor, turning the leaf-litter as you go.',
    'Creekbank': 'You work along the creekbank, gathering among the reeds and water-herbs.',
    'Bramble Thicket': 'You pick your way through a bramble thicket, gathering what you can reach.',
};

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('foraging_habitats', 'scene_text'))) {
        await knex.schema.alterTable('foraging_habitats', (t) => {
            t.string('scene_text', 300).nullable();
        });
    }

    for (const [name, text] of Object.entries(SCENE_TEXT)) {
        await knex('foraging_habitats').where({ name }).update({ scene_text: text });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('foraging_habitats')
        .whereIn('name', Object.keys(SCENE_TEXT))
        .update({ scene_text: null });
}
