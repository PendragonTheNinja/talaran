import type { Knex } from 'knex';

/**
 * The hearth is built, not carried.
 *
 * An anvil is a lump of iron bedded onto a stump, and a pack can plausibly hold
 * one. A hearth is mortared stone with a flue through the roof. Nobody picks
 * that up and walks off with it, and letting a player unsocket one and carry it
 * to the next island was the one place the workstation system was lying.
 *
 * So it stops being a tool slot and becomes a structure:
 *
 *   - Granite Hearth, the item and its recipe, are gone.
 *   - The cooking/hearth SLOT is gone. Seven tools remain, all genuinely kit.
 *   - The workstation ROW is the hearth. Building one is what creates it.
 *
 * This also closes a hole that was live: checkStation only ever asked whether
 * THIS RECIPE's tools were present, and the row was created by socketing
 * anything at all. A player with a cauldron and no fire could cook a pottage at
 * full speed. Now the row cannot exist until the fire does.
 *
 * Phoenwick only, for now. Every location houses at least one trade, and
 * cooking beyond a raw fish over a campfire is Phoenwick's.
 */

export async function up(knex: Knex): Promise<void> {
    await knex('recipes').where({ name: 'Granite Hearth' }).delete();
    await knex('items').where({ name: 'Granite Hearth' }).delete();

    // Any hearth already socketed goes back to being nothing. The workstation
    // row survives: whoever socketed one has, in effect, already built it.
    await knex('workstation_slots').where({ slot: 'hearth' }).delete();
    await knex('workstation_slot_types').where({ station_type: 'cooking', slot: 'hearth' }).delete();

    // With the hearth gone, no cooking slot is required for the bench to
    // function: the bench IS the hearth, and the rest are optional tools.
    await knex('workstation_slot_types')
        .where({ station_type: 'cooking' })
        .update({ is_required: false });
}

export async function down(knex: Knex): Promise<void> {
    const existing = await knex('workstation_slot_types')
        .where({ station_type: 'cooking', slot: 'hearth' }).first();
    if (!existing) {
        await knex('workstation_slot_types').insert({
            station_type: 'cooking',
            slot: 'hearth',
            label: 'Hearth',
            capacity: 1,
            accepts_subtype: 'hearth',
            accepts_names: null,
            is_required: true,
            display_order: 1,
        });
    }

    const item = await knex('items').where({ name: 'Granite Hearth' }).first();
    if (!item) {
        await knex('items').insert({
            name: 'Granite Hearth',
            type: 'tool',
            subtype: 'hearth',
            tier: 1,
            level_required: 1,
            description: 'A ring of dressed granite and a flue, built to hold a working fire.',
            is_active: true,
        });
    }
}
