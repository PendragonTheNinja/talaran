import type { Knex } from 'knex';

// The travel curve moved from "subtract a flat share of base per level, then
// clamp at 10%" to an asymptotic approach (see services/travel.ts). A mount now
// carries two numbers instead of one:
//
//   travel_speed_modifier — where it starts, at Equitation 0
//   travel_floor          — what it approaches as Equitation rises, never crossed
//
// Also repairs schema drift: travel_speed_modifier was inserted by seeds and read
// by services/travel.ts but created by no migration, so it existed only in prod
// and in local databases. A fresh database would have failed on the item seed.

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'travel_speed_modifier'))) {
        await knex.schema.alterTable('items', (t) => {
            t.float('travel_speed_modifier').notNullable().defaultTo(1.0);
        });
    }

    if (!(await knex.schema.hasColumn('items', 'travel_floor'))) {
        await knex.schema.alterTable('items', (t) => {
            // null = not a mount, or a mount that never improves.
            t.float('travel_floor').nullable();
        });
    }

    // Novice's Pony: a free starter mount should be outgrown. It begins at 65%
    // of journey time and settles at 40%, which a trained runner on foot beats.
    const pony = await knex('items').where({ name: "Novice's Pony" }).first();
    if (!pony) throw new Error("Novice's Pony not found — item seed has not run");
    await knex('items')
        .where({ id: pony.id })
        .update({ travel_speed_modifier: 0.65, travel_floor: 0.40 });

    // Admin Horse bypasses the curve through travel_time_override; its floor is
    // cosmetic, but leaving it null would read as "no floor set" in the manual.
    await knex('items')
        .whereNotNull('travel_time_override')
        .update({ travel_floor: 0.01 });
}

export async function down(knex: Knex): Promise<void> {
    await knex('items')
        .where({ name: "Novice's Pony" })
        .update({ travel_speed_modifier: 0.50 });

    if (await knex.schema.hasColumn('items', 'travel_floor')) {
        await knex.schema.alterTable('items', (t) => t.dropColumn('travel_floor'));
    }

    // travel_speed_modifier is deliberately not dropped: it predates this
    // migration everywhere it currently exists, and dropping it would take
    // the Novice's Pony and Admin Horse down with it.
}
