import type { Knex } from 'knex';

// Bootstrap fix. The wild economy was gated on itself: feathers <- trapping <-
// snare <- leather <- tanning rack (Carpentry 5) <- 6h soak, while 100 starter
// arrows burn in ~5 hours. New players hit "no arrows" with a seven-skill,
// two-quest, six-hour path out.
//  - Trapping unlocks at Hunting 1: it's the passive lane, and the snare was
//    always the real gate. Gating the passive mode behind the active one is backwards.
//  - Tanning Rack drops to Carpentry 1, matching Lanai Sawhorse — stations are
//    level 1 in this codebase.
// Starter snares (auth.ts) are the other half of this fix.

export async function up(knex: Knex): Promise<void> {
    await knex('trap_types').where({ name: 'Snare' }).update({ required_level: 1 });
    await knex('recipes').where({ name: 'Build Tanning Rack' }).update({ required_level: 1 });
}

export async function down(knex: Knex): Promise<void> {
    await knex('trap_types').where({ name: 'Snare' }).update({ required_level: 5 });
    await knex('recipes').where({ name: 'Build Tanning Rack' }).update({ required_level: 5 });
}