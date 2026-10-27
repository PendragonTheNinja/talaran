import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 5, first half (docs/talar-spec.md §8): jewelry, and the rings.
//
//   items.jewelry_aid   what a piece helps with ('wear', 'vein', 'harvest',
//                       and in the second half 'fight_food', 'road', 'bait').
//                       How much it helps is code (lib/jewelry.ts), by tier.
//   Jeweller's Pliers   Smithing, Ambren; a third lapidary slot, not required
//                       to cut, required to set (Nathan, 2026-10-28).
//   Rings (T1)          Quartz Keeper's Band, Prospector's Ring, Seedsaver's
//                       Ring. Three recipes each: 3 Lit, 2 Bright or 1 Radiant
//                       Quartz, with 2 Ambren Ingots (Nathan, 2026-10-28).
//                       Crafting 8, 120 s, finished goods by the law:
//                       1.8 x 1.10 x band(8) x 120 / 3600 = 156.
//   Museum              a Rings and Amulets exhibit on the Taiar Museum, with
//                       a case for every piece so the outlines show at once.
//
// Garnet pieces wait for Serph (Nathan, 2026-10-28). Items stay on down(), as
// with every content migration: players may hold them.

const PLIERS = {
    name: "Ambren Jeweller's Pliers", type: 'tool', subtype: 'jewelers_pliers', tier: 1, level_required: 1,
    description: 'Small pliers with fine jaws, drawn from Ambren and filed until they close without a gap. For bending a claw over a stone and not chipping it.',
};

const SLOT = {
    station_type: 'lapidary', slot: 'jewelers_pliers', label: "Jeweller's Pliers", capacity: 1,
    accepts_subtype: 'jewelers_pliers', accepts_names: null, is_required: false, display_order: 3,
};

const RINGS = [
    {
        name: "Quartz Keeper's Band", aid: 'wear',
        description: 'A plain Ambren band with quartz set flush around it. Kit carried by its wearer seems to forget the knocks it takes.',
        flavor: 'You close the claws over each quartz in turn and work the band round until it sits true.',
    },
    {
        name: "Quartz Prospector's Ring", aid: 'vein',
        description: 'A heavy Ambren ring with a quartz set high, the way old miners wore them. A seam found by its wearer tends to run a little deeper.',
        flavor: 'You raise a high setting on the shank and seat the quartz in it.',
    },
    {
        name: "Quartz Seedsaver's Ring", aid: 'harvest',
        description: 'A thin Ambren ring with quartz set like seeds along a furrow. At harvest, now and then, something is left over for next year.',
        flavor: 'You set the quartz along the band one after another, like sowing a row.',
    },
];

const GRADES: [string, number][] = [['Lit Quartz', 3], ['Bright Quartz', 2], ['Radiant Quartz', 1]];
const INGOTS = 2;
const LEVEL = 8;
const TIMER = 120;
const XP = 156;

const EXHIBIT = {
    name: 'Rings and Amulets',
    description: 'Stones from the island, set in its own metal and filled with what rises at the Rift.',
    match: [{ type: 'jewelry' }],
};

const tools = (...slots: string[]) => JSON.stringify(slots);
const inputs = (...pairs: [string, number][]) => JSON.stringify(pairs.map(([itemName, qty]) => ({ itemName, qty })));

function ringRecipes() {
    return RINGS.flatMap(r => GRADES.map(([gem, qty]) => ({
        name: `Set ${r.name} (${gem.split(' ')[0]})`, skill: 'Crafting', output_item_name: r.name, output_qty: 1,
        inputs: inputs([gem, qty], ['Ambren Ingot', INGOTS]), required_level: LEVEL, timer_seconds: TIMER, xp: XP,
        station: 'lapidary', required_tools: tools('lap_wheel', 'gem_chisel', 'jewelers_pliers'), for_skill: 'Talar',
        flavor_text: r.flavor,
    })));
}

const PLIERS_RECIPE = {
    name: "Forge Ambren Jeweller's Pliers", skill: 'Smithing', output_item_name: PLIERS.name, output_qty: 1,
    inputs: inputs(['Ambren Ingot', 1]), required_level: 1, timer_seconds: 45, xp: 50,
    station: 'smithing', required_tools: tools('anvil', 'hammer', 'tongs'), for_skill: 'Crafting',
    flavor_text: 'You draw two short arms of Ambren, rivet them, and file the jaws until they meet.',
};

async function upsert(knex: Knex, table: string, key: Record<string, unknown>, row: Record<string, unknown>) {
    const existing = await knex(table).where(key).first();
    if (existing) await knex(table).where(key).update(row);
    else await knex(table).insert(row);
}

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('items', 'jewelry_aid'))) {
        await knex.schema.alterTable('items', t => { t.string('jewelry_aid', 30).nullable(); });
    }

    if (!(await hasContent(knex))) return;

    await upsert(knex, 'items', { name: PLIERS.name }, { ...PLIERS, is_active: true });
    for (const r of RINGS) {
        await upsert(knex, 'items', { name: r.name }, {
            name: r.name, type: 'jewelry', subtype: 'ring', slot: 'finger', tier: 1, level_required: 1,
            jewelry_aid: r.aid, description: r.description, is_active: true,
        });
    }
    await upsert(knex, 'workstation_slot_types', { station_type: SLOT.station_type, slot: SLOT.slot }, SLOT);

    for (const r of [PLIERS_RECIPE, ...ringRecipes()]) {
        for (const i of JSON.parse(r.inputs) as { itemName: string }[]) {
            if (!(await knex('items').where({ name: i.itemName }).first())) throw new Error(`jewelry_rings: input ${i.itemName} not found for ${r.name}`);
        }
        await upsert(knex, 'recipes', { name: r.name }, { ...r, mode: 'active', is_active: true });
    }

    // The museum, where there is one (a fresh database gets it from content).
    const museum = await knex('museums').where({ key: 'taiar' }).first();
    if (museum) {
        let exhibit = await knex('museum_exhibits').where({ museum_id: museum.id, name: EXHIBIT.name }).first();
        if (!exhibit) {
            const last = await knex('museum_exhibits').where({ museum_id: museum.id, is_catch_all: false }).max('display_order as max').first();
            const order = Number(last?.max ?? 0) + 1;
            await knex('museum_exhibits').where({ museum_id: museum.id }).where('display_order', '>=', order).increment('display_order', 1);
            [exhibit] = await knex('museum_exhibits').insert({
                museum_id: museum.id, name: EXHIBIT.name, description: EXHIBIT.description, display_order: order,
                match: JSON.stringify(EXHIBIT.match), is_catch_all: false,
            }).returning('*');
        } else {
            await knex('museum_exhibits').where({ id: exhibit.id })
                .update({ description: EXHIBIT.description, match: JSON.stringify(EXHIBIT.match), updated_at: knex.fn.now() });
        }
        const pieces = await knex('items').where({ type: 'jewelry', is_active: true }).orderBy('name').select('id');
        for (const item of pieces) {
            if (await knex('museum_cases').where({ item_id: item.id }).first()) continue;
            const [{ max }] = await knex('museum_cases').where({ exhibit_id: exhibit.id }).max('display_order as max');
            await knex('museum_cases').insert({ exhibit_id: exhibit.id, item_id: item.id, display_order: Number(max ?? -1) + 1 });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', [PLIERS_RECIPE, ...ringRecipes()].map(r => r.name)).delete();
    await knex('workstation_slot_types').where({ station_type: SLOT.station_type, slot: SLOT.slot }).delete();
    const museum = await knex('museums').where({ key: 'taiar' }).first();
    if (museum) {
        const exhibit = await knex('museum_exhibits').where({ museum_id: museum.id, name: EXHIBIT.name }).first();
        if (exhibit) {
            const given = await knex('museum_donations as d').join('museum_cases as c', 'c.id', 'd.case_id')
                .where('c.exhibit_id', exhibit.id).first('d.case_id');
            if (given) {
                throw new Error('jewelry_rings: the Rings and Amulets exhibit holds donations; move them before rolling back');
            }
            await knex('museum_cases').where({ exhibit_id: exhibit.id }).delete();
            await knex('museum_exhibits').where({ id: exhibit.id }).delete();
            await knex('museum_exhibits').where({ museum_id: museum.id }).where('display_order', '>', exhibit.display_order).decrement('display_order', 1);
        }
    }
    if (await knex.schema.hasColumn('items', 'jewelry_aid')) {
        await knex.schema.alterTable('items', t => { t.dropColumn('jewelry_aid'); });
    }
}
