import type { Knex } from 'knex';
import { hasContent } from '../../lib/migrationContent';

// Antura's cooking, part one (docs/antura-plan.md §11, Nathan's list of
// 2026-11-15): a plain cooked version of each new fish at its own level, the
// thirteen dishes at 19 to 24, and two provisions (Crafting and Cooking). Ale
// and the salt pinch are new mechanics and come next, on their own.
//
//   Cooked fish  30 s, as Taiar's; burn stops 20 levels over; heals 38, 45, 52, 58.
//   Dishes       85 to 130 s; burn stops 12 levels over, except Salt Fish
//                (cured) and Gooseberry Fool (never cooked), which cannot burn.
//   XP           the band for the timer, at the ratios Taiar's rows were set by:
//                about 2.1 for a cooked fish and 1.96 for a dish or provision.
//   "Any fish"   Salt Fish takes any two raw fish, the broth and Shore Pie any
//                two cooked, through the recipe wildcard (services/recipes.ts).
//   Every dish has one tier 2 ingredient, so older ones stay in use (CLAUDE.md §2).

type In = { itemName: string; qty: number } | { subtype: string; qty: number; label: string };
interface Dish {
    name: string; level: number; timer: number; xp: number; heal: number; subtype: string;
    inputs: In[]; tools: string[]; burn: [number, number] | null; flavor: string; description: string;
    buff?: { effect: string; skill: string; magnitude: number; seconds: number };
}

const FISH: Array<[string, number, number, number, string]> = [
    // raw, level, xp, heals, description
    ['Tench', 13, 51, 38, 'Tench baked until the skin crisps. It tastes faintly of the lake, which some people like.'],
    ['Mackerel', 13, 51, 38, 'Mackerel grilled until the skin blisters, rich and oily.'],
    ['Rudd', 16, 55, 45, 'Rudd fried whole, the red fins gone dark and crunchy. Mind the bones.'],
    ['Pollock', 16, 55, 45, "Pollock baked in big white flakes. Plain, filling, and nobody's favorite."],
    ['Zander', 19, 59, 52, 'White zander flesh in thick flakes, firm and clean-tasting.'],
    ['Sea Bass', 19, 59, 52, 'Sea bass with crisp silver skin and sweet white flesh underneath.'],
    ['Glassback', 22, 64, 58, 'Glassback poached until the clear flesh goes white as milk. Soft, sweet, and gone in three bites.'],
    ['Turbot', 22, 64, 58, 'A whole turbot, baked, the flesh thick and pearly. A feast, if you can carry it.'],
];

const anyRaw = (qty: number): In => ({ subtype: 'raw_fish', qty, label: 'Any Raw Fish' });
const anyCooked = (qty: number): In => ({ subtype: 'cooked_fish', qty, label: 'Any Cooked Fish' });
const i = (itemName: string, qty: number): In => ({ itemName, qty });

const DISHES: Dish[] = [
    { name: 'Barley Pottage', level: 19, timer: 90, xp: 165, heal: 102, subtype: 'dish', inputs: [i('Barley', 2), i('Leek', 1), i('Onion', 1)], tools: ['cauldron', 'ladle'], burn: [15, 31],
      flavor: 'You simmer the barley with leek and onion, stirring until it thickens.',
      description: 'Barley simmered soft with leek and onion until it thickens. The meal that keeps the farms of Farefield going.' },
    { name: 'Buttered Samphire', level: 19, timer: 85, xp: 157, heal: 100, subtype: 'dish', inputs: [i('Samphire', 3), i('Butter', 1)], tools: ['skillet'], burn: [21.2, 31],
      flavor: 'You turn the samphire in hot butter until it shines.',
      description: 'Samphire turned in hot butter until it shines. Salty, green, and gone in a moment.' },
    { name: 'Salt Fish', level: 20, timer: 90, xp: 169, heal: 104, subtype: 'dish', inputs: [anyRaw(2), i('Sea Salt', 2)], tools: ['cooking_knife'], burn: null,
      flavor: 'You split the fish, pack them in salt, and hang them to dry.',
      description: 'Fish split, packed in sea salt, and dried hard as a plank. It keeps for months and tastes of exactly that.' },
    { name: 'Buttered Worts', level: 20, timer: 95, xp: 178, heal: 106, subtype: 'dish', inputs: [i('Cabbage', 1), i('Leek', 1), i('Butter', 1)], tools: ['cauldron'], burn: [17.3, 32],
      flavor: 'You stew the cabbage and leek down in butter until both are soft.',
      description: 'Cabbage and leek stewed down in butter, green and soft. An old dish, and a plain one.' },
    { name: 'Bean and Barley Stew', level: 21, timer: 105, xp: 202, heal: 112, subtype: 'dish', inputs: [i('Broad Beans', 2), i('Barley', 1), i('Garlic', 1), i('Onion', 1)], tools: ['cauldron', 'ladle'], burn: [15, 33],
      flavor: 'You stew the beans and barley with garlic and onion until the spoon stands up.',
      description: 'Broad beans and barley in a thick brown stew with garlic and onion. Heavy enough to stand a spoon in.' },
    { name: 'Pickled Beet', level: 21, timer: 100, xp: 192, heal: 110, subtype: 'dish', inputs: [i('Beet', 2), i('Sea Salt', 1), i('Honey', 1)], tools: ['cauldron', 'cooking_knife'], burn: [21.2, 33],
      flavor: 'You slice the beets into a sharp brine sweetened with honey.',
      description: 'Slices of beet in a sharp brine sweetened with honey, deep red and glistening in the jar.' },
    { name: 'Mackerel in Gooseberry Sauce', level: 22, timer: 105, xp: 208, heal: 118, subtype: 'dish', inputs: [i('Cooked Mackerel', 1), i('Gooseberry', 2), i('Butter', 1)], tools: ['skillet'], burn: [17.3, 34],
      flavor: 'You stew the gooseberries in butter and spoon the sauce over the mackerel.',
      description: 'Grilled mackerel under a sharp green sauce of stewed gooseberries. The sourness cuts the oil.' },
    { name: 'Leek and Cheese Tart', level: 22, timer: 110, xp: 218, heal: 118, subtype: 'baked', inputs: [i('Flour', 2), i('Leek', 2), i('Cheese', 1), i('Egg', 1)], tools: ['hearth', 'cooking_knife'], burn: [15, 34],
      flavor: 'You fill the pastry with leeks and cheese, set it with an egg, and bake it brown.',
      description: 'A pastry case full of soft leeks and melted cheese, set with an egg and browned on top.' },
    { name: 'Samphire and Fish Broth', level: 23, timer: 115, xp: 233, heal: 124, subtype: 'dish', inputs: [i('Samphire', 2), anyCooked(2), i('Leek', 1)], tools: ['cauldron', 'ladle'], burn: [15, 35],
      flavor: 'You flake the fish into a clear broth and float the samphire on top.',
      description: 'A clear broth with flakes of cooked fish, leek, and samphire floating green in it.' },
    { name: 'Gooseberry Fool', level: 23, timer: 95, xp: 192, heal: 122, subtype: 'dish', inputs: [i('Gooseberry', 3), i('Milk', 1), i('Honey', 1)], tools: ['mortar_pestle'], burn: null,
      flavor: 'You crush the gooseberries and fold them into honeyed milk.',
      description: 'Crushed gooseberries folded into honeyed milk, pale green and sharp-sweet. Never cooked, so it can never burn.' },
    { name: 'Beans and Pork', level: 23, timer: 115, xp: 233, heal: 126, subtype: 'dish', inputs: [i('Pork', 1), i('Broad Beans', 2), i('Onion', 1)], tools: ['cauldron', 'meat_cleaver'], burn: [15, 35],
      flavor: 'You stew the pork with beans and onion until the beans fall apart.',
      description: 'Salt pork stewed with broad beans and onion until the beans fall apart.' },
    { name: 'Salt Beef and Cabbage', level: 24, timer: 120, xp: 249, heal: 130, subtype: 'dish', inputs: [i('Beef', 1), i('Sea Salt', 1), i('Cabbage', 1), i('Beet', 1)], tools: ['cauldron', 'meat_cleaver'], burn: [15, 36],
      flavor: 'You boil the salted beef with cabbage and beet until the whole pot runs red.',
      description: 'Boiled salt beef with cabbage and beet, the whole pot stained red.' },
    { name: 'Shore Pie', level: 24, timer: 130, xp: 269, heal: 132, subtype: 'baked', inputs: [i('Flour', 2), i('Samphire', 2), anyCooked(2), i('Butter', 1)], tools: ['hearth', 'ladle'], burn: [13.4, 36],
      flavor: 'You lay fish and samphire in a deep dish and close it under a butter crust.',
      description: 'A deep pie of fish and samphire under a butter crust. The fishwives of Wendhaven claim it, and so does everyone else.' },
    // Provisions (§11, Nathan, 2026-11-15): a finished dish plus one or two things.
    { name: "Crafter's Pottage", level: 20, timer: 95, xp: 178, heal: 44, subtype: 'provision', inputs: [i('Barley Pottage', 1), i('Cheese', 1), i('Wild Thyme', 1)], tools: ['cauldron'], burn: [17.3, 32],
      buff: { effect: 'timer', skill: 'Crafting', magnitude: 1.5, seconds: 18000 },
      flavor: 'You crumble cheese into the pottage and scatter thyme over it.',
      description: 'A bowl of barley pottage with cheese crumbled in and wild thyme on top. Steady fare for steady hands.' },
    { name: "Cook's Supper", level: 21, timer: 100, xp: 192, heal: 46, subtype: 'provision', inputs: [i('Buttered Worts', 1), i('Cottage Loaf', 1), i('Sea Salt', 1)], tools: ['cooking_knife'], burn: [17.3, 33],
      buff: { effect: 'timer', skill: 'Cooking', magnitude: 1.5, seconds: 18000 },
      flavor: 'You set out the worts, cut the loaf, and salt it all to taste.',
      description: 'Buttered worts, a cottage loaf to wipe the bowl, and a pinch of salt on the side. The supper a cook makes for themselves at the end of the day.' },
];

const ALL_RECIPES = [...FISH.map(f => `Cooked ${f[0]}`), ...DISHES.map(d => d.name)];

async function upsert(knex: Knex, table: string, row: Record<string, unknown>) {
    const had = await knex(table).where({ name: row.name }).first('id');
    if (had) await knex(table).where({ id: had.id }).update(row);
    else await knex(table).insert(row);
}

export async function up(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;

    // Every named ingredient must exist; the dishes' own outputs are made below first.
    const made = new Set([...FISH.map(f => `Cooked ${f[0]}`), ...DISHES.map(d => d.name)]);
    const named = new Set<string>([...FISH.map(f => f[0]), ...DISHES.flatMap(d => d.inputs.flatMap(x => 'itemName' in x ? [x.itemName] : []))]);
    for (const n of named) {
        if (made.has(n)) continue;
        if (!(await knex('items').where({ name: n }).first('id'))) throw new Error(`antura_cooking: ingredient "${n}" not found`);
    }

    for (const [raw, level, xp, heal, description] of FISH) {
        const name = `Cooked ${raw}`;
        await upsert(knex, 'items', { name, type: 'food', subtype: 'cooked_fish', tier: 2, level_required: 1, heal_amount: heal, description, is_active: true });
        await upsert(knex, 'recipes', {
            name, skill: 'Cooking', output_item_name: name, output_qty: 1, inputs: JSON.stringify([{ itemName: raw, qty: 1 }]),
            required_level: level, timer_seconds: 30, xp, station: 'cooking', required_tools: JSON.stringify([]),
            burn_base: 30, burn_stop: level + 20, mode: 'active', for_skill: 'Cooking', is_active: true,
            flavor_text: `You cook the ${raw.toLowerCase()} over the flame until the flesh comes away clean.`,
        });
    }

    for (const d of DISHES) {
        await upsert(knex, 'items', {
            name: d.name, type: 'food', subtype: d.subtype, tier: 2, level_required: 1, heal_amount: d.heal, description: d.description, is_active: true,
            buff_effect: d.buff?.effect ?? null, buff_skill: d.buff?.skill ?? null, buff_magnitude: d.buff?.magnitude ?? null, buff_seconds: d.buff?.seconds ?? null,
        });
        await upsert(knex, 'recipes', {
            name: d.name, skill: 'Cooking', output_item_name: d.name, output_qty: 1, inputs: JSON.stringify(d.inputs),
            required_level: d.level, timer_seconds: d.timer, xp: d.xp, station: 'cooking', required_tools: JSON.stringify(d.tools),
            burn_base: d.burn?.[0] ?? null, burn_stop: d.burn?.[1] ?? null, mode: 'active', for_skill: 'Cooking', is_active: true,
            flavor_text: d.flavor,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (!(await hasContent(knex))) return;
    // Recipes go; items stay, as players may hold them.
    await knex('recipes').whereIn('name', ALL_RECIPES).delete();
}
