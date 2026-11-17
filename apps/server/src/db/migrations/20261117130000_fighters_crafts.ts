import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// What fighters' drops are made into (docs/antura-plan.md §10; Nathan,
// 2026-11-17). Every recipe is Crafting, finished goods by the law:
// 1.8 x 1.10 x band(level) x timer / 3600.
//
//   Ratskin set       five pieces worn from Defense 1, Ratskin alone, for new
//                     players with no armour yet (a player asked). A tiny bit
//                     of armour, and it wears out fast: 60 sure uses, then 3%
//                     a kill, where tier 1 metal is 200 and 1%.
//   Crabshell         the six pieces, sewn from plates now that the crabs no
//                     longer drop them whole (20261117120000). 135 plates a
//                     crab's three pieces, about the 550 kills the drops took.
//                     The pieces' armour and durability are unchanged.
//   Knuckle Ring      power, worn on the finger: Agropelter Knuckle, an Ambren
//   Jackalope Charm   ingot, and Ratskin; aim, on the neck: Jackalope Antler and
//                     Jackalope Pelt. +3 power and +12 aim: each is about 4%
//                     more kills an hour at combat 8 to 12 (combatSim's kits,
//                     2026-11-17), near the cloak's 5% less damage taken.
//                     Made at the lapidary, where jewelry is made; worn on Melee
//                     (services/equipGates.ts), read by a fight from any slot
//                     (fightingNumbers in services/combat.ts).
//   Wolfskin Cloak    takes a Wolf Fang beside its 20 pelts.
//
// Items stay on down(), as with every content migration: players may hold them.

type Row = Record<string, unknown> & { name: string };

const RATSKIN = (name: string, slot: string, armour: number, description: string): Row => ({
    name, type: 'armor', subtype: 'hide_armor', slot, tier: 1, level_required: 1, armour,
    durability_uses: 60, durability_break_pct: 3, description,
});

const ITEMS: Row[] = [
    RATSKIN('Ratskin Gloves', 'hands', 2, 'Rat hides stitched into a pair of gloves, fur inside. They smell of the docks and always will.'),
    RATSKIN('Ratskin Boots', 'feet', 2, 'Soft boots of rat hide over a sole of doubled skins. Quiet on a wooden floor, and not much use on anything sharp.'),
    RATSKIN('Ratskin Cap', 'head', 3, 'A close cap of rat hides, the tails left on and tied off at the back. Nobody has ever worn one for the look of it.'),
    RATSKIN('Ratskin Leggings', 'legs', 3, 'Leggings pieced together from more rats than anyone wants to count. They keep a bite from going all the way through.'),
    RATSKIN('Ratskin Jerkin', 'chest', 4, 'A jerkin of rat hides sewn in overlapping rows like roof shingles. Better than a shirt. Not by much.'),
    {
        name: 'Knuckle Ring', type: 'jewelry', subtype: 'ring', slot: 'finger', tier: 1, level_required: 8, power: 3,
        description: "A band of Ambren with an agropelter's knuckle bound to it in ratskin. It sits like a fist on a fist, and a blow from that hand lands heavier.",
    },
    {
        name: 'Jackalope Charm', type: 'jewelry', subtype: 'amulet', slot: 'neck', tier: 1, level_required: 10, aim: 12,
        description: "A jackalope's antler tine on a cord of its own pelt. Hunters say the beast never misses its footing, and that some of that rubs off.",
    },
];

const inputs = (...pairs: [string, number][]) => JSON.stringify(pairs.map(([itemName, qty]) => ({ itemName, qty })));

const SEW = (item: string, level: number, timer: number, xp: number, input: [string, number][], flavor: string): Row => ({
    name: `Sew ${item}`, skill: 'Crafting', output_item_name: item, output_qty: 1, inputs: inputs(...input),
    required_level: level, timer_seconds: timer, xp, station: null, required_tools: null, for_skill: 'Defense', flavor_text: flavor,
});

const RECIPES: Row[] = [
    SEW('Ratskin Gloves', 1, 45, 50, [['Ratskin', 4]], 'You cut the skins to the shape of your hand and whip the edges together.'),
    SEW('Ratskin Boots', 1, 45, 50, [['Ratskin', 4]], 'You double the thickest skins for a sole and stitch the uppers round them.'),
    SEW('Ratskin Cap', 2, 60, 68, [['Ratskin', 6]], 'You fit the skins to a crown, tails to the back, and sew them close.'),
    SEW('Ratskin Leggings', 3, 75, 87, [['Ratskin', 8]], 'You piece the skins down each leg and lace the waist.'),
    SEW('Ratskin Jerkin', 4, 90, 106, [['Ratskin', 10]], 'You lay the skins in overlapping rows and stitch each row to the one above.'),
    SEW('Crabshell Gauntlets', 2, 120, 135, [['Crabshell Plate', 40]], 'You match the smaller plates to the back of the hand and lace them over a leather glove.'),
    SEW('Crabshell Sabatons', 3, 120, 138, [['Crabshell Plate', 40]], 'You pare the plates to the curve of the foot and stitch them over the boot.'),
    SEW('Crabshell Helm', 4, 150, 177, [['Crabshell Plate', 55]], 'You fit the plates into a bowl, edge over edge, and line it.'),
    SEW('Crabshell Shield', 5, 180, 218, [['Shellback Plate', 40]], 'You lay the broad plates across a frame and bind them at the rim.'),
    SEW('Crabshell Greaves', 6, 180, 223, [['Shellback Plate', 40]], 'You shape the plates to the shin and knee and strap them together.'),
    SEW('Crabshell Cuirass', 7, 240, 304, [['Shellback Plate', 55]], 'You build the breastplate up plate by plate, the heaviest at the middle.'),
    {
        name: 'Set Knuckle Ring', skill: 'Crafting', output_item_name: 'Knuckle Ring', output_qty: 1,
        inputs: inputs(['Agropelter Knuckle', 1], ['Ambren Ingot', 1], ['Ratskin', 10]),
        required_level: 8, timer_seconds: 120, xp: 156, station: 'lapidary', required_tools: JSON.stringify(['jewelers_pliers']), for_skill: 'Melee',
        flavor_text: 'You draw a heavy band, seat the knuckle on it, and bind it fast with strips of ratskin.',
    },
    {
        name: 'Make Jackalope Charm', skill: 'Crafting', output_item_name: 'Jackalope Charm', output_qty: 1,
        inputs: inputs(['Jackalope Antler', 1], ['Jackalope Pelt', 10]),
        required_level: 10, timer_seconds: 120, xp: 163, station: 'lapidary', required_tools: JSON.stringify(['jewelers_pliers']), for_skill: 'Melee',
        flavor_text: 'You twist the pelt into a cord, bore the tine, and knot it on.',
    },
];

const CLOAK_RECIPE = 'Sew Wolfskin Cloak';
const CLOAK_BEFORE = inputs(['Wolf Pelt', 20]);
const CLOAK_AFTER = inputs(['Wolf Pelt', 20], ['Wolf Fang', 1]);

function inputNames(row: Row): string[] {
    return (JSON.parse(String(row.inputs)) as { itemName: string }[]).map(i => i.itemName);
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    for (const item of ITEMS) {
        const existing = await knex('items').where({ name: item.name }).first('id');
        if (existing) await knex('items').where({ id: existing.id }).update(item);
        else await knex('items').insert({ ...item, is_active: true });
    }

    for (const recipe of RECIPES) {
        for (const name of [String(recipe.output_item_name), ...inputNames(recipe)]) {
            if (!(await knex('items').where({ name }).first('id'))) throw new Error(`fighters_crafts: item "${name}" not found`);
        }
        const existing = await knex('recipes').where({ name: recipe.name }).first('id');
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert({ ...recipe, mode: 'active', is_active: true });
    }

    if (!(await knex('items').where({ name: 'Wolf Fang' }).first('id'))) throw new Error('fighters_crafts: item "Wolf Fang" not found');
    const cloak = await knex('recipes').where({ name: CLOAK_RECIPE }).update({ inputs: CLOAK_AFTER });
    if (cloak !== 1) throw new Error(`fighters_crafts: recipe "${CLOAK_RECIPE}" not found`);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('recipes').whereIn('name', RECIPES.map(r => r.name)).delete();
    await knex('recipes').where({ name: CLOAK_RECIPE }).update({ inputs: CLOAK_BEFORE });
}
