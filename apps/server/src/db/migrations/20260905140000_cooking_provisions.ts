import type { Knex } from 'knex';

/**
 * Cooking, part 5: provisions.
 *
 * Ten buff dishes, one per gathering trade, and five infusions. These are what
 * keep Cooking worth levelling for the majority who will never fight: a
 * skiller has no use for a heal, but every skiller wants a second off a timer.
 *
 * SMALL AND LONG. A second off an action, running four hours, so you keep a few
 * in the pack and eat the next when the last runs out. Not something to manage
 * during a session, something to remember at the start of one. Only one is ever
 * active, so choosing which trade to favour today actually costs something.
 *
 * Each buff dish takes a FINISHED DISH as an input. That gives the mid-tier
 * recipes a second life instead of being outgrown the moment a better heal
 * arrives, and it makes a buff genuinely expensive: a Ploughman's Lunch is a
 * whole Cottage Loaf plus cheese and an onion.
 *
 * Timer effects are seconds, not percentages, so the same buff is worth the
 * same on a 20 second chop as on a 300 second craft.
 */

type Provision = {
    name: string;
    level: number;
    heal: number;
    inputs: Array<[string, number]>;
    tools: string[];
    timer: number;
    burnt: 'pottage' | 'pastry' | null;   // null never burns
    effect: 'timer' | 'rare' | 'double' | 'travel';
    skill: string | null;                  // null applies to everything
    magnitude: number;
    seconds: number;
    flavor: string;
    description: string;
};

const PROVISIONS: Provision[] = [
    // ── Infusions ─────────────────────────────────────────────────
    // Cheap, short, weak, and the only real use for the medicinal herbs.
    // Gated on the mortar and pestle. Steeping is not something you scorch, so
    // none of them can burn.
    {
        name: 'Chamomile Tisane', level: 2, heal: 4, timer: 30, burnt: null,
        inputs: [['Chamomile', 2]], tools: ['mortar_pestle'],
        effect: 'timer', skill: null, magnitude: 1, seconds: 30 * 60,
        flavor: 'You are steeping chamomile heads.',
        description: 'Steeped pale gold and drunk slowly. Steadies the hands for half an hour.',
    },
    {
        name: 'Mint Tisane', level: 8, heal: 6, timer: 40, burnt: null,
        inputs: [['Wild Mint', 2]], tools: ['mortar_pestle'],
        effect: 'travel', skill: null, magnitude: 5, seconds: 60 * 60,
        flavor: 'You are bruising mint into hot water.',
        description: 'Sharp enough to clear the head. The miles go easier after it.',
    },
    {
        name: 'Meadowsweet Draught', level: 10, heal: 10, timer: 50, burnt: null,
        inputs: [['Meadowsweet', 2], ['Bucket of Milk', 1]], tools: ['mortar_pestle', 'cauldron'],
        effect: 'timer', skill: null, magnitude: 1, seconds: 2 * 60 * 60,
        flavor: 'You are simmering meadowsweet in milk.',
        description: 'Almond-sweet and faintly medicinal. Whatever you are doing, it goes quicker.',
    },
    {
        name: 'Dandelion Cordial', level: 11, heal: 10, timer: 55, burnt: null,
        inputs: [['Dandelion', 3], ['Honey', 1]], tools: ['mortar_pestle', 'cauldron'],
        effect: 'rare', skill: 'Foraging', magnitude: 1.5, seconds: 2 * 60 * 60,
        flavor: 'You are pressing dandelion heads for cordial.',
        description: 'Bitter under the honey. Foragers swear it sharpens the eye for what is worth taking.',
    },
    {
        name: 'Lavender Tisane', level: 12, heal: 12, timer: 55, burnt: null,
        inputs: [['Lavender', 2], ['Honey', 1]], tools: ['mortar_pestle'],
        effect: 'double', skill: null, magnitude: 2, seconds: 90 * 60,
        flavor: 'You are steeping lavender with honey.',
        description: 'Perfumed and calming. Work done under it seems to come out twice as often.',
    },

    // ── Buff dishes ───────────────────────────────────────────────
    // Named for the trade that eats them. Four hours each: long enough that you
    // set one going and forget it.
    {
        name: "Ploughman's Lunch", level: 12, heal: 30, timer: 70, burnt: 'pottage',
        inputs: [['Cottage Loaf', 1], ['Cheese', 1], ['Onion', 1]], tools: ['cooking_knife'],
        effect: 'timer', skill: 'Farming', magnitude: 1, seconds: 4 * 60 * 60,
        flavor: 'You are cutting bread and cheese for the field.',
        description: 'Bread, cheese and a raw onion. Eaten leaning on a gate, traditionally.',
    },
    {
        name: "Woodsman's Bannock", level: 13, heal: 32, timer: 75, burnt: 'pastry',
        inputs: [['Herb Bannock', 1], ['Butter', 1], ['Hazelnuts', 2]], tools: ['hearth'],
        effect: 'timer', skill: 'Woodcutting', magnitude: 1, seconds: 4 * 60 * 60,
        flavor: 'You are working nuts and butter through a bannock.',
        description: 'Heavy enough to carry a day of felling. Keeps in a pocket.',
    },
    {
        name: "Miner's Pasty", level: 14, heal: 34, timer: 80, burnt: 'pastry',
        inputs: [['Onion Pasty', 1], ['Cheese', 1], ['Wild Thyme', 1]], tools: ['hearth'],
        effect: 'timer', skill: 'Mining', magnitude: 1, seconds: 4 * 60 * 60,
        flavor: 'You are crimping a thicker edge onto a pasty.',
        description: 'A crust thick enough to hold in a dirty hand and throw away after.',
    },
    {
        name: "Fisherman's Stew", level: 14, heal: 34, timer: 80, burnt: 'pottage',
        inputs: [['Fish Stew', 1], ['Watercress', 1], ['Butter', 1]], tools: ['cauldron', 'ladle'],
        effect: 'timer', skill: 'Fishing', magnitude: 1, seconds: 4 * 60 * 60,
        flavor: 'You are enriching a stew with butter and cress.',
        description: 'Yesterday\'s stew, made worth eating again. Every riverside cook knows the trick.',
    },
    {
        name: "Drover's Pottage", level: 15, heal: 36, timer: 85, burnt: 'pottage',
        inputs: [['Cottage Loaf', 1], ['Cheese', 1], ['Garlic', 2]], tools: ['cauldron'],
        effect: 'timer', skill: 'Husbandry', magnitude: 1, seconds: 4 * 60 * 60,
        flavor: 'You are soaking bread into a garlic pottage.',
        description: 'Bread boiled soft with garlic. Eaten standing, usually while something escapes.',
    },
    {
        name: 'Wayfarer\'s Cake', level: 15, heal: 30, timer: 85, burnt: 'pastry',
        inputs: [['Honey Cake', 1], ['Hazelnuts', 2], ['Wild Mint', 1]], tools: ['hearth'],
        effect: 'travel', skill: null, magnitude: 8, seconds: 4 * 60 * 60,
        flavor: 'You are packing a cake to travel.',
        description: 'Dense, sweet and slow to stale. Made to be eaten a long way from here.',
    },
    {
        name: 'Hedgerow Basket', level: 16, heal: 38, timer: 90, burnt: null,
        inputs: [['Blackberries', 2], ['Hazelnuts', 2], ['Chanterelle Mushroom', 1], ['Honey', 1]],
        tools: ['cooking_knife'],
        effect: 'rare', skill: 'Foraging', magnitude: 2, seconds: 4 * 60 * 60,
        flavor: 'You are packing a basket from the hedge.',
        description: 'Everything the hedge gave up, laid out properly. Nothing here was cooked.',
    },
    {
        name: "Poacher's Supper", level: 16, heal: 40, timer: 90, burnt: 'pastry',
        inputs: [["Poacher's Pie", 1], ['Wild Mint', 1]], tools: ['hearth'],
        effect: 'double', skill: 'Hunting', magnitude: 3, seconds: 4 * 60 * 60,
        flavor: 'You are dressing a pie with mint.',
        description: 'Eaten quickly and away from the road, on the whole.',
    },
    {
        name: "Smith's Supper", level: 17, heal: 42, timer: 95, burnt: 'pottage',
        inputs: [['Roast Beef', 1], ['Cottage Loaf', 1], ['Garlic', 1]], tools: ['meat_cleaver'],
        effect: 'timer', skill: 'Smithing', magnitude: 1, seconds: 4 * 60 * 60,
        flavor: 'You are carving beef onto bread.',
        description: 'Beef and bread and nothing else. A smith does not want to think about lunch.',
    },
    {
        name: "Wright's Loaf", level: 17, heal: 42, timer: 95, burnt: 'pastry',
        inputs: [['Hazelnut Loaf', 1], ['Cheese', 1], ['Butter', 1]], tools: ['hearth'],
        effect: 'timer', skill: 'Carpentry', magnitude: 1, seconds: 4 * 60 * 60,
        flavor: 'You are splitting a nut loaf and buttering it.',
        description: 'Split, buttered and pressed back together. Travels in a toolbag without complaint.',
    },
];

const RUNGS = [1, 13, 25, 37, 50, 62, 75, 87, 100];
function tierOfLevel(level: number): number {
    let tier = 1;
    for (let i = 0; i < RUNGS.length; i++) if (level >= RUNGS[i]) tier = i + 1;
    return tier;
}

export async function up(knex: Knex): Promise<void> {
    const named = new Set<string>();
    for (const p of PROVISIONS) for (const [name] of p.inputs) named.add(name);
    for (const name of named) {
        const item = await knex('items').where({ name }).first();
        if (!item) {
            throw new Error(`Cooking part 5: no item named "${name}". The composite, honey and beekeeping migrations must run first.`);
        }
    }

    const rHat = (u: number) => 2000 * Math.pow(1.33, (u - 1) / 12);
    const targetFor = (u: number) => 1.8 * 1.10 * rHat(u);

    for (const p of PROVISIONS) {
        const existingItem = await knex('items').where({ name: p.name }).first();
        if (!existingItem) {
            await knex('items').insert({
                name: p.name,
                type: 'food',
                // 'provision' rather than dish or baked, so the cookhouse can
                // give them their own tab: they behave nothing like a heal.
                subtype: 'provision',
                tier: tierOfLevel(p.level),
                level_required: 1,
                heal_amount: p.heal,
                buff_effect: p.effect,
                buff_skill: p.skill,
                buff_magnitude: p.magnitude,
                buff_seconds: p.seconds,
                description: p.description,
                is_active: true,
            });
        }

        const existingRecipe = await knex('recipes').where({ name: p.name }).first();
        if (existingRecipe) continue;

        const count = p.inputs.length;
        const burnBase = p.burnt ? Math.round((30 / Math.sqrt(count)) * 10) / 10 : 0;
        const expectedShare = 1 - (burnBase / 100) / 2;
        const xp = Math.round((targetFor(p.level) * p.timer / 3600) / expectedShare);

        await knex('recipes').insert({
            skill: 'Cooking',
            name: p.name,
            output_item_name: p.name,
            output_qty: 1,
            inputs: JSON.stringify(p.inputs.map(([itemName, qty]) => ({ itemName, qty }))),
            required_level: p.level,
            timer_seconds: p.timer,
            xp,
            station: 'cooking',
            required_tools: JSON.stringify(p.tools),
            burn_base: p.burnt ? burnBase : null,
            burn_stop: p.burnt ? p.level + 12 : null,
            mode: 'active',
            for_skill: 'Cooking',
            flavor_text: p.flavor,
            is_active: true,
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const names = PROVISIONS.map(p => p.name);
    await knex('recipes').whereIn('name', names).delete();
    await knex('items').whereIn('name', names).delete();
}
