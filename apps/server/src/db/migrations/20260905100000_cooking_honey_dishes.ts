import type { Knex } from 'knex';

/**
 * Cooking, part 4: the honey dishes.
 *
 * Held back from the composite migration because they need honey, and honey
 * needs bees. Now that beekeeping ships, the preserve and pastry lines can
 * exist without any dangling ingredient.
 *
 * These are what give the berries a purpose. Rosehips, blackberries and
 * elderberry forage out of Bramble Thicket and had no consumer at all before
 * this, and strawberry and raspberry were farm crops that ended in the pack.
 *
 * Same rules as the other composites: level follows the highest ingredient,
 * burn scales inversely with ingredient count, XP is corrected for burning.
 */

type Dish = {
    name: string;
    level: number;
    heal: number;
    inputs: Array<[string, number]>;
    tools: string[];
    timer: number;
    burnt: 'pottage' | 'pastry';
    flavor: string;
    description: string;
};

const DISHES: Dish[] = [
    {
        name: 'Rosehip Syrup', level: 12, heal: 60, timer: 60, burnt: 'pottage',
        inputs: [['Rosehips', 3], ['Honey', 1]], tools: ['cauldron', 'mortar_pestle'],
        flavor: 'You are boiling rosehips down to syrup.',
        description: 'Rosehips boiled down thick and strained. Tart under the sweetness.',
    },
    {
        name: 'Bramble Conserve', level: 12, heal: 62, timer: 60, burnt: 'pottage',
        inputs: [['Blackberries', 3], ['Honey', 1]], tools: ['cauldron'],
        flavor: 'You are cooking blackberries down with honey.',
        description: 'Blackberries cooked down with honey until they hold their shape and no more.',
    },
    {
        name: 'Honey Cake', level: 12, heal: 66, timer: 70, burnt: 'pastry',
        inputs: [['Flour', 2], ['Honey', 1], ['Egg', 1], ['Butter', 1]], tools: ['hearth'],
        flavor: 'You are pouring honey through the batter.',
        description: 'Dark, heavy and sticky at the base where the honey settled.',
    },
    {
        name: 'Elderberry Cordial', level: 13, heal: 70, timer: 65, burnt: 'pottage',
        inputs: [['Elderberry', 3], ['Honey', 1], ['Bucket of Milk', 1]], tools: ['cauldron', 'ladle'],
        flavor: 'You are steeping elderberries for cordial.',
        description: 'Steeped dark and sweetened. Drunk hot against the cold months.',
    },
    {
        name: 'Strawberry Tart', level: 14, heal: 76, timer: 80, burnt: 'pastry',
        inputs: [['Flour', 2], ['Strawberry', 3], ['Honey', 1], ['Butter', 1]], tools: ['hearth'],
        flavor: 'You are laying strawberries into a pastry case.',
        description: 'Berries glazed with honey in a thin case, best eaten the day it is made.',
    },
    {
        name: 'Raspberry Tart', level: 15, heal: 82, timer: 85, burnt: 'pastry',
        inputs: [['Flour', 2], ['Raspberry', 3], ['Honey', 1], ['Butter', 1]], tools: ['hearth'],
        flavor: 'You are arranging raspberries under a glaze.',
        description: 'Sharper than the strawberry and better for it.',
    },
    {
        name: 'Lavender Honey Cake', level: 15, heal: 82, timer: 90, burnt: 'pastry',
        inputs: [['Flour', 2], ['Honey', 2], ['Lavender', 1], ['Egg', 1], ['Butter', 1]],
        tools: ['hearth', 'mortar_pestle'],
        flavor: 'You are bruising lavender into the honey.',
        description: 'Perfumed and just short of soapy. The line between the two is the skill.',
    },
    {
        name: 'Honey Glazed Boar', level: 15, heal: 84, timer: 95, burnt: 'pottage',
        inputs: [['Boar Meat', 1], ['Honey', 1], ['Garlic', 1], ['Butter', 1]],
        tools: ['hearth', 'flesh_hook'],
        flavor: 'You are basting boar with honey.',
        description: 'Basted until the outside turns to lacquer and catches on the teeth.',
    },
    {
        name: "Witch's Butter Confit", level: 16, heal: 84, timer: 85, burnt: 'pottage',
        inputs: [["Witch's Butter", 2], ['Honey', 1], ['Butter', 1]], tools: ['skillet'],
        flavor: "You are candying witch's butter in honey.",
        description: 'A jelly fungus candied slow in honey. Stranger than it tastes.',
    },
];

const RUNGS = [1, 13, 25, 37, 50, 62, 75, 87, 100];
function tierOfLevel(level: number): number {
    let tier = 1;
    for (let i = 0; i < RUNGS.length; i++) if (level >= RUNGS[i]) tier = i + 1;
    return tier;
}

export async function up(knex: Knex): Promise<void> {
    // Honey is the reason these were held back, so fail loudly rather than
    // silently creating dishes nobody can make.
    const honey = await knex('items').where({ name: 'Honey' }).first();
    if (!honey) {
        throw new Error('Cooking part 4: no Honey. The beekeeping migration must run first.');
    }

    const named = new Set<string>();
    for (const d of DISHES) for (const [name] of d.inputs) named.add(name);
    for (const name of named) {
        const item = await knex('items').where({ name }).first();
        if (!item) throw new Error(`Cooking part 4: no item named "${name}".`);
    }

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

        const count = d.inputs.length;
        const burnBase = Math.round((30 / Math.sqrt(count)) * 10) / 10;
        const expectedShare = 1 - (burnBase / 100) / 2;
        const xp = Math.round((targetFor(d.level) * d.timer / 3600) / expectedShare);

        await knex('recipes').insert({
            skill: 'Cooking',
            name: d.name,
            output_item_name: d.name,
            output_qty: 1,
            inputs: JSON.stringify(d.inputs.map(([itemName, qty]) => ({ itemName, qty }))),
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
}
