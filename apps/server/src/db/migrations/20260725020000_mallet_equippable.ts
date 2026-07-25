import type { Knex } from 'knex';

// The Lanai Mallet becomes a mainhand tool.
//
// It shipped with slot: null in both 20260723070000 and 20260723090000, so
// routes/equipment.ts rejected it outright ("This item cannot be equipped").
// Farmstead and plot building checked for it in inventory instead. Building is
// now an equipped-tool action, matching the hoe on tilling and the foraging
// knife/gloves/basket conversion.
//
// Nathan already set this by hand on his local database; this carries it to
// production. Written idempotently so re-running is harmless.

const MALLET = 'Lanai Mallet';

export async function up(knex: Knex): Promise<void> {
    const mallet = await knex('items').where({ name: MALLET }).first();
    if (!mallet) throw new Error(`mallet_equippable: item "${MALLET}" not found`);

    await knex('items').where({ id: mallet.id }).update({ slot: 'mainhand' });
}

export async function down(knex: Knex): Promise<void> {
    const mallet = await knex('items').where({ name: MALLET }).first();
    if (!mallet) return;

    // Unequip first, or anyone holding one is left with an item in mainhand that
    // the equip route will refuse to take back off.
    const holders = await knex('player_equipment').where({ mainhand_item_id: mallet.id });

    for (const eq of holders) {
        const inv = await knex('player_inventory')
            .where({ player_id: eq.player_id, item_id: mallet.id })
            .first();

        if (inv) {
            await knex('player_inventory').where({ id: inv.id }).increment('quantity', 1);
        } else {
            await knex('player_inventory').insert({
                player_id: eq.player_id,
                item_id: mallet.id,
                quantity: 1,
            });
        }

        await knex('player_equipment')
            .where({ player_id: eq.player_id })
            .update({ mainhand_item_id: null });
    }

    await knex('items').where({ id: mallet.id }).update({ slot: null });
}
