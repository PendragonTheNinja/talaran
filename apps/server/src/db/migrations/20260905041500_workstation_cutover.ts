import type { Knex } from 'knex';

/**
 * Workstation cutover.
 *
 * Retires the hardcoded has_anvil/has_hammer/has_tongs/has_bucket booleans now
 * that tools live in workstation_slots.
 *
 * Existing players get their tools back in the pack rather than having them
 * auto-socketed. Auto-socketing would mean minting items from a boolean, and a
 * player who set up a bench months ago may not want the same three tools in it
 * now. One re-socket is a small, one-time cost and it is the honest option.
 *
 * The workstation rows themselves are deleted, so a bench comes back into being
 * when its first tool is fitted. is_active would otherwise stay true on a
 * station holding nothing, which reads as working and is not.
 */

// What each station type consumed under the old setup flow.
const LEGACY_TOOLS: Record<string, string[]> = {
    smithing: ['Ambren Anvil', 'Ambren Hammer', 'Ambren Tongs'],
    carpentry: ['Lanai Sawhorse', 'Ambren Saw', 'Ambren Plane'],
};

export async function up(knex: Knex): Promise<void> {
    const stations = await knex('workstations').select('id', 'player_id', 'type');

    for (const station of stations) {
        const tools = LEGACY_TOOLS[station.type];
        if (!tools) continue;

        // Anything already socketed came from the new flow and is left alone.
        const socketed = await knex('workstation_slots')
            .where({ workstation_id: station.id })
            .select('item_name');
        if (socketed.length > 0) continue;

        for (const name of tools) {
            const item = await knex('items').where({ name }).first();
            if (!item) continue;

            const existing = await knex('player_inventory')
                .where({ player_id: station.player_id, item_id: item.id })
                .first();

            if (existing) {
                await knex('player_inventory').where({ id: existing.id }).increment('quantity', 1);
            } else {
                await knex('player_inventory').insert({
                    player_id: station.player_id,
                    item_id: item.id,
                    quantity: 1,
                });
            }
        }
    }

    // Slots cascade with the row. Only legacy types are cleared: an apiary or a
    // cookhouse built through the new flow has no tools to hand back and must
    // survive this.
    await knex('workstations').whereIn('type', Object.keys(LEGACY_TOOLS)).delete();

    await knex.schema.alterTable('workstations', (t) => {
        t.dropColumn('has_anvil');
        t.dropColumn('has_hammer');
        t.dropColumn('has_tongs');
        t.dropColumn('has_bucket');
    });
}

export async function down(knex: Knex): Promise<void> {
    // The columns come back, but the deleted stations do not: their tools are in
    // players' packs now and re-creating the rows would duplicate them.
    await knex.schema.alterTable('workstations', (t) => {
        t.boolean('has_anvil').defaultTo(false);
        t.boolean('has_hammer').defaultTo(false);
        t.boolean('has_tongs').defaultTo(false);
        t.boolean('has_bucket').defaultTo(false);
    });
}
