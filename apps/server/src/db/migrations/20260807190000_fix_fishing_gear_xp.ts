import type { Knex } from 'knex';

// Two of the three fishing gear recipes were priced off STALE numbers.
//
// When 20260807143255 was written, its XP values were copied from the nearest
// sibling recipes as they appear in their ORIGINAL seed migrations. But
// 20260723060000_recipe_timer_floor_and_xp.ts had already rebalanced those
// siblings, and a migration's source file is not the live value: knex tracks by
// filename, so the last migration to touch a row wins and the earlier file still
// reads the way it always did.
//
//   Hammer Ambren Nails    seed said xp 25   live value is 13   (intermediate)
//   Weave Foraging Basket  seed said xp 40   live value is 66   (finished good)
//
// So the hook was paying roughly double its band and the net roughly two thirds
// of its own, in opposite directions, from the same mistake.
//
// Per docs/xp-rebalance.md §4: crafting finished goods x1.8 of band,
// intermediates x0.6 of that. Band at level 1 is 2,200 xp/hr, so finished goods
// target 3,960 xp/hr and intermediates 2,376 xp/hr.
//
//   Forge Ambren Hooks   20s intermediate    2,376 x 20/3600  = 13
//   Weave Fishing Net    90s finished good   3,960 x 90/3600  = 99
//
// Assemble Ambren Fishing Rod is already correct: 66 XP over 60s is 3,960 xp/hr,
// which matches the rebalanced basket exactly. It is left alone.

const FIXES: { name: string; xp: number }[] = [
    { name: 'Forge Ambren Hooks', xp: 13 },
    { name: 'Weave Fishing Net', xp: 99 },
];

export async function up(knex: Knex): Promise<void> {
    for (const fix of FIXES) {
        const updated = await knex('recipes').where({ name: fix.name }).update({ xp: fix.xp });
        if (!updated) {
            throw new Error(`fix_fishing_gear_xp: no recipe named '${fix.name}'`);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    // The values as originally shipped, wrong though they were.
    await knex('recipes').where({ name: 'Forge Ambren Hooks' }).update({ xp: 25 });
    await knex('recipes').where({ name: 'Weave Fishing Net' }).update({ xp: 60 });
}
