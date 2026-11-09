import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The saw is held, not socketed (Nathan, 2026-11-09). Sawing logs and every
// carpentry recipe that names 'saw' in required_tools now want a saw in hand,
// at your own workshop and at Geossica's bench alike (services/workstations.ts
// HAND_HELD_BENCH_TOOLS, services/carpentry.ts canSawHere). The Ambren Saw is
// on a merchant shelf, so the circularity rule holds without a lent one.
//
//   - The carpentry bench loses its Saw slot, so a Sawhorse (required) and a
//     Plane (optional) are the whole bench.
//   - Every saw sitting in a Saw slot goes back to its owner's pack, one each.
//     A saw that had given out (broken_at) is gone, as it would be on clearing.
//   - is_active is worked out again for every carpentry bench: a sawhorse is
//     now enough to make it complete.
//   - The saw's description no longer calls it part of a workstation.
//
// down() puts the slot type back. It does not take saws out of packs again.

const SAW_SLOT = {
    station_type: 'carpentry', slot: 'saw', label: 'Saw', capacity: 1, accepts_subtype: null,
    accepts_names: JSON.stringify(['Ambren Saw']), is_required: true, display_order: 2,
};

export async function up(knex: Knex): Promise<void> {
    // Saws in Saw slots back to their owners, as one statement each way.
    await knex.raw(`
        INSERT INTO player_inventory (player_id, item_id, quantity)
        SELECT w.player_id, i.id, count(*)::int
          FROM workstation_slots s
          JOIN workstations w ON w.id = s.workstation_id
          JOIN items i ON i.name = s.item_name
         WHERE w.type = 'carpentry' AND s.slot = 'saw' AND s.broken_at IS NULL
         GROUP BY w.player_id, i.id
        ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = player_inventory.quantity + EXCLUDED.quantity`);
    await knex('workstation_slots')
        .whereIn('workstation_id', knex('workstations').where({ type: 'carpentry' }).select('id'))
        .where({ slot: 'saw' })
        .delete();
    await knex('workstation_slot_types').where({ station_type: 'carpentry', slot: 'saw' }).delete();

    // Complete when every slot still required is filled (refreshActiveWithin's rule).
    await knex.raw(`
        UPDATE workstations w
           SET is_active = NOT EXISTS (
               SELECT 1 FROM workstation_slot_types t
                WHERE t.station_type = 'carpentry' AND t.is_required
                  AND NOT EXISTS (SELECT 1 FROM workstation_slots s WHERE s.workstation_id = w.id AND s.slot = t.slot))
         WHERE w.type = 'carpentry' AND w.expires_at IS NULL`);

    if (!(await hasContent(knex))) return;
    await knex('items').where({ name: 'Ambren Saw' })
        .update({ description: 'A saw with an Ambren blade and a Lanai handle. Carried in the off hand, and wanted for every plank.' });
}

export async function down(knex: Knex): Promise<void> {
    const have = await knex('workstation_slot_types').where({ station_type: 'carpentry', slot: 'saw' }).first();
    if (!have) {
        const cols = await knex('workstation_slot_types').columnInfo();
        const row: Record<string, unknown> = { ...SAW_SLOT };
        if ('wears' in cols) row.wears = true;
        await knex('workstation_slot_types').insert(row);
    }
    await knex.raw(`
        UPDATE workstations w
           SET is_active = NOT EXISTS (
               SELECT 1 FROM workstation_slot_types t
                WHERE t.station_type = 'carpentry' AND t.is_required
                  AND NOT EXISTS (SELECT 1 FROM workstation_slots s WHERE s.workstation_id = w.id AND s.slot = t.slot))
         WHERE w.type = 'carpentry' AND w.expires_at IS NULL`);
}
