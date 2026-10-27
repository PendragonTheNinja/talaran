import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Talar, step 2 (docs/talar-spec.md §2; Nathan, 2026-10-27): the lapidary, a
// Crafting station where rough gems are cut, and later where jewelry is made.
//
//   Station   type 'lapidary', two required slots: a Lap Wheel (Carpentry, a
//             stone-faced wheel on a treadle) and a Gem Chisel (Smithing).
//             Neither tool needs itself to be made (circularity rule).
//   Cutting   one recipe per gem; the cut rolls Cut, Polished or Flawless by
//             levels over the recipe (lib/gemGrades.ts), listed in the new
//             recipes.grade_outputs column, best grade last.
//   XP        cutting is Crafting's x1.8 with a small premium for a scarce
//             input, about x2.1 of the ladder (Nathan, 2026-10-27, "middle
//             ground"): Quartz 210 s for 270 at Crafting 1, ~4,630/h; Garnet
//             255 s for 435 at Crafting 13, ~6,140/h. Tools on the house
//             patterns: the chisel as the Ambren Tongs, the wheel as the
//             tanning rack.
//
// Cut Garnet and its grades are tier 2: they are first made at Crafting 13.
// Rough Garnet stays tier 1 (Mining 1 granite). Items stay on down(), as with
// every content migration: players may hold them.

const GEMS = [
    { gem: 'Quartz', subtype: 'quartz', tier: 1, level: 1, timer: 210, xp: 270,
      flavor: 'You hold the quartz to the turning wheel and grind away the dull skin, a little at a time.',
      grades: [
          'A quartz cut clean, with flat faces that catch the light.',
          'A quartz ground and polished until it is clear as a still pool.',
          'A quartz without a single cloud or crack in it. A cutter waits a long time for one of these.',
      ] },
    { gem: 'Garnet', subtype: 'garnet', tier: 2, level: 13, timer: 255, xp: 435,
      flavor: 'You set the garnet to the wheel and feel for the grain before you take the first face.',
      grades: [
          'A garnet cut into faces, the colour of dark wine.',
          'A polished garnet. Held up to a candle it glows red right through.',
          'A flawless garnet, deep red and clear to the heart. Nobody who sees it forgets it.',
      ] },
];
const GRADE_WORDS = ['Cut', 'Polished', 'Flawless'];
const GRADE_QUALITY = ['cut', 'polished', 'flawless'];

const TOOLS = [
    { name: 'Lanai Lap Wheel', type: 'tool', subtype: 'lap_wheel', tier: 1, level_required: 1,
      description: 'A wheel of Lanai wood faced with ground granite, turned by a treadle. A gem held to it loses its rough skin a grain at a time.' },
    { name: 'Ambren Gem Chisel', type: 'tool', subtype: 'gem_chisel', tier: 1, level_required: 1,
      description: 'A short Ambren chisel with a fine edge, for splitting a stone along its grain before it goes to the wheel.' },
];

const SLOTS = [
    { station_type: 'lapidary', slot: 'lap_wheel', label: 'Lap Wheel', capacity: 1, accepts_subtype: 'lap_wheel', accepts_names: null, is_required: true, display_order: 1 },
    { station_type: 'lapidary', slot: 'gem_chisel', label: 'Gem Chisel', capacity: 1, accepts_subtype: 'gem_chisel', accepts_names: null, is_required: true, display_order: 2 },
];

const tools = (...slots: string[]) => JSON.stringify(slots);
const inputs = (...pairs: [string, number][]) => JSON.stringify(pairs.map(([itemName, qty]) => ({ itemName, qty })));

const TOOL_RECIPES = [
    { name: 'Forge Ambren Gem Chisel', skill: 'Smithing', output_item_name: 'Ambren Gem Chisel', output_qty: 1,
      inputs: inputs(['Ambren Ingot', 1], ['Lanai Planks', 1]), required_level: 1, timer_seconds: 45, xp: 50,
      station: 'smithing', required_tools: tools('anvil', 'hammer', 'tongs'), for_skill: 'Crafting',
      flavor_text: 'You draw a short chisel out to a fine edge and fit it to a handle.' },
    { name: 'Build Lap Wheel', skill: 'Carpentry', output_item_name: 'Lanai Lap Wheel', output_qty: 1,
      inputs: inputs(['Lanai Planks', 4], ['Granite Block', 2]), required_level: 1, timer_seconds: 300, xp: 330,
      station: 'carpentry', required_tools: tools('saw', 'sawhorse', 'plane'), for_skill: 'Crafting',
      flavor_text: 'You true a wheel on its spindle and set ground granite into its face.' },
];

function cutRecipes() {
    return GEMS.map(g => ({
        name: `Cut Rough ${g.gem}`, skill: 'Crafting', output_item_name: `Cut ${g.gem}`, output_qty: 1,
        inputs: inputs([`Rough ${g.gem}`, 1]), required_level: g.level, timer_seconds: g.timer, xp: g.xp,
        station: 'lapidary', required_tools: tools('lap_wheel', 'gem_chisel'), for_skill: 'Talar',
        flavor_text: g.flavor,
        grade_outputs: JSON.stringify(GRADE_WORDS.map(w => `${w} ${g.gem}`)),
    }));
}

async function upsert(knex: Knex, table: string, key: Record<string, unknown>, row: Record<string, unknown>) {
    const existing = await knex(table).where(key).first();
    if (existing) await knex(table).where({ id: existing.id }).update(row);
    else await knex(table).insert(row);
}

export async function up(knex: Knex): Promise<void> {
    // Schema first, unconditionally (a fresh database runs this before content).
    if (!(await knex.schema.hasColumn('recipes', 'grade_outputs'))) {
        await knex.schema.alterTable('recipes', t => { t.text('grade_outputs').nullable(); });
    }

    if (!(await hasContent(knex))) return;

    for (const g of GEMS) {
        if (!(await knex('items').where({ name: `Rough ${g.gem}` }).first())) throw new Error(`lapidary: item Rough ${g.gem} not found`);
        for (let i = 0; i < 3; i++) {
            const name = `${GRADE_WORDS[i]} ${g.gem}`;
            await upsert(knex, 'items', { name }, {
                name, type: 'gem', subtype: g.subtype, quality: GRADE_QUALITY[i], tier: g.tier, level_required: 1,
                description: g.grades[i], is_active: true,
            });
        }
    }
    for (const t of TOOLS) await upsert(knex, 'items', { name: t.name }, { ...t, is_active: true });

    for (const s of SLOTS) await upsert(knex, 'workstation_slot_types', { station_type: s.station_type, slot: s.slot }, s);

    for (const r of [...TOOL_RECIPES, ...cutRecipes()]) {
        for (const i of JSON.parse(r.inputs) as { itemName: string }[]) {
            if (!(await knex('items').where({ name: i.itemName }).first())) throw new Error(`lapidary: input ${i.itemName} not found for ${r.name}`);
        }
        await upsert(knex, 'recipes', { name: r.name }, { ...r, mode: 'active', is_active: true });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex('recipes').whereIn('name', [...TOOL_RECIPES, ...cutRecipes()].map(r => r.name)).delete();
    await knex('workstation_slot_types').where({ station_type: 'lapidary' }).delete();
    if (await knex.schema.hasColumn('recipes', 'grade_outputs')) {
        await knex.schema.alterTable('recipes', t => { t.dropColumn('grade_outputs'); });
    }
}
