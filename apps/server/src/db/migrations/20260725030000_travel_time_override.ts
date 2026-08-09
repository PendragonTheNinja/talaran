import type { Knex } from 'knex';

// Admin Horse: a mount that makes every journey take 1 second.
//
// travel_speed_modifier alone cannot do this. computeTravelTime clamps to
// TRAVEL_FLOOR (10% of base), so even a modifier of 0 leaves a long route at a
// tenth of its base time rather than a flat second. So mounts gain an optional
// travel_time_override: when set, computeTravelTime returns it directly and
// skips the floor.
//
// The floor is deliberate design — ordinary gear and levels must never
// trivialise the map — so this is an explicit escape hatch, not a loosening of
// it. Nothing obtainable in game sets the column.
//
// The item is created with is_active: false so it cannot surface in shops,
// drops, or recipes. Grant it from the admin panel; equipping works regardless.

const ADMIN_HORSE = 'Admin Horse';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('items', table => {
        // Seconds. Null for every normal item.
        table.integer('travel_time_override').nullable();
    });

    if (await knex('items').where({ name: ADMIN_HORSE }).first()) return;

    // FRESH-INSTALL GUARD (CLAUDE.md §6). travel_speed_modifier is created by
    // 20260731120000_travel_curve_floor.ts, a LATER filename than this one. On
    // live that never mattered because migrations ran piecemeal in authoring
    // order; on a fresh database this insert ran before the column existed and
    // killed the whole install. The horse takes the modifier only when the
    // column already exists; otherwise the later migration's default (1.0)
    // applies, which is fine, since travel_time_override is what actually moves
    // this horse.
    const hasSpeedColumn = await knex.schema.hasColumn('items', 'travel_speed_modifier');
    const horse: Record<string, unknown> = {
        name: ADMIN_HORSE,
        type: 'mount',
        subtype: 'horse',
        tier: 0,
        quality: null,
        slot: 'mount',
        level_required: 1,
        travel_time_override: 1,
        stackable: false,
        is_active: false,
        description:
            'A horse of impossible temperament, saddled for those who built the roads. '
            + 'It does not so much travel as arrive.',
    };
    if (hasSpeedColumn) horse.travel_speed_modifier = 0.01;   // cosmetic; the override is what applies

    await knex('items').insert(horse);
}

export async function down(knex: Knex): Promise<void> {
    const horse = await knex('items').where({ name: ADMIN_HORSE }).first();

    if (horse) {
        // Unequip before deleting, or player_equipment keeps a dangling mount id.
        await knex('player_equipment')
            .where({ mount_item_id: horse.id })
            .update({ mount_item_id: null });
        await knex('player_inventory').where({ item_id: horse.id }).delete();
        await knex('items').where({ id: horse.id }).delete();
    }

    await knex.schema.alterTable('items', table => {
        table.dropColumn('travel_time_override');
    });
}
