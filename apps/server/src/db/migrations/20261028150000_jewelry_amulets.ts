import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 5, second half (docs/talar-spec.md §8): the amulets.
//
//   Quartz Hearty Amulet       fight food mends more ('fight_food')
//   Quartz Wayfinder's Amulet  more road finds on foot ('road')
//   Quartz Baitkeeper's Amulet bait now and then not used ('bait')
//
// As the rings (20261028140000): three recipes each, 3 Lit, 2 Bright or 1
// Radiant Quartz with 2 Ambren Ingots, at the lapidary with the Jeweller's
// Pliers, Crafting 10, 120 s: 1.8 x 1.10 x band(10) x 120 / 3600 = 163. A case
// each in the Rings and Amulets exhibit. Items stay on down().

const AMULETS = [
    {
        name: 'Quartz Hearty Amulet', aid: 'fight_food',
        description: 'A round Ambren locket with a quartz in its face, worn close to the chest. Bread eaten in a hard moment seems to go further.',
        flavor: 'You set the quartz in the locket\'s face and close the bezel over it.',
    },
    {
        name: "Quartz Wayfinder's Amulet", aid: 'road',
        description: 'An Ambren pendant shaped like a milestone, a quartz at its top. Walkers who wear one tend to notice what lies at the roadside.',
        flavor: 'You cut the pendant to the shape of a milestone and set the quartz at its head.',
    },
    {
        name: "Quartz Baitkeeper's Amulet", aid: 'bait',
        description: 'An Ambren fish on a cord, with quartz for its eye. What goes on the hook or under the snare is not always taken.',
        flavor: 'You file an Ambren fish from the bar and give it a quartz eye.',
    },
];

const GRADES: [string, number][] = [['Lit Quartz', 3], ['Bright Quartz', 2], ['Radiant Quartz', 1]];
const INGOTS = 2;
const LEVEL = 10;
const TIMER = 120;
const XP = 163;

const tools = (...slots: string[]) => JSON.stringify(slots);
const inputs = (...pairs: [string, number][]) => JSON.stringify(pairs.map(([itemName, qty]) => ({ itemName, qty })));

function amuletRecipes() {
    return AMULETS.flatMap(a => GRADES.map(([gem, qty]) => ({
        name: `Set ${a.name} (${gem.split(' ')[0]})`, skill: 'Crafting', output_item_name: a.name, output_qty: 1,
        inputs: inputs([gem, qty], ['Ambren Ingot', INGOTS]), required_level: LEVEL, timer_seconds: TIMER, xp: XP,
        station: 'lapidary', required_tools: tools('lap_wheel', 'gem_chisel', 'jewelers_pliers'), for_skill: 'Talar',
        flavor_text: a.flavor,
    })));
}

async function upsert(knex: Knex, table: string, key: Record<string, unknown>, row: Record<string, unknown>) {
    const existing = await knex(table).where(key).first();
    if (existing) await knex(table).where(key).update(row);
    else await knex(table).insert(row);
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    if (!(await knex.schema.hasColumn('items', 'jewelry_aid'))) throw new Error('jewelry_amulets: run 20261028140000_jewelry_rings first');

    for (const a of AMULETS) {
        await upsert(knex, 'items', { name: a.name }, {
            name: a.name, type: 'jewelry', subtype: 'amulet', slot: 'neck', tier: 1, level_required: 1,
            jewelry_aid: a.aid, description: a.description, is_active: true,
        });
    }
    for (const r of amuletRecipes()) {
        for (const i of JSON.parse(r.inputs) as { itemName: string }[]) {
            if (!(await knex('items').where({ name: i.itemName }).first())) throw new Error(`jewelry_amulets: input ${i.itemName} not found for ${r.name}`);
        }
        await upsert(knex, 'recipes', { name: r.name }, { ...r, mode: 'active', is_active: true });
    }

    const museum = await knex('museums').where({ key: 'taiar' }).first();
    const exhibit = museum ? await knex('museum_exhibits').where({ museum_id: museum.id, name: 'Rings and Amulets' }).first() : null;
    if (museum && !exhibit) throw new Error('jewelry_amulets: no Rings and Amulets exhibit (20261028140000)');
    if (exhibit) {
        const pieces = await knex('items').whereIn('name', AMULETS.map(a => a.name)).orderBy('name').select('id');
        for (const item of pieces) {
            if (await knex('museum_cases').where({ item_id: item.id }).first()) continue;
            const [{ max }] = await knex('museum_cases').where({ exhibit_id: exhibit.id }).max('display_order as max');
            await knex('museum_cases').insert({ exhibit_id: exhibit.id, item_id: item.id, display_order: Number(max ?? -1) + 1 });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', amuletRecipes().map(r => r.name)).delete();
    const items = await knex('items').whereIn('name', AMULETS.map(a => a.name)).pluck('id');
    if (items.length) {
        const given = await knex('museum_donations as d').join('museum_cases as c', 'c.id', 'd.case_id').whereIn('c.item_id', items).first('d.case_id');
        if (given) throw new Error('jewelry_amulets: an amulet has been given to the museum; move it before rolling back');
        await knex('museum_cases').whereIn('item_id', items).delete();
    }
}
