import type { Knex } from 'knex';

// 'Arrow Shaft' was seeded as an unused placeholder; 'Lanai Arrow Shafts' was
// then added by migration without checking — my error. Shafts are wood-specific
// (Hatch/Bearn/Mirrith/Craxial shafts will feed tier 2-5 bows), so the Lanai
// name wins and the generic placeholder merges into it.

export async function up(knex: Knex): Promise<void> {
    const old = await knex('items').where({ name: 'Arrow Shaft' }).first();
    if (!old) return;

    const target = await knex('items').where({ name: 'Lanai Arrow Shafts' }).first();
    if (!target) {
        await knex('items').where({ id: old.id }).update({ name: 'Lanai Arrow Shafts' });
        return;
    }

    // Both exist: repoint anything held, then retire the placeholder (FKs cascade)
    const held = await knex('player_inventory').where({ item_id: old.id });
    for (const row of held) {
        const existing = await knex('player_inventory')
            .where({ player_id: row.player_id, item_id: target.id }).first();
        if (existing) {
            await knex('player_inventory').where({ id: existing.id }).increment('quantity', row.quantity);
            await knex('player_inventory').where({ id: row.id }).delete();
        } else {
            await knex('player_inventory').where({ id: row.id }).update({ item_id: target.id });
        }
    }
    await knex('ground_items').where({ item_id: old.id }).update({ item_id: target.id });
    await knex('items').where({ id: old.id }).delete();
}

export async function down(knex: Knex): Promise<void> {
    // One-way merge: quantities can't be un-summed.
}