import type { Knex } from 'knex';

// The Oxford comma, everywhere (Nathan, 2026-11-13): "A, B, and C", never
// "A, B and C". Each line below is a list found in the game's content that
// lacked it, replaced as an exact phrase wherever it stands, so a row edited
// on live since is still corrected and nothing else in it is touched. Lists
// the game builds itself go through listWords (lib/listWords.ts).

const FIXES: [table: string, column: string, from: string, to: string][] = [
    ['skills', 'description', 'with blade, spear or hammer', 'with blade, spear, or hammer'],
    ['items', 'description', 'for paring, slicing and fine work', 'for paring, slicing, and fine work'],
    ['items', 'description', 'Coarse, dry and filling', 'Coarse, dry, and filling'],
    ['items', 'description', 'Dark, heavy and sticky', 'Dark, heavy, and sticky'],
    ['items', 'description', 'Bread, cheese and a raw onion', 'Bread, cheese, and a raw onion'],
    ['items', 'description', 'Dense, sweet and slow to stale', 'Dense, sweet, and slow to stale'],
    ['items', 'description', 'Split, buttered and pressed back together', 'Split, buttered, and pressed back together'],
    ['items', 'description', 'folded small and pressed into a seam', 'folded small, and pressed into a seam'],
    ['creatures', 'description', 'Slow, stubborn and hard to hurt', 'Slow, stubborn, and hard to hurt'],
    ['creatures', 'description', 'spines down its back and a grin full of teeth', 'spines down its back, and a grin full of teeth'],
    ['fighting_spots', 'description', 'Barns, ricks and the stubble', 'Barns, ricks, and the stubble'],
    ['recipes', 'flavor_text', 'You cut, stitch and turn them', 'You cut, stitch, and turn them'],
    ['recipes', 'flavor_text', 'hang the heddles and set the beam', 'hang the heddles, and set the beam'],
    ['container_types', 'empty_text', 'Twigs, moss and a little down.', 'Twigs, moss, and a little down.'],
    ['museum_exhibits', 'name', 'Hide, Bone and Feather', 'Hide, Bone, and Feather'],
    ['museum_exhibits', 'description', 'the rivers and the cold water', 'the rivers, and the cold water'],
    ['museum_exhibits', 'description', 'the woods and the wet ground', 'the woods, and the wet ground'],
    ['museum_exhibits', 'description', 'Sown, raised and brought in', 'Sown, raised, and brought in'],
    ['museum_exhibits', 'description', "Meat, stores and the kitchen's work", "Meat, stores, and the kitchen's work"],
    ['museum_exhibits', 'description', 'knives, nets and racks', 'knives, nets, and racks'],
    ['museum_exhibits', 'description', 'Keepsakes, oddments and the things', 'Keepsakes, oddments, and the things'],
    ['spells', 'description', 'what you carry or the tools', 'what you carry, or the tools'],
];

async function replaceAll(knex: Knex, from: number, to: number): Promise<void> {
    for (const fix of FIXES) {
        const [table, column] = fix;
        if (!(await knex.schema.hasColumn(table, column))) continue;
        await knex.raw(`UPDATE ?? SET ?? = replace(??, ?, ?) WHERE strpos(??, ?) > 0`,
            [table, column, column, fix[from], fix[to], column, fix[from]]);
    }
}

export async function up(knex: Knex): Promise<void> {
    await replaceAll(knex, 2, 3);
}

export async function down(knex: Knex): Promise<void> {
    await replaceAll(knex, 3, 2);
}
