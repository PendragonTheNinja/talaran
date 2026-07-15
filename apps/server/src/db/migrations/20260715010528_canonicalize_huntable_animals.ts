import type { Knex } from 'knex';

// Triple duty:
//  1. Animals enter version control (they previously existed ONLY in the prod DB)
//  2. XP rebalance applied (docs/xp-rebalance.md, hunting cadence targets)
//  3. Trophy drops gain explicit notable flags (sparkle = data, not chance < 100)
// Insert-or-update by name: idempotent on prod, local, and fresh installs.

const ANIMALS = [
    {
        name: 'Deer', required_level: 1, base_timer: 65, min_timer: 40,
        base_catch_chance: 70, xp_success: 48, xp_failure: 19, is_active: true,
        drop_table: JSON.stringify([
            { itemName: 'Venison', min: 1, max: 2, chance: 100 },
            { itemName: 'Bones', min: 1, max: 2, chance: 60 },
            { itemName: 'Deerhide', min: 1, max: 1, chance: 40 },
            { itemName: 'Antler', min: 1, max: 1, chance: 0.33, notable: true },
        ]),
    },
    {
        name: 'Boar', required_level: 9, base_timer: 85, min_timer: 50,
        base_catch_chance: 60, xp_success: 83, xp_failure: 33, is_active: true,
        drop_table: JSON.stringify([
            { itemName: 'Boar Meat', min: 2, max: 3, chance: 100 },
            { itemName: 'Bones', min: 2, max: 3, chance: 60 },
            { itemName: 'Boarhide', min: 1, max: 1, chance: 45 },
            { itemName: 'Boar Tusk', min: 1, max: 1, chance: 0.33, notable: true },
        ]),
    },
    {
        name: 'Ground Sloth', required_level: 17, base_timer: 120, min_timer: 70,
        base_catch_chance: 55, xp_success: 147, xp_failure: 59, is_active: true,
        drop_table: JSON.stringify([
            { itemName: 'Sloth Meat', min: 3, max: 5, chance: 100 },
            { itemName: 'Bones', min: 3, max: 5, chance: 65 },
            { itemName: 'Slothhide', min: 1, max: 1, chance: 60 },
            { itemName: 'Sloth Claw', min: 1, max: 1, chance: 0.33, notable: true },
        ]),
    },
];

export async function up(knex: Knex): Promise<void> {
    for (const a of ANIMALS) {
        const existing = await knex('huntable_animals').where({ name: a.name }).first();
        if (existing) {
            // Live rows keep their location_id; we only canonicalize stats + drops
            await knex('huntable_animals').where({ id: existing.id }).update(a);
        } else {
            // Fresh install: resolve the location by name, loudly if missing
            const eldGrove = await knex('locations').where({ name: 'Eld Grove' }).first();
            if (!eldGrove) throw new Error('canonicalize_huntable_animals: Eld Grove location not found');
            await knex('huntable_animals').insert({ ...a, location_id: eldGrove.id });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    // Revert the XP rebalance only (notable flags and structure stay)
    await knex('huntable_animals').where({ name: 'Deer' }).update({ xp_success: 52, xp_failure: 21 });
    await knex('huntable_animals').where({ name: 'Boar' }).update({ xp_success: 90, xp_failure: 36 });
    await knex('huntable_animals').where({ name: 'Ground Sloth' }).update({ xp_success: 200, xp_failure: 80 });
}