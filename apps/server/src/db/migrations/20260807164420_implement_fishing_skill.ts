import type { Knex } from 'knex';

// Fishing was seeded long before it was built, so its skills row still carries
// the default is_implemented = false. That flag gates the skills panel
// (routes/player.ts) and the highscores, so until it flips, Fishing XP is real
// and stored but completely invisible: the skill does not appear in the list at
// all, and a player cutting bait sees only the Crafting line move.
//
// Same shape as 20260731150000_implement_husbandry_skill.ts.

export async function up(knex: Knex): Promise<void> {
    const updated = await knex('skills').where({ name: 'Fishing' }).update({ is_implemented: true });
    if (!updated) throw new Error('implement_fishing_skill: no skills row named Fishing');
}

export async function down(knex: Knex): Promise<void> {
    await knex('skills').where({ name: 'Fishing' }).update({ is_implemented: false });
}
