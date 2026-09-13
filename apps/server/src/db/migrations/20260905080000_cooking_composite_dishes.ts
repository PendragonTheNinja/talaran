import type { Knex } from 'knex';

/**
 * Cooking, part 3: composite dishes.
 *
 * Two to five ingredients producing one item that heals far more than its parts
 * would separately. This is where produce, herbs, dairy and flour find a use,
 * and where most Cooking levels are earned.
 *
 * HONEY DISHES ARE NOT HERE. The preserves, tarts and honey cakes need honey,
 * which arrives with beekeeping. They ship in that migration so this one has no
 * dangling ingredients.
 *
 * Dish level follows the highest-level ingredient it uses, from
 * docs/cooking-outline.md. Cow is Husbandry 9, so every dish with milk, butter,
 * cheese or beef sits at 9 or above. That single fact splits the list into an
 * early no-dairy band and everything after.
 *
 * Tools gate the dishes rather than the skill: a broth needs a cauldron, an
 * omelette needs a skillet. Only the hearth is required for the cookhouse to
 * work at all, so each extra tool opens the recipes that name it.
 */

type Dish = {
    name: string;
    level: number;
    heal: number;
    /** [itemName, qty] or { subtype, qty, label } for "any cooked fish" */
    inputs: Array<[string, number] | { subtype: string; qty: number; label: string }>;
    tools: string[];
    timer: number;
    /** which burnt item a failure produces */
    burnt: 'pottage' | 'pastry';
    flavor: string;
    description: string;
};

const DISHES: Dish[] = [
    // ── Early, no dairy ───────────────────────────────────────────
    {
        name: 'Root Pottage', level: 3, heal: 26, timer: 45, burnt: 'pottage',
        inputs: [['Carrot', 1], ['Turnip', 1], ['Onion', 1]], tools: ['cauldron'],
        flavor: 'You are setting roots to simmer.',
        description: 'Roots simmered soft and salted. Plain, hot, and enough.',
    },
    {
        name: 'Coney Stew', level: 4, heal: 32, timer: 55, burnt: 'pottage',
        inputs: [['Rabbit Meat', 1], ['Carrot', 1], ['Onion', 1], ['Wild Thyme', 1]],
        tools: ['cauldron', 'cooking_knife'],
        flavor: 'You are jointing a rabbit into the pot.',
        description: 'Rabbit stewed down with roots until it falls off the bone.',
    },
    {
        name: 'Fern and Garlic Fry', level: 5, heal: 34, timer: 40, burnt: 'pottage',
        inputs: [['Fiddlehead Ferns', 2], ['Garlic', 1]], tools: ['skillet'],
        flavor: 'You are tossing fiddleheads in a hot pan.',
        description: 'Young fern heads caught quickly in a hot pan with garlic.',
    },
    {
        name: 'Mushroom Pottage', level: 6, heal: 38, timer: 50, burnt: 'pottage',
        inputs: [['Chanterelle Mushroom', 2], ['Onion', 1], ['Wild Thyme', 1]],
        tools: ['cauldron'],
        flavor: 'You are stirring mushrooms into the pot.',
        description: 'Chanterelles cooked down dark and earthy with thyme.',
    },
    {
        name: 'Venison and Root Stew', level: 6, heal: 40, timer: 60, burnt: 'pottage',
        inputs: [['Venison', 1], ['Turnip', 1], ['Carrot', 1], ['Garlic', 1]],
        tools: ['cauldron', 'meat_cleaver'],
        flavor: 'You are breaking venison down for the pot.',
        description: 'Venison and roots given long enough to forget they were tough.',
    },
    {
        name: 'Flatbread', level: 6, heal: 28, timer: 40, burnt: 'pastry',
        inputs: [['Flour', 2]], tools: ['hearth'],
        flavor: 'You are pressing out flatbread.',
        description: 'Flour and water pressed flat and blistered on the stone.',
    },
    {
        name: 'Oatcake', level: 7, heal: 32, timer: 45, burnt: 'pastry',
        inputs: [['Flour', 1], ['Wild Grain', 1]], tools: ['hearth'],
        flavor: 'You are baking oatcakes on the stone.',
        description: 'Coarse, dry and filling. Keeps for days in a pack.',
    },
    {
        name: 'Watercress Broth', level: 8, heal: 44, timer: 50, burnt: 'pottage',
        inputs: [['Watercress', 2], ['Onion', 1], ['Wild Grain', 1]], tools: ['cauldron', 'ladle'],
        flavor: 'You are wilting watercress into broth.',
        description: 'A thin green broth, peppery and sharper than it looks.',
    },

    // ── Dairy and flour ───────────────────────────────────────────
    {
        name: 'Buttered Eggs', level: 9, heal: 46, timer: 40, burnt: 'pottage',
        inputs: [['Egg', 2], ['Butter', 1]], tools: ['skillet'],
        flavor: 'You are turning eggs slowly in butter.',
        description: 'Eggs taken off the heat while still loose, soft with butter.',
    },
    {
        name: 'Fish Stew', level: 10, heal: 52, timer: 60, burnt: 'pottage',
        inputs: [{ subtype: 'cooked_fish', qty: 2, label: 'cooked fish' }, ['Carrot', 1], ['Onion', 1], ['Garlic', 1]],
        tools: ['cauldron', 'ladle'],
        flavor: 'You are flaking fish into the pot.',
        description: 'Whatever came out of the water, flaked into broth with roots.',
    },
    {
        name: 'Cottage Loaf', level: 10, heal: 54, timer: 70, burnt: 'pastry',
        inputs: [['Flour', 3], ['Bucket of Milk', 1]], tools: ['hearth'],
        flavor: 'You are shaping a loaf for the hearth.',
        description: 'A proper loaf with a hard crust and a soft, open crumb.',
    },
    {
        name: 'Beef and Root Stew', level: 10, heal: 56, timer: 70, burnt: 'pottage',
        inputs: [['Beef', 1], ['Turnip', 1], ['Carrot', 1], ['Garlic', 1]],
        tools: ['cauldron', 'meat_cleaver'],
        flavor: 'You are browning beef for the pot.',
        description: 'Beef stewed until the roots have taken all the flavour they can.',
    },
    {
        name: 'Herb Bannock', level: 11, heal: 58, timer: 60, burnt: 'pastry',
        inputs: [['Flour', 2], ['Wild Thyme', 1], ['Butter', 1]], tools: ['hearth'],
        flavor: 'You are working thyme into the dough.',
        description: 'A flat buttered loaf, green-flecked and smelling of thyme.',
    },
    {
        name: 'Nettle Broth', level: 11, heal: 58, timer: 55, burnt: 'pottage',
        inputs: [['Stinging Nettle', 2], ['Onion', 1], ['Wild Grain', 1], ['Butter', 1]],
        tools: ['cauldron', 'ladle'],
        flavor: 'You are boiling the sting out of nettles.',
        description: 'Nettles boiled until they lose their nerve. Better than it sounds.',
    },
    {
        name: 'Mussel Chowder', level: 11, heal: 60, timer: 65, burnt: 'pottage',
        inputs: [['River Mussel', 3], ['Bucket of Milk', 1], ['Onion', 1], ['Butter', 1]],
        tools: ['cauldron', 'ladle'],
        flavor: 'You are steaming mussels open over the fire.',
        description: 'Mussels steamed open and stirred through milk and butter.',
    },
    {
        name: 'Hazelnut Loaf', level: 12, heal: 62, timer: 75, burnt: 'pastry',
        inputs: [['Flour', 3], ['Hazelnuts', 2], ['Butter', 1]], tools: ['hearth', 'mortar_pestle'],
        flavor: 'You are folding crushed hazelnuts through dough.',
        description: 'Dense and sweet-edged, shot through with crushed hazelnut.',
    },
    {
        name: 'Onion Pasty', level: 12, heal: 64, timer: 70, burnt: 'pastry',
        inputs: [['Flour', 2], ['Onion', 2], ['Butter', 1]], tools: ['hearth', 'cooking_knife'],
        flavor: 'You are crimping the edge of a pasty.',
        description: 'Onions cooked to sweetness and shut inside a buttered crust.',
    },
    {
        name: 'Morel Omelette', level: 12, heal: 66, timer: 55, burnt: 'pottage',
        inputs: [['Egg', 3], ['Morel Mushroom', 2], ['Butter', 1]], tools: ['skillet'],
        flavor: 'You are folding morels into an omelette.',
        description: 'Eggs folded over morels while the middle is still soft.',
    },
    {
        name: "Poacher's Pie", level: 13, heal: 68, timer: 80, burnt: 'pastry',
        inputs: [['Flour', 2], ['Rabbit Meat', 1], ['Pheasant Meat', 1], ['Onion', 1]],
        tools: ['hearth', 'meat_cleaver', 'cooking_knife'],
        flavor: 'You are laying game into a pie dish.',
        description: 'Whatever the snares gave up, under a lid of pastry.',
    },
    {
        name: 'Curd Tart', level: 13, heal: 68, timer: 70, burnt: 'pastry',
        inputs: [['Flour', 2], ['Cheese', 1], ['Egg', 1]], tools: ['hearth'],
        flavor: 'You are pouring curds into a pastry case.',
        description: 'Fresh curds set with egg in a thin pastry case.',
    },
    {
        name: 'Cheese and Onion Pasty', level: 13, heal: 70, timer: 75, burnt: 'pastry',
        inputs: [['Flour', 2], ['Cheese', 1], ['Onion', 1], ['Butter', 1]],
        tools: ['hearth', 'cooking_knife'],
        flavor: 'You are folding cheese and onion into pastry.',
        description: 'Sharp cheese and soft onion, hot enough to burn your mouth.',
    },

    // ── Top of the island ─────────────────────────────────────────
    {
        name: 'Fish Pie', level: 14, heal: 78, timer: 85, burnt: 'pastry',
        inputs: [['Flour', 2], { subtype: 'cooked_fish', qty: 2, label: 'cooked fish' }, ['Bucket of Milk', 1], ['Butter', 1]],
        tools: ['hearth', 'ladle'],
        flavor: 'You are layering fish under a crust.',
        description: 'Fish and milk under a browned crust, steaming when it is cut.',
    },
    {
        name: 'Cheese Twist', level: 16, heal: 86, timer: 80, burnt: 'pastry',
        inputs: [['Flour', 2], ['Cheese', 1], ['Egg', 1], ['Butter', 1]], tools: ['hearth'],
        flavor: 'You are twisting cheese through the dough.',
        description: 'Pastry turned over on itself with cheese between every fold.',
    },
    {
        name: 'Truffled Eggs', level: 18, heal: 94, timer: 70, burnt: 'pottage',
        inputs: [['Egg', 2], ['Truffle', 1], ['Butter', 1]], tools: ['skillet', 'cooking_knife'],
        flavor: 'You are shaving truffle over eggs.',
        description: 'Eggs left overnight beside a truffle, then cooked slow in butter.',
    },
    {
        name: 'Garlic Roast Pork', level: 18, heal: 96, timer: 95, burnt: 'pottage',
        inputs: [['Pork', 1], ['Garlic', 2], ['Butter', 1]], tools: ['hearth', 'flesh_hook'],
        flavor: 'You are studding pork with garlic.',
        description: 'Pork studded with garlic and turned until the skin cracks.',
    },
    {
        name: 'Truffle and Egg Pie', level: 18, heal: 98, timer: 100, burnt: 'pastry',
        inputs: [['Flour', 2], ['Truffle', 1], ['Egg', 2], ['Butter', 1]],
        tools: ['hearth', 'cooking_knife'],
        flavor: 'You are setting truffle and egg under pastry.',
        description: 'Extravagant and quiet about it. Truffle and egg beneath pastry.',
    },
    {
        name: 'Game Pie', level: 18, heal: 100, timer: 110, burnt: 'pastry',
        inputs: [['Flour', 3], ['Sloth Meat', 1], ['Boar Meat', 1], ['Onion', 1], ['Butter', 1]],
        tools: ['hearth', 'meat_cleaver', 'flesh_hook'],
        flavor: 'You are packing a pie with mixed game.',
        description: 'Everything the hunt brought back, under one raised crust.',
    },
];

const RUNGS = [1, 13, 25, 37, 50, 62, 75, 87, 100];
function tierOfLevel(level: number): number {
    let tier = 1;
    for (let i = 0; i < RUNGS.length; i++) if (level >= RUNGS[i]) tier = i + 1;
    return tier;
}

export async function up(knex: Knex): Promise<void> {
    // Burnt variants for the two new dish families.
    const burnt = [
        {
            name: 'Burnt Pottage', type: 'food', subtype: 'burnt', tier: 1, level_required: 1,
            description: 'Caught on the bottom and stirred through. The whole pot tastes of it.',
            heal_amount: null, is_active: true,
        },
        {
            name: 'Burnt Pastry', type: 'food', subtype: 'burnt', tier: 1, level_required: 1,
            description: 'Black underneath and raw in the middle. A rare achievement.',
            heal_amount: null, is_active: true,
        },
    ];
    for (const b of burnt) {
        const existing = await knex('items').where({ name: b.name }).first();
        if (!existing) await knex('items').insert(b);
    }

    // Every named ingredient must already exist, or the dish would be uncookable.
    const named = new Set<string>();
    for (const d of DISHES) {
        for (const input of d.inputs) if (Array.isArray(input)) named.add(input[0]);
    }
    for (const name of named) {
        const item = await knex('items').where({ name }).first();
        if (!item) {
            throw new Error(`Cooking part 3: no item named "${name}". Check Farming, Foraging and Husbandry content shipped first.`);
        }
    }

    // XP per docs/xp-rebalance.md section 8, crafting policy 1.8, corrected for
    // burning: a burn pays half, so the listed value is divided by the expected
    // share or Cooking quietly underpays at every level.
    const rHat = (u: number) => 2000 * Math.pow(1.33, (u - 1) / 12);
    const targetFor = (u: number) => 1.8 * 1.10 * rHat(u);

    for (const d of DISHES) {
        const existingItem = await knex('items').where({ name: d.name }).first();
        if (!existingItem) {
            await knex('items').insert({
                name: d.name,
                type: 'food',
                subtype: d.burnt === 'pastry' ? 'baked' : 'dish',
                tier: tierOfLevel(d.level),
                level_required: 1,
                heal_amount: d.heal,
                description: d.description,
                is_active: true,
            });
        }

        const existingRecipe = await knex('recipes').where({ name: d.name }).first();
        if (existingRecipe) continue;

        // burn_base is 30 / sqrt(ingredient count): a five-ingredient pie drawn
        // from four skills should not be punished five times as hard as a fish
        // for the same mistake. burn_stop is +12 for composites, which clear
        // faster than direct cooking because they arrive later and cost more.
        const count = d.inputs.length;
        const burnBase = Math.round((30 / Math.sqrt(count)) * 10) / 10;
        const expectedShare = 1 - (burnBase / 100) / 2;
        const xp = Math.round((targetFor(d.level) * d.timer / 3600) / expectedShare);

        const inputs = d.inputs.map(input =>
            Array.isArray(input)
                ? { itemName: input[0], qty: input[1] }
                : { subtype: input.subtype, qty: input.qty, label: input.label },
        );

        await knex('recipes').insert({
            skill: 'Cooking',
            name: d.name,
            output_item_name: d.name,
            output_qty: 1,
            inputs: JSON.stringify(inputs),
            required_level: d.level,
            timer_seconds: d.timer,
            xp,
            station: 'cooking',
            required_tools: JSON.stringify(d.tools),
            burn_base: burnBase,
            burn_stop: d.level + 12,
            mode: 'active',
            for_skill: 'Cooking',
            flavor_text: d.flavor,
            is_active: true,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const names = DISHES.map(d => d.name);
    await knex('recipes').whereIn('name', names).delete();
    await knex('items').whereIn('name', names).delete();
    await knex('items').whereIn('name', ['Burnt Pottage', 'Burnt Pastry']).delete();
}
