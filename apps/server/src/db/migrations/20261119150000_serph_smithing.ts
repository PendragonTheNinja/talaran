import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// The main chain, part two: Serph smithing (docs/antura-plan.md §5; settled by
// Nathan 2026-11-17). Every Ambren recipe gets its Serph twin at its level plus
// 12, with the same ingots, the same Lanai and leather parts, and the same
// bench and tools. Timers and XP are the plan's table (a tenth longer than
// Ambren's; XP by the band, finished goods at 1.1 x 1.8, nails, hooks, and
// arrows at 0.6). Each output is its Ambren twin's row with tier 2, the level
// worn or used from plus 12, and these numbers from lib/combatMath.ts at tier 2
// (checked to give the Ambren rows exactly at tier 1):
//   weapons   aim weaponAim(type, 2), power weaponPower(form, type, 2), rounded
//   armour    piecePoints(ambren, 2): points x (1 + 37.5 / 80), rounded; the
//             late set 117, as the combat spec's 117.5.
// The Serph Hatchet and Pickaxe rows were waiting, inactive; they are filled
// in and switched on here.

// [Ambren recipe name, Serph timer, Serph XP]
const RECIPES: [string, number, number][] = [
    ['Fletch Arrows', 35, 31],
    ['Forge Ambren Bracers', 50, 73],
    ['Forge Ambren Hooks', 22, 19],
    ['Hammer Ambren Nails', 22, 19],
    ['Forge Ambren Butchering Knife', 55, 80],
    ['Forge Ambren Foraging Knife', 50, 73],
    ['Forge Ambren Gem Chisel', 50, 73],
    ['Forge Ambren Hoe', 50, 73],
    ["Forge Ambren Jeweller's Pliers", 50, 73],
    ['Ambren Anvil', 250, 366],
    ['Ambren Cauldron', 265, 388],
    ['Ambren Cooking Knife', 100, 146],
    ['Ambren Flesh Hook', 90, 132],
    ['Ambren Hammer', 100, 146],
    ['Ambren Hatchet', 100, 146],
    ['Ambren Ladle', 90, 132],
    ['Ambren Meat Cleaver', 120, 176],
    ['Ambren Pickaxe', 100, 146],
    ['Ambren Plane', 100, 146],
    ['Ambren Saw', 100, 146],
    ['Ambren Skillet', 130, 190],
    ['Ambren Tinderbox', 50, 73],
    ['Ambren Tongs', 50, 73],
    ['Forge Ambren Mace', 100, 146],
    ['Forge Ambren Scimitar', 100, 146],
    ['Forge Ambren Spear', 50, 73],
    ['Forge Ambren Boots', 50, 75],
    ['Forge Ambren Scythe', 65, 100],
    ['Forge Ambren Coif', 100, 153],
    ['Forge Ambren Buckler', 100, 157],
    ['Forge Ambren Daggers', 100, 157],
    ['Forge Ambren Hand Axes', 100, 157],
    ['Forge Ambren War Hammers', 150, 236],
    ['Forge Ambren Chausses', 150, 241],
    ['Forge Ambren Hauberk', 200, 330],
    ['Forge Ambren Gauntlets', 100, 169],
    ['Forge Ambren Sabatons', 100, 173],
    ['Forge Ambren Atgeir', 100, 173],
    ['Forge Ambren Greatsword', 200, 346],
    ['Forge Ambren Maul', 200, 346],
    ['Forge Ambren Helm', 150, 265],
    ['Forge Ambren Kite Shield', 250, 453],
    ['Forge Ambren Greaves', 200, 371],
    ['Forge Ambren Cuirass', 300, 571],
];

// Serph item -> [aim, power] for weapons, armour for armour.
const WEAPONS: Record<string, [number, number]> = {
    'Serph Spear': [148, 45], 'Serph Scimitar': [138, 46], 'Serph Mace': [128, 49],
    'Serph Daggers': [148, 50], 'Serph Hand Axes': [138, 53], 'Serph War Hammers': [128, 54],
    'Serph Atgeir': [148, 81], 'Serph Greatsword': [138, 84], 'Serph Maul': [128, 87],
};
const ARMOUR: Record<string, number> = {
    'Serph Bracers': 9, 'Serph Boots': 9, 'Serph Coif': 12, 'Serph Buckler': 15, 'Serph Chausses': 15, 'Serph Hauberk': 21,
    'Serph Gauntlets': 13, 'Serph Sabatons': 13, 'Serph Helm': 18, 'Serph Kite Shield': 22, 'Serph Greaves': 22, 'Serph Cuirass': 29,
};

// Where the Ambren words do not carry over: tiers, Lanai trees, iron.
const DESCRIPTIONS: Record<string, string> = {
    'Serph Hatchet': 'A hatchet with a Serph head, keen enough to bite into old, hard Lanai without turning its edge.',
    'Serph Pickaxe': 'A pickaxe with a Serph head, hard enough to break Serph ore cleanly out of the rock.',
    'Serph Tongs': 'Serph tongs for handling hot metal, long enough to keep your knuckles out of the fire.',
    'Serph Anvil': 'A sturdy Serph anvil, its face polished bright by the first hundred blows. It rings higher than Ambren.',
    'Serph Arrow': 'A hunting arrow with a narrow Serph head. It goes through a hide that would turn Ambren aside.',
};

const serph = (s: string) => s.replace(/Ambren/gi, 'Serph');

// Columns a Serph item never takes from its Ambren twin.
const OWN = ['id', 'name', 'created_at', 'updated_at', 'value', 'value_locked', 'tier', 'level_required', 'description', 'aim', 'power', 'armour', 'is_active'];

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    if (!(await knex('items').where({ name: 'Serph Ingot' }).first('id'))) throw new Error('serph_smithing: no Serph Ingot (run 20261119140000 first)');

    for (const [ambrenName, timer, xp] of RECIPES) {
        const recipe = await knex('recipes').where({ name: ambrenName }).first();
        if (!recipe) throw new Error(`serph_smithing: Ambren recipe "${ambrenName}" not found`);
        const twin = await knex('items').where({ name: recipe.output_item_name }).first();
        if (!twin) throw new Error(`serph_smithing: item "${recipe.output_item_name}" not found`);

        // The item.
        const itemName = serph(twin.name);
        const item: Record<string, unknown> = { ...twin };
        for (const k of OWN) delete item[k];
        Object.assign(item, {
            name: itemName, tier: 2, level_required: Number(twin.level_required) + 12,
            description: DESCRIPTIONS[itemName] ?? serph(String(twin.description ?? '')),
            is_active: true,
        });
        if (WEAPONS[itemName]) [item.aim, item.power] = WEAPONS[itemName];
        else if (twin.type === 'weapon') throw new Error(`serph_smithing: no stats for weapon "${itemName}"`);
        if (ARMOUR[itemName] !== undefined) item.armour = ARMOUR[itemName];
        else if (twin.type === 'armor') throw new Error(`serph_smithing: no armour for "${itemName}"`);
        const hadItem = await knex('items').where({ name: itemName }).first('id');
        if (hadItem) await knex('items').where({ id: hadItem.id }).update({ ...item, updated_at: knex.fn.now() });
        else await knex('items').insert(item);

        // The recipe.
        const inputs = (typeof recipe.inputs === 'string' ? JSON.parse(recipe.inputs) : recipe.inputs)
            .map((i: { itemName: string; qty: number }) => ({ ...i, itemName: i.itemName === 'Ambren Ingot' ? 'Serph Ingot' : i.itemName }));
        const row: Record<string, unknown> = { ...recipe };
        delete row.id; delete row.created_at; delete row.updated_at;
        Object.assign(row, {
            name: ambrenName === 'Fletch Arrows' ? 'Fletch Serph Arrows' : serph(ambrenName),
            output_item_name: itemName,
            inputs: JSON.stringify(inputs),
            required_level: Number(recipe.required_level) + 12,
            timer_seconds: timer,
            xp,
            flavor_text: recipe.flavor_text ? serph(String(recipe.flavor_text)) : null,
            is_active: true,
        });
        if (typeof row.required_tools !== 'string' && row.required_tools !== null && row.required_tools !== undefined) row.required_tools = JSON.stringify(row.required_tools);
        if (typeof row.grade_outputs !== 'string' && row.grade_outputs !== null && row.grade_outputs !== undefined) row.grade_outputs = JSON.stringify(row.grade_outputs);
        const hadRecipe = await knex('recipes').where({ name: row.name as string }).first('id');
        if (hadRecipe) await knex('recipes').where({ id: hadRecipe.id }).update(row);
        else await knex('recipes').insert(row);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    const names = RECIPES.map(([n]) => (n === 'Fletch Arrows' ? 'Fletch Serph Arrows' : serph(n)));
    await knex('recipes').whereIn('name', names).delete();
    // Items stay, hidden, as players may hold them; the two that waited go back to waiting.
    await knex('items').where('name', 'like', 'Serph %').whereNotIn('name', ['Serph Ore', 'Dense Serph Ore', 'Serph Ingot'])
        .update({ is_active: false });
}
