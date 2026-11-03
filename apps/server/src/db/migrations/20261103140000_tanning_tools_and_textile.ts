import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Two stations onto the tool-slot system (forum, 2026-11-03; Nathan):
//
//  1. Tanning. A tannery was set up by spending a rack and a barrel, so it was
//     the one station that never showed its tools: players used the other
//     benches' slots to see what they were missing and finished those first.
//     Rack and Barrel are now slots (both required), shown above the vats and
//     locked while a soak runs (services/workstations.ts). Every tannery set
//     up the old way gets both slots filled here: its rack and barrel were
//     spent on it, so they are in it.
//
//  2. Textiles. Spinning thread and weaving cloth were camp crafts, done
//     anywhere with nothing. They move to a 'textile' station: a Spinning Wheel
//     slot and a Loom slot, each needed only by its own recipe. Both are built
//     by Carpentry from planks and nails, never from linen (circularity rule).
//     Your own is full speed; the public one at Caliwen, the crafting town, is
//     half speed (PUBLIC_STATIONS). Wool will spin on the same wheel.
//
// XP on the house pattern of the Lap Wheel (Carpentry, ~1.1 XP a second at
// level 1, rising with the band): Spinning Wheel at Carpentry 5, 300 s for 363;
// Loom at Carpentry 8, 360 s for 468.

const tools = (...slots: string[]) => JSON.stringify(slots);
const inputs = (...pairs: [string, number][]) => JSON.stringify(pairs.map(([itemName, qty]) => ({ itemName, qty })));

const TANNING_SLOTS = [
    { station_type: 'tanning', slot: 'rack', label: 'Tanning Rack', capacity: 1, accepts_subtype: null, accepts_names: JSON.stringify(['Lanai Tanning Rack']), is_required: true, display_order: 1 },
    { station_type: 'tanning', slot: 'barrel', label: 'Tanning Barrel', capacity: 1, accepts_subtype: null, accepts_names: JSON.stringify(['Lanai Tanning Barrel']), is_required: true, display_order: 2 },
];

const TEXTILE_TOOLS = [
    { name: 'Lanai Spinning Wheel', type: 'tool', subtype: 'spinning_wheel', tier: 1, level_required: 1,
      description: 'A treadle wheel of Lanai wood with a flyer and bobbin. Fibre goes in at the hand and comes out as thread at the spindle.' },
    { name: 'Lanai Loom', type: 'tool', subtype: 'loom', tier: 1, level_required: 1,
      description: 'A floor loom of Lanai wood, heddles and all. Thread goes on as warp and comes off as a bolt of cloth.' },
];

const TEXTILE_SLOTS = [
    { station_type: 'textile', slot: 'spinning_wheel', label: 'Spinning Wheel', capacity: 1, accepts_subtype: 'spinning_wheel', accepts_names: null, is_required: false, display_order: 1 },
    { station_type: 'textile', slot: 'loom', label: 'Loom', capacity: 1, accepts_subtype: 'loom', accepts_names: null, is_required: false, display_order: 2 },
];

const TOOL_RECIPES = [
    { name: 'Build Spinning Wheel', skill: 'Carpentry', output_item_name: 'Lanai Spinning Wheel', output_qty: 1,
      inputs: inputs(['Lanai Planks', 5], ['Ambren Nails', 10]), required_level: 5, timer_seconds: 300, xp: 363,
      station: 'carpentry', required_tools: tools('saw', 'sawhorse', 'plane'), for_skill: 'Crafting',
      flavor_text: 'You turn the wheel true on its axle and fit the flyer that will draw the thread.' },
    { name: 'Build Loom', skill: 'Carpentry', output_item_name: 'Lanai Loom', output_qty: 1,
      inputs: inputs(['Lanai Planks', 8], ['Ambren Nails', 20]), required_level: 8, timer_seconds: 360, xp: 468,
      station: 'carpentry', required_tools: tools('saw', 'sawhorse', 'plane'), for_skill: 'Crafting',
      flavor_text: 'You square the frame, hang the heddles and set the beam that will take the cloth.' },
];

const MOVED = [
    { name: 'Spin Linen Thread', tool: 'spinning_wheel' },
    { name: 'Weave Linen Cloth', tool: 'loom' },
];

async function upsert(knex: Knex, table: string, key: Record<string, unknown>, row: Record<string, unknown>) {
    const existing = await knex(table).where(key).first();
    if (existing) await knex(table).where({ id: existing.id }).update(row);
    else await knex(table).insert(row);
}

export async function up(knex: Knex): Promise<void> {
    // State, whatever the content: tanneries set up the old way hold their
    // rack and barrel in slots now. Only where a station has no slots yet.
    const bare = await knex('workstations as w')
        .leftJoin('workstation_slots as s', 's.workstation_id', 'w.id')
        .where('w.type', 'tanning').whereNull('s.id')
        .select('w.id');
    for (const w of bare) {
        await knex('workstation_slots').insert([
            { workstation_id: w.id, slot: 'rack', slot_index: 0, item_name: 'Lanai Tanning Rack' },
            { workstation_id: w.id, slot: 'barrel', slot_index: 0, item_name: 'Lanai Tanning Barrel' },
        ]).onConflict(['workstation_id', 'slot', 'slot_index']).ignore();
        await knex('workstations').where({ id: w.id }).update({ is_active: true });
    }

    if (!(await hasContent(knex))) return;

    for (const name of ['Lanai Tanning Rack', 'Lanai Tanning Barrel', 'Lanai Planks', 'Ambren Nails']) {
        if (!(await knex('items').where({ name }).first())) throw new Error(`tanning_tools_and_textile: item ${name} not found`);
    }
    for (const s of TANNING_SLOTS) await upsert(knex, 'workstation_slot_types', { station_type: s.station_type, slot: s.slot }, s);
    for (const t of TEXTILE_TOOLS) await upsert(knex, 'items', { name: t.name }, { ...t, is_active: true });
    for (const s of TEXTILE_SLOTS) await upsert(knex, 'workstation_slot_types', { station_type: s.station_type, slot: s.slot }, s);
    for (const r of TOOL_RECIPES) await upsert(knex, 'recipes', { name: r.name }, { ...r, mode: 'active', is_active: true });
    for (const m of MOVED) {
        const n = await knex('recipes').where({ name: m.name }).update({ station: 'textile', required_tools: tools(m.tool) });
        if (n !== 1) throw new Error(`tanning_tools_and_textile: recipe ${m.name} not found`);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const m of MOVED) await knex('recipes').where({ name: m.name }).update({ station: null, required_tools: null });
    await knex('recipes').whereIn('name', TOOL_RECIPES.map(r => r.name)).delete();
    await knex('workstation_slot_types').whereIn('station_type', ['textile', 'tanning']).delete();
    // Items stay (players may hold them). Tanneries keep their slot rows:
    // harmless without slot types, and the rack and barrel are still in them.
}
