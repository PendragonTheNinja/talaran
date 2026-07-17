import type { Knex } from 'knex';

// Crafting goes live. It's been banking XP invisibly since tanning shipped —
// every hide tanned and snare tied during testing reveals on this flip.
// Launching with the leather line only (tan x3 passive, cut strips, tie snare);
// gems and finery are deferred until they have a purpose (docs/crafting-launch-spec.md).
// is_implemented gates the skills list (routes/player.ts) and highscores — the
// reveal is automatic, no client work.

export async function up(knex: Knex): Promise<void> {
    const updated = await knex('skills').where({ name: 'Crafting' }).update({
        is_implemented: true,
        description: 'Tan hides and work leather, cordage, and fine goods from raw materials.',
    });
    if (updated === 0) throw new Error('launch_crafting_skill: Crafting skill row not found');
}

export async function down(knex: Knex): Promise<void> {
    await knex('skills').where({ name: 'Crafting' }).update({
        is_implemented: false,
        description: 'Create armor, jewelry, and goods from raw materials.',
    });
}