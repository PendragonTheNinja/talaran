import type { Knex } from 'knex';

// Three fixes.
//
// 1. The gloves recipe. `20260721040000` deletes it, but that deletion was added to
//    the file *after* the migration had already run on some databases — the same
//    in-place edit that lost the habitat scene text. The scene-text half was
//    repaired in `20260722040000`; this is the half that was missed. Gloves stay
//    unavailable until Husbandry leather exists.
//
// 2. A 20-second floor on action timers. Only Cut Granite Block sat below it (15s).
//    Per-unit timers (seconds per seed, per plot) are exempt by design.
//
// 3. Band-correct XP on the tool and material recipes. These were set by eye rather
//    than through the §4 policy recipe, and drifted in both directions: the plain
//    materials paid roughly double their band, while every finished tool paid well
//    under. Policies applied — crafting finished goods ×1.8, intermediates ×0.6 of
//    that. The farming and linen chains were already tuned to band and are untouched.

const FIXES: { name: string; timer_seconds: number; xp: number }[] = [
    // intermediates (feed other recipes)
    { name: 'Cut Granite Block', timer_seconds: 20, xp: 13 },
    { name: 'Hammer Ambren Nails', timer_seconds: 20, xp: 13 },
    { name: 'Build Fence Panel', timer_seconds: 20, xp: 13 },
    // finished goods (tools a player uses)
    { name: 'Raise a Bucket', timer_seconds: 20, xp: 22 },
    { name: 'Forge Ambren Hoe', timer_seconds: 45, xp: 50 },
    { name: 'Forge Ambren Foraging Knife', timer_seconds: 45, xp: 50 },
    { name: 'Weave Foraging Basket', timer_seconds: 60, xp: 66 },
];

export async function up(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Stitch Buckskin Foraging Gloves' }).delete();

    for (const f of FIXES) {
        await knex('recipes')
            .where({ name: f.name })
            .update({ timer_seconds: f.timer_seconds, xp: f.xp });
    }
}

export async function down(): Promise<void> {
    // No-op: the prior values were unbalanced first cuts, and the gloves recipe was
    // always meant to be gone.
}
