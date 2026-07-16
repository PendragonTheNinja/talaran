import type { Knex } from 'knex';

// "Tanner's Scraps" was an alpha-era placeholder for leather strips. Both names
// ended up existing locally, so merge rather than rename: move held quantities
// and ground items onto Leather Strips, then retire the placeholder.
// No-ops cleanly where only one of the two exists (prod, fresh installs).

export async function up(knex: Knex): Promise<void> {
    const scraps = await knex('items').where({ name: "Tanner's Scraps" }).first();
    if (!scraps) return;

    const strips = await knex('items').where({ name: 'Leather Strips' }).first();
    if (!strips) {
        await knex('items').where({ id: scraps.id }).update({ name: 'Leather Strips' });
        return;
    }

    // Merge inventories (every FK to items is CASCADE — repoint before deleting)
    const held = await knex('player_inventory').where({ item_id: scraps.id });
    for (const row of held) {
        const existing = await knex('player_inventory')
            .where({ player_id: row.player_id, item_id: strips.id }).first();
        if (existing) {
            await knex('player_inventory').where({ id: existing.id }).increment('quantity', row.quantity);
            await knex('player_inventory').where({ id: row.id }).delete();
        } else {
            await knex('player_inventory').where({ id: row.id }).update({ item_id: strips.id });
        }
    }

    await knex('ground_items').where({ item_id: scraps.id }).update({ item_id: strips.id });
    await knex('items').where({ id: scraps.id }).delete();
}

export async function down(knex: Knex): Promise<void> {
    // One-way merge: quantities can't be un-summed. Deliberately a no-op.
}