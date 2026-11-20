import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// What Antura's drops are made into (docs/antura-plan.md §10), Taiar's
// fighters' crafts one tier up (20261117130000). Every recipe is Crafting,
// finished goods by the law: 1.8 x 1.10 x band(level) x timer / 3600.
//
//   Snallyscale set   six pieces, Snallyscales alone (226 for the set, about
//                     900 Snallygaster kills, as Crabshell's plates take about
//                     the hours the old drops did). Armour 1.2 times the late
//                     Serph piece of its level, as Crabshell is 1.2 times late
//                     Ambren; and it outlasts metal, one step past Crabshell:
//                     800 sure uses, then 0.3% (Crabshell 600 and 0.4%).
//   Bearverine Mantle the tier 2 cloak (Nathan named it, 2026-11-17): 20
//                     Wolverine Pelts and 18 Cave Bear Pelts, 7 armour, worn
//                     from Defense 20.
//   Heartstone Ring   +4 power and +14 aim, simulated 2026-11-20 (combatSim's
//   Kelpie's Bridle   kits at combat 20): about 4.4% and 4.5% more kills an
//     Charm           hour each, as the Knuckle Ring and Jackalope Charm give at
//                     combat 10 (+16 aim, the draft, was 5.1%). Made at the
//                     lapidary, worn on Melee.
//   Snallyscale       its subtype becomes 'shell', the plates' own, so it sells
//                     where Crabshell Plates do (services/marketplace.ts).

type Row = Record<string, unknown> & { name: string };

const SCALE = (name: string, slot: string, level: number, armour: number, description: string): Row => ({
    name, type: 'armor', subtype: 'shell_armor', slot, tier: 2, level_required: level, armour,
    durability_uses: 800, durability_break_pct: 0.3, description,
});

const ITEMS: Row[] = [
    SCALE('Snallyscale Gauntlets', 'hands', 19, 16, 'Gauntlets of small snallyscales lapped over the back of the hand like roof tiles.'),
    SCALE('Snallyscale Sabatons', 'feet', 20, 16, 'Foot guards of overlapping snallyscales, curved to the toe, laced over the boot.'),
    SCALE('Snallyscale Helm', 'head', 21, 22, 'A close helm of snallyscales built up in rings, the largest across the brow, dark and dull.'),
    SCALE('Snallyscale Shield', 'offhand', 22, 26, 'A round shield faced with the broadest snallyscales, the ridges set to turn a blow aside.'),
    SCALE('Snallyscale Greaves', 'legs', 23, 26, 'Leg guards of snallyscales shaped to the shin and knee, strapped behind.'),
    SCALE('Snallyscale Cuirass', 'chest', 24, 35, 'A breastplate of snallyscales, hundreds of them, the heaviest over the heart. It creaks like an old ship when you breathe.'),
    {
        name: 'Bearverine Mantle', type: 'armor', subtype: 'cloak', slot: 'back', tier: 2, level_required: 20, armour: 7,
        description: 'A heavy cloak of cave bear fur with a collar and edging of wolverine, thick enough to sleep out on the high passes.',
    },
    {
        name: 'Heartstone Ring', type: 'jewelry', subtype: 'ring', slot: 'finger', tier: 2, level_required: 18, power: 4,
        description: "A thick band of Serph with a bolter's heartstone set in it, bound round with wolverine hide. A blow from that hand lands like a falling rock.",
    },
    {
        name: "Kelpie's Bridle Charm", type: 'jewelry', subtype: 'amulet', slot: 'neck', tier: 2, level_required: 20, aim: 14,
        description: "A rough garnet strung on a twist of the kelpie's bridle, hung with a tuft of feathers. Hold it and your aim runs true as a horse to its stable.",
    },
];

const inputs = (...pairs: [string, number][]) => JSON.stringify(pairs.map(([itemName, qty]) => ({ itemName, qty })));

const SEW = (item: string, level: number, timer: number, xp: number, input: [string, number][], flavor: string): Row => ({
    name: `Sew ${item}`, skill: 'Crafting', output_item_name: item, output_qty: 1, inputs: inputs(...input),
    required_level: level, timer_seconds: timer, xp, station: null, required_tools: null, for_skill: 'Defense', flavor_text: flavor,
});

const RECIPES: Row[] = [
    SEW('Snallyscale Gauntlets', 14, 120, 180, [['Snallyscale', 23]], 'You sort the smallest scales and lap them over a leather glove, one row at a time.'),
    SEW('Snallyscale Sabatons', 15, 120, 184, [['Snallyscale', 23]], 'You curve the scales to the toe and lace them over the boot.'),
    SEW('Snallyscale Helm', 16, 150, 236, [['Snallyscale', 30]], 'You build the scales up in rings, the largest at the brow, and line the bowl.'),
    SEW('Snallyscale Shield', 18, 180, 297, [['Snallyscale', 45]], 'You face a round frame with the broadest scales and set the ridges to turn a blow.'),
    SEW('Snallyscale Greaves', 19, 180, 304, [['Snallyscale', 45]], 'You shape the scales to shin and knee and strap them behind.'),
    SEW('Snallyscale Cuirass', 21, 240, 425, [['Snallyscale', 60]], 'You build the breastplate up scale by scale, the heaviest over the heart.'),
    SEW('Bearverine Mantle', 20, 200, 346, [['Wolverine Pelt', 20], ['Cave Bear Pelt', 18]], 'You join the bear pelts into a mantle and edge it all round with wolverine.'),
    {
        name: 'Set Heartstone Ring', skill: 'Crafting', output_item_name: 'Heartstone Ring', output_qty: 1,
        inputs: inputs(["Bolter's Heartstone", 1], ['Serph Ingot', 1], ['Wolverine Pelt', 10]),
        required_level: 18, timer_seconds: 120, xp: 198, station: 'lapidary', required_tools: JSON.stringify(['jewelers_pliers']), for_skill: 'Melee',
        flavor_text: 'You draw a thick band of Serph, seat the heartstone, and bind it round with wolverine hide.',
    },
    {
        name: "Make Kelpie's Bridle Charm", skill: 'Crafting', output_item_name: "Kelpie's Bridle Charm", output_qty: 1,
        inputs: inputs(["Kelpie's Bridle", 1], ['Rough Garnet', 1], ['Feathers', 20]),
        required_level: 20, timer_seconds: 120, xp: 207, station: 'lapidary', required_tools: JSON.stringify(['jewelers_pliers']), for_skill: 'Melee',
        flavor_text: 'You twist a cord from the bridle, string the garnet on it, and tie in a tuft of feathers.',
    },
];

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
            if (!(await knex('items').where({ name }).first('id'))) throw new Error(`antura_fighters_crafts: item "${name}" not found`);
        }
        const existing = await knex('recipes').where({ name: recipe.name }).first('id');
        if (existing) await knex('recipes').where({ id: existing.id }).update(recipe);
        else await knex('recipes').insert({ ...recipe, mode: 'active', is_active: true });
    }

    const scale = await knex('items').where({ name: 'Snallyscale' }).update({ subtype: 'shell' });
    if (scale !== 1) throw new Error('antura_fighters_crafts: item "Snallyscale" not found (run 20261120200000 first)');
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    await knex('recipes').whereIn('name', RECIPES.map(r => r.name)).delete();
    await knex('items').where({ name: 'Snallyscale' }).update({ subtype: 'scale' });
}
